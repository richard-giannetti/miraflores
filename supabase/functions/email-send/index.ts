// Sends the queued emails (public.emails) through Resend. Woken by the database right after something is queued
// and every 5 minutes (x-email-secret, kept in Vault), or by an owner or manager for a test email.
// Without the RESEND_API_KEY secret nothing is taken from the queue: it waits until the key is set.
// Each email is rendered here, at send time, in the guest's (or the family's) language.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PMS = "https://pms.miraflorescostatropical.com";
type L = "es" | "en" | "fr";
const locales: Record<L, string> = { es: "es-ES", en: "en-GB", fr: "fr-FR" };
type Multi = Partial<Record<L, string>>;
const pick = (m: Multi | null | undefined, l: L) => (m?.[l] || m?.en || m?.es || m?.fr || "").trim();
const fill = (text: string, v: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const day = (d: string, l: L) => new Intl.DateTimeFormat(locales[l], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const short = (d: string, l: L) => new Intl.DateTimeFormat(locales[l], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const nights = (a: string, b: string) => String(Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
const money = (n: number, l: L) => Number(n).toLocaleString(locales[l], { style: "currency", currency: "EUR" });

// Built-in texts (the guest templates come from Settings → Messages).
const T = {
  ackSubject: {
    es: "Hemos recibido tu solicitud · {villa}",
    en: "We've received your request · {villa}",
    fr: "Nous avons bien reçu votre demande · {villa}",
  },
  ackBody: {
    es: "Hola {name}:\n\nGracias por tu solicitud para {villa}, del {arrival} al {departure} ({nights} noches, {guests} personas). Importe indicado: {total}.\n\nTodavía no es una reserva confirmada: te responderemos muy pronto para confirmarla. Si tienes cualquier pregunta, responde a este email.\n\nUn saludo,\nMiraflores Costa Tropical",
    en: "Hi {name},\n\nThank you for your request for {villa}, from {arrival} to {departure} ({nights} nights, {guests} guests). Price shown: {total}.\n\nThis isn't a confirmed booking yet: we'll get back to you very soon to confirm it. If you have any questions, just reply to this email.\n\nKind regards,\nMiraflores Costa Tropical",
    fr: "Bonjour {name},\n\nMerci pour votre demande pour {villa}, du {arrival} au {departure} ({nights} nuits, {guests} personnes). Prix indiqué : {total}.\n\nCe n'est pas encore une réservation confirmée : nous revenons vers vous très vite pour la confirmer. Pour toute question, répondez simplement à cet e-mail.\n\nBien cordialement,\nMiraflores Costa Tropical",
  },
  reqSubject: { es: "Nueva solicitud web · {villa} · {arrival}", en: "New website request · {villa} · {arrival}", fr: "Nouvelle demande web · {villa} · {arrival}" },
  reqBody: {
    es: "Nueva solicitud de reserva desde la web.\n\n{name} · {email} · {phone}\n{villa}: {arrival} → {departure} ({nights} noches), {guests} personas\nImporte indicado: {total}\n\n{message}\n\nAceptar o rechazar en Hoy: {link}\n(Responder a este email escribe directamente al huésped.)",
    en: "New booking request from the website.\n\n{name} · {email} · {phone}\n{villa}: {arrival} → {departure} ({nights} nights), {guests} guests\nPrice shown: {total}\n\n{message}\n\nAccept or decline on Today: {link}\n(Replying to this email writes straight to the guest.)",
    fr: "Nouvelle demande de réservation depuis le site.\n\n{name} · {email} · {phone}\n{villa} : {arrival} → {departure} ({nights} nuits), {guests} personnes\nPrix indiqué : {total}\n\n{message}\n\nAccepter ou refuser dans Aujourd'hui : {link}\n(Répondre à cet e-mail écrit directement au voyageur.)",
  },
  airbnbSubject: { es: "Nueva reserva Airbnb · {villa} · {arrival}", en: "New Airbnb booking · {villa} · {arrival}", fr: "Nouvelle réservation Airbnb · {villa} · {arrival}" },
  airbnbBody: {
    es: "Airbnb tiene una reserva nueva, ya está en el calendario del PMS.\n\n{villa}: {arrival} → {departure} ({nights} noches)\nCódigo: {code}\n\nCalendario: {link}",
    en: "Airbnb has a new booking; it's already in the PMS calendar.\n\n{villa}: {arrival} → {departure} ({nights} nights)\nCode: {code}\n\nCalendar: {link}",
    fr: "Airbnb a une nouvelle réservation ; elle est déjà dans le calendrier du PMS.\n\n{villa} : {arrival} → {departure} ({nights} nuits)\nCode : {code}\n\nCalendrier : {link}",
  },
  conflictSubject: { es: "⚠ Conflicto con Airbnb · {villa}", en: "⚠ Airbnb conflict · {villa}", fr: "⚠ Conflit avec Airbnb · {villa}" },
  conflictBody: {
    es: "Airbnb tiene una reserva en fechas que ya están ocupadas en el PMS. No se ha podido añadir: revisadlo cuanto antes.\n\n{list}\n\nSincronización Airbnb: {link}",
    en: "Airbnb has a booking on dates already taken in the PMS. It couldn't be added: please check it as soon as possible.\n\n{list}\n\nAirbnb sync: {link}",
    fr: "Airbnb a une réservation sur des dates déjà occupées dans le PMS. Elle n'a pas pu être ajoutée : vérifiez au plus vite.\n\n{list}\n\nSynchronisation Airbnb : {link}",
  },
  testSubject: { es: "Email de prueba · Miraflores PMS", en: "Test email · Miraflores PMS", fr: "E-mail de test · Miraflores PMS" },
  testBody: {
    es: "Si lees esto, los emails automáticos del PMS funcionan.\n\nRemitente: {from}\nLas respuestas van a: {reply}",
    en: "If you can read this, the PMS's automatic emails work.\n\nSender: {from}\nReplies go to: {reply}",
    fr: "Si vous lisez ceci, les e-mails automatiques du PMS fonctionnent.\n\nExpéditeur : {from}\nLes réponses vont à : {reply}",
  },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#7a5a2a">${u}</a>`);
function html(text: string) {
  const paras = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7">
<div style="background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px 28px 14px;color:#1d1d1f;font-size:15px;line-height:1.55">
<img src="${PMS}/logo.png" alt="Grupo Miraflores" width="150" style="display:block;margin:0 0 22px;border:0">
${paras}
</div>
<p style="text-align:center;color:#86868b;font-size:12px;margin:16px 0 0">Miraflores Costa Tropical · <a href="https://miraflorescostatropical.com" style="color:#86868b">miraflorescostatropical.com</a></p>
</div></body></html>`;
}

interface Email {
  id: string;
  kind: "template" | "request_ack" | "notify_request" | "notify_airbnb" | "notify_conflict" | "test";
  to_address: string;
  language: L;
  reservation_id: string | null;
  template_id: string | null;
  request_id: string | null;
  unit_id: string | null;
  data: Record<string, unknown>;
}
interface Settings {
  from_name: string;
  from_address: string;
  reply_to: string;
}
type Built = { subject: string; text: string; replyTo?: string } | { skip: string };

async function build(admin: SupabaseClient, e: Email, s: Settings & { replyDefault: string }): Promise<Built> {
  const l = e.language;
  if (e.kind === "test") {
    return { subject: T.testSubject[l], text: fill(T.testBody[l], { from: `${s.from_name} <${s.from_address}>`, reply: s.replyDefault }) };
  }
  if (e.kind === "template") {
    const [{ data: tpl }, { data: r }] = await Promise.all([
      admin.from("message_templates").select("subject, body, active, deleted_at").eq("id", e.template_id).maybeSingle(),
      admin.from("reservations").select("id, status, deleted_at, check_in, check_out, adults, children, guest:guests(first_name), unit:units(name)").eq("id", e.reservation_id).maybeSingle(),
    ]);
    if (!tpl || !tpl.active || tpl.deleted_at) return { skip: "template switched off" };
    if (!r || r.deleted_at || r.status === "cancelled") return { skip: "booking cancelled" };
    // Someone sent it by hand in the meantime.
    const { count } = await admin.from("messages_sent").select("id", { count: "exact", head: true }).eq("reservation_id", r.id).eq("template_id", e.template_id);
    if (count) return { skip: "already sent by hand" };
    const body = pick(tpl.body as Multi, l);
    let link = "";
    if (body.includes("{checkin_link}")) {
      const found = await admin.from("checkins").select("token").eq("reservation_id", r.id).maybeSingle();
      const token = found.data?.token ?? (await admin.from("checkins").insert({ reservation_id: r.id }).select("token").single()).data?.token;
      if (!token) return { skip: "no check-in link" };
      link = `${PMS}/c/${token}`;
    }
    const guest = r.guest as unknown as { first_name: string } | null;
    const unit = r.unit as unknown as { name: string };
    const v = {
      name: guest?.first_name ?? "",
      villa: unit.name,
      arrival: day(r.check_in, l),
      departure: day(r.check_out, l),
      nights: nights(r.check_in, r.check_out),
      guests: String(r.adults + r.children),
      checkin_link: link,
    };
    return { subject: fill(pick(tpl.subject as Multi, l), v), text: fill(body, v) };
  }
  if (e.kind === "request_ack" || e.kind === "notify_request") {
    const { data: q } = await admin.from("booking_requests").select("*, property:properties(name)").eq("id", e.request_id).maybeSingle();
    if (!q) return { skip: "request not found" };
    const v = {
      name: e.kind === "request_ack" ? q.name.split(" ")[0] : q.name,
      email: q.email,
      phone: q.phone || "—",
      villa: (q.property as { name: string }).name,
      arrival: e.kind === "request_ack" ? day(q.check_in, l) : short(q.check_in, l),
      departure: e.kind === "request_ack" ? day(q.check_out, l) : short(q.check_out, l),
      nights: nights(q.check_in, q.check_out),
      guests: String(q.adults + q.children),
      total: money(q.total, l),
      message: q.message ? `“${q.message}”` : "",
      link: `${PMS}/#today`,
    };
    return e.kind === "request_ack"
      ? { subject: fill(T.ackSubject[l], v), text: fill(T.ackBody[l], v) }
      : { subject: fill(T.reqSubject[l], v), text: fill(T.reqBody[l], v), replyTo: q.email };
  }
  if (e.kind === "notify_airbnb") {
    const { data: r } = await admin.from("reservations").select("check_in, check_out, external_ref, unit:units(name)").eq("id", e.reservation_id).maybeSingle();
    if (!r) return { skip: "booking not found" };
    const v = {
      villa: (r.unit as unknown as { name: string }).name,
      arrival: short(r.check_in, l),
      departure: short(r.check_out, l),
      nights: nights(r.check_in, r.check_out),
      code: r.external_ref ?? "",
      link: `${PMS}/#calendar`,
    };
    return { subject: fill(T.airbnbSubject[l], v), text: fill(T.airbnbBody[l], v) };
  }
  if (e.kind === "notify_conflict") {
    const { data: u } = await admin.from("units").select("name").eq("id", e.unit_id).maybeSingle();
    const list = ((e.data.conflicts ?? []) as { ref: string; checkIn: string; checkOut: string }[])
      .map((c) => `• ${c.ref}: ${short(c.checkIn, l)} → ${short(c.checkOut, l)}`)
      .join("\n");
    const v = { villa: u?.name ?? "", list, link: `${PMS}/#settings/airbnb` };
    return { subject: fill(T.conflictSubject[l], v), text: fill(T.conflictBody[l], v) };
  }
  return { skip: "unknown kind" };
}

async function sendOne(admin: SupabaseClient, key: string, e: Email, s: Settings & { replyDefault: string }) {
  let built: Built;
  try {
    built = await build(admin, e, s);
  } catch (err) {
    built = { skip: `render: ${(err as Error).message}` };
  }
  if ("skip" in built) {
    // Nothing to send any more: close it without retrying.
    await admin.from("emails").update({ status: "failed", error: built.skip, attempts: 5 }).eq("id", e.id);
    return { ok: false, error: built.skip };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": e.id },
    body: JSON.stringify({
      from: `${s.from_name} <${s.from_address}>`,
      to: [e.to_address],
      reply_to: built.replyTo ?? s.replyDefault,
      subject: built.subject,
      text: built.text,
      html: html(built.text),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = `${res.status} ${out?.message ?? out?.name ?? ""}`.trim();
    await admin.from("emails").update({ status: "failed", subject: built.subject, error }).eq("id", e.id);
    return { ok: false, error };
  }
  await admin.from("emails").update({ status: "sent", subject: built.subject, provider_id: out.id, sent_at: new Date().toISOString(), error: null }).eq("id", e.id);
  // A template sent by email counts as sent, so "Messages to send" on Today drops it.
  if (e.kind === "template") await admin.from("messages_sent").insert({ reservation_id: e.reservation_id, template_id: e.template_id, channel: "email", sent_by: null });
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // The scheduler's secret, or a signed-in owner or manager.
  const secret = req.headers.get("x-email-secret");
  let manager = false;
  let allowed = false;
  if (secret) allowed = (await admin.rpc("email_secret_ok", { p_secret: secret })).data === true;
  else {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    const { data } = await admin.auth.getUser(token);
    if (data.user) {
      const { data: p } = await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      manager = allowed = p?.role === "owner" || p?.role === "manager";
    }
  }
  if (!allowed) return json({ error: "forbidden" }, 403);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "not_configured" }, 503);
  const [{ data: st }, { data: co }] = await Promise.all([
    admin.from("email_settings").select("from_name, from_address, reply_to").single(),
    admin.from("company_settings").select("email").single(),
  ]);
  const s = { ...(st as Settings), replyDefault: (st?.reply_to || co?.email || st?.from_address) as string };

  const body = await req.json().catch(() => ({}));
  if (body.action === "test") {
    if (!manager) return json({ error: "forbidden" }, 403);
    const to = String(body.to ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "bad_address" }, 400);
    const lang: L = ["es", "en", "fr"].includes(body.lang) ? body.lang : "es";
    const { data: e, error } = await admin.from("emails").insert({ kind: "test", to_address: to, language: lang, status: "sending", attempts: 1 }).select("*").single();
    if (error) return json({ error: error.message }, 500);
    return json(await sendOne(admin, key, e as Email, s));
  }

  const { data: batch } = await admin.rpc("claim_emails", { p_limit: 25 });
  let sent = 0;
  for (const e of (batch ?? []) as Email[]) {
    if ((await sendOne(admin, key, e, s)).ok) sent++;
    // Resend allows a few requests per second.
    await new Promise((r) => setTimeout(r, 600));
  }
  return json({ claimed: (batch ?? []).length, sent });
});
