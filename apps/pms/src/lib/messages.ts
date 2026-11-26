import { supabase } from "./supabase";
import { addDays, daysBetween, format } from "./dates";
import { checkinUrl, pickLang, type Multi } from "./checkin";
import { locale, type Lang } from "./i18n";

// Guest message templates (supabase/migrations/20261127110000_messages.sql).

export type Timing = "manual" | "after_booking" | "before_arrival" | "on_arrival" | "before_departure" | "after_departure";
export const timings: Timing[] = ["manual", "after_booking", "before_arrival", "on_arrival", "before_departure", "after_departure"];
export const placeholders = ["name", "villa", "arrival", "departure", "nights", "guests", "checkin_link"] as const;

export interface Template {
  id: string;
  name: Multi;
  timing: Timing;
  offset_days: number;
  subject: Multi;
  body: Multi;
  include_airbnb: boolean;
  active: boolean;
  sort: number;
}
export const TEMPLATE_FIELDS = "id, name, timing, offset_days, subject, body, include_airbnb, active, sort";

// What a message needs to know about a booking.
export interface MsgBooking {
  id: string;
  source: string;
  status: string;
  check_in: string;
  check_out: string;
  created_at: string;
  adults: number;
  children: number;
  guest: { first_name: string; last_name: string; email: string | null; phone: string | null; language: string | null } | null;
}
export const MSG_BOOKING_FIELDS = "id, unit_id, source, status, check_in, check_out, created_at, adults, children, guest:guests(first_name, last_name, email, phone, language)";

// The day a template is due for a booking (null for manual ones).
export function dueDay(tpl: Template, r: MsgBooking) {
  switch (tpl.timing) {
    case "after_booking": return addDays(r.created_at.slice(0, 10), tpl.offset_days);
    case "before_arrival": return addDays(r.check_in, -tpl.offset_days);
    case "on_arrival": return r.check_in;
    case "before_departure": return addDays(r.check_out, -tpl.offset_days);
    case "after_departure": return addDays(r.check_out, tpl.offset_days);
    default: return null;
  }
}

// Due today or earlier, and still worth sending (an arrival message after the guests left isn't).
export function isDue(tpl: Template, r: MsgBooking, today: string) {
  const due = dueDay(tpl, r);
  if (!tpl.active || !due || due > today || r.status === "cancelled") return false;
  if (r.source === "airbnb" && !tpl.include_airbnb) return false;
  if (tpl.timing === "after_departure") return daysBetween(due, today) <= 14;
  if (tpl.timing === "before_departure") return today <= r.check_out;
  return today <= r.check_in;
}

// The guest's language when known (es/en/fr), else English.
export function guestLang(r: MsgBooking): "es" | "en" | "fr" {
  const l = (r.guest?.language ?? "").trim().toLowerCase();
  if (/^(es|spa|espa)/.test(l)) return "es";
  if (/^(fr|fra|fre)/.test(l)) return "fr";
  return "en";
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);

// The check-in link, created on the spot if the booking doesn't have one yet.
async function checkinLink(reservationId: string) {
  const found = await supabase.from("checkins").select("token").eq("reservation_id", reservationId).maybeSingle();
  if (found.data) return checkinUrl(found.data.token);
  const made = await supabase.from("checkins").insert({ reservation_id: reservationId }).select("token").single();
  return made.data ? checkinUrl(made.data.token) : "";
}

export async function render(tpl: Template, r: MsgBooking, villa: string, msgLang: "es" | "en" | "fr") {
  const body = pickLang(tpl.body, msgLang);
  const loc = locale[msgLang as Lang];
  const values: Record<string, string> = {
    name: r.guest?.first_name || "",
    villa,
    arrival: format(r.check_in, loc, { weekday: "long", day: "numeric", month: "long" }),
    departure: format(r.check_out, loc, { weekday: "long", day: "numeric", month: "long" }),
    nights: String(daysBetween(r.check_in, r.check_out)),
    guests: String(r.adults + r.children),
    checkin_link: body.includes("{checkin_link}") ? await checkinLink(r.id) : "",
  };
  return { subject: fill(pickLang(tpl.subject, msgLang), values), body: fill(body, values) };
}

export type Channel = "whatsapp" | "email" | "copy";

// Opens the family's own WhatsApp or mail app with the text ready, and records the send.
export async function send(channel: Channel, tpl: Template, r: MsgBooking, villa: string, msgLang: "es" | "en" | "fr") {
  // WhatsApp opens in a new tab, opened before any await (browsers only allow it straight after the click).
  // Email hands over to the mail app without leaving the page.
  const w = channel === "whatsapp" ? window.open("", "_blank") : null;
  const { subject, body } = await render(tpl, r, villa, msgLang);
  if (channel === "copy") await navigator.clipboard.writeText(body);
  else {
    const phone = (r.guest?.phone ?? "").replace(/[^\d]/g, "");
    const url =
      channel === "whatsapp"
        ? `https://wa.me/${phone}?text=${encodeURIComponent(body)}`
        : `mailto:${r.guest?.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (w) w.location.href = url;
    else location.href = url;
  }
  return supabase.from("messages_sent").insert({ reservation_id: r.id, template_id: tpl.id, channel });
}
