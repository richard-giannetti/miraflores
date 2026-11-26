// Airbnb → PMS: reads each unit's Airbnb calendar (iCal) and brings its reservations onto the PMS calendar.
// - A new Airbnb reservation becomes a booking (source airbnb), keyed by its confirmation code.
// - A booking an owner typed in by hand with the same villa and dates is linked instead of duplicated.
// - Changed dates are moved; a reservation that disappears from the feed (before its stay ends) is cancelled.
// - One that overlaps something already in the PMS can't be saved (the database refuses double bookings):
//   it's recorded as a conflict for the family to sort out.
// Airbnb's "Not available" events are skipped: they are host blocks, often our own export coming back.
// Called every hour by pg_cron (x-sync-secret header) or by an owner/manager ("Sync now").
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Event {
  ref: string;
  checkIn: string;
  checkOut: string;
}

// The villas' local date, as the calendar uses.
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const isoDate = (v: string) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;

// Reserved stays from an iCal feed. Lines folded with a leading space are joined first (RFC 5545).
export function parseIcal(text: string): Event[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const events: Event[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART?.match(/\d{8}/)?.[0];
      const end = cur.DTEND?.match(/\d{8}/)?.[0];
      const summary = (cur.SUMMARY ?? "").toLowerCase();
      const blocked = summary.includes("not available") || summary.includes("no disponible") || summary.includes("blocked");
      if (start && end && !blocked) {
        const code = `${cur.DESCRIPTION ?? ""} ${cur.SUMMARY ?? ""}`.match(/\bHM[A-Z0-9]{6,12}\b/)?.[0];
        events.push({ ref: code ?? cur.UID ?? `${start}-${end}`, checkIn: isoDate(start), checkOut: isoDate(end) });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i > 0) cur[line.slice(0, i).split(";")[0].toUpperCase()] = line.slice(i + 1);
    }
  }
  return events.filter((e) => e.checkOut > e.checkIn);
}

type Admin = ReturnType<typeof createClient>;

async function syncUnit(admin: Admin, unit: { id: string; name: string; airbnb_ical_url: string }) {
  const result = { unit_id: unit.id, ok: true, created: 0, updated: 0, cancelled: 0, conflicts: [] as Event[], error: null as string | null };
  try {
    const res = await fetch(unit.airbnb_ical_url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Miraflores-PMS/1.0" } });
    if (!res.ok) throw new Error(`Airbnb answered ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Not an iCal calendar");
    const day = today();
    const events = parseIcal(text).filter((e) => e.checkOut >= day);

    const { data: existing, error } = await admin
      .from("reservations")
      .select("id, check_in, check_out, status, external_ref")
      .eq("unit_id", unit.id)
      .eq("source", "airbnb")
      .eq("kind", "booking")
      .is("deleted_at", null)
      .gte("check_out", day);
    if (error) throw error;
    const rows = existing ?? [];

    for (const ev of events) {
      const known = rows.find((r) => r.external_ref === ev.ref);
      if (known) {
        const moved = known.check_in !== ev.checkIn || known.check_out !== ev.checkOut;
        if (moved || known.status === "cancelled") {
          const { error } = await admin
            .from("reservations")
            .update({ check_in: ev.checkIn, check_out: ev.checkOut, ...(known.status === "cancelled" && { status: "confirmed" }) })
            .eq("id", known.id);
          if (error) result.conflicts.push(ev);
          else result.updated++;
        }
        continue;
      }
      // Typed in by hand before the sync existed: same villa, same dates, no code yet.
      const typed = rows.find((r) => !r.external_ref && r.check_in === ev.checkIn && r.check_out === ev.checkOut && r.status !== "cancelled");
      if (typed) {
        await admin.from("reservations").update({ external_ref: ev.ref }).eq("id", typed.id);
        typed.external_ref = ev.ref;
        result.updated++;
        continue;
      }
      const { error } = await admin.from("reservations").insert({
        unit_id: unit.id,
        kind: "booking",
        source: "airbnb",
        status: "confirmed",
        check_in: ev.checkIn,
        check_out: ev.checkOut,
        external_ref: ev.ref,
        title: ev.ref.startsWith("HM") ? `Airbnb ${ev.ref}` : "Airbnb",
        notes: "Imported from the Airbnb calendar.",
      });
      if (error) result.conflicts.push(ev);
      else result.created++;
    }

    // Gone from Airbnb before the stay ended: cancelled there.
    const refs = new Set(events.map((e) => e.ref));
    for (const r of rows) {
      if (r.external_ref && !refs.has(r.external_ref) && r.status !== "cancelled" && r.status !== "checked_out" && r.check_out > day) {
        await admin.from("reservations").update({ status: "cancelled" }).eq("id", r.id);
        result.cancelled++;
      }
    }
  } catch (e) {
    result.ok = false;
    result.error = (e as Error).message;
  }
  await admin.from("ical_sync_runs").insert(result);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // The scheduler's secret, or a signed-in owner or manager.
  const secret = req.headers.get("x-sync-secret");
  let allowed = false;
  if (secret) allowed = (await admin.rpc("ical_sync_secret_ok", { p_secret: secret })).data === true;
  else {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    const { data } = await admin.auth.getUser(token);
    if (data.user) {
      const { data: p } = await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      allowed = p?.role === "owner" || p?.role === "manager";
    }
  }
  if (!allowed) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  let q = admin.from("units").select("id, name, airbnb_ical_url").not("airbnb_ical_url", "is", null).is("deleted_at", null);
  if (body.unit_id) q = q.eq("id", body.unit_id);
  const { data: units } = await q;
  const results = [];
  for (const u of units ?? []) results.push(await syncUnit(admin, u as { id: string; name: string; airbnb_ical_url: string }));
  return json({ results });
});
