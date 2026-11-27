// PMS → Airbnb: one unit's bookings and blocks as an iCal calendar, at a secret link
// (…/ical-export/<units.ical_token>.ics: Airbnb only accepts links ending in .ics; the older ?t=<token> form
// still works). Airbnb imports it, so nights booked directly or blocked here close on Airbnb too. Bookings that
// came from Airbnb are left out: Airbnb already knows them.
// Public (no sign-in): the unguessable token is the key, and the feed shows only dates, no names.
import { createClient } from "npm:@supabase/supabase-js@2";

const ymd = (d: string) => d.replaceAll("-", "");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? url.pathname.match(/\/([0-9a-f-]{36})\.ics$/i)?.[1] ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: unit } = await admin.from("units").select("id, name").eq("ical_token", token).is("deleted_at", null).maybeSingle();
  if (!unit) return new Response("Not found", { status: 404 });

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await admin
    .from("reservations")
    .select("id, kind, check_in, check_out")
    .eq("unit_id", unit.id)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .neq("source", "airbnb")
    .gte("check_out", since);

  const now = stamp();
  const events = (rows ?? []).map((r) =>
    [
      "BEGIN:VEVENT",
      `UID:${r.id}@pms.miraflorescostatropical.com`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${ymd(r.check_in)}`,
      `DTEND;VALUE=DATE:${ymd(r.check_out)}`,
      `SUMMARY:${r.kind === "block" ? "Blocked" : "Booked"} (Miraflores)`,
      "END:VEVENT",
    ].join("\r\n"),
  );
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Miraflores Costa Tropical//PMS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${unit.name} (Miraflores)`,
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `inline; filename="${unit.id}.ics"` },
  });
});
