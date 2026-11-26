import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays, format, today } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { pickLang } from "../lib/checkin";
import {
  MSG_BOOKING_FIELDS,
  TEMPLATE_FIELDS,
  dueDay,
  guestLang,
  isDue,
  placeholders,
  render,
  send,
  timings,
  type Channel,
  type MsgBooking,
  type Template,
  type Timing,
} from "../lib/messages";
import type { Villas } from "../lib/villas";
import { Avatar, Icon } from "./Icon";

interface Sent {
  id: string;
  reservation_id: string;
  template_id: string;
  channel: string;
  sent_at: string;
}

function useTemplates() {
  const [list, setList] = useState<Template[]>([]);
  const refresh = useCallback(async () => {
    const { data } = await supabase.from("message_templates").select(TEMPLATE_FIELDS).is("deleted_at", null).order("sort");
    if (data) setList(data as Template[]);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { list, refresh };
}

const msgLangs = ["es", "en", "fr"] as const;

// The buttons that send one message: WhatsApp, email, or copy (to paste into Airbnb).
function SendButtons({ lang, tpl, booking, villa, msgLang, onSent }: { lang: Lang; tpl: Template; booking: MsgBooking; villa: string; msgLang: "es" | "en" | "fr"; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const go = async (c: Channel) => {
    setBusy(true);
    const ok = await send(c, tpl, booking, villa, msgLang);
    setBusy(false);
    setFailed(!ok);
    if (ok) onSent();
  };
  return (
    <span className="task-actions">
      {failed && <span className="error small">{t(lang, "sendFailed")}</span>}
      {booking.guest?.phone && <button type="button" className="small-btn" disabled={busy} onClick={() => go("whatsapp")}>WhatsApp</button>}
      {booking.guest?.email && <button type="button" className="small-btn" disabled={busy} onClick={() => go("email")}>{t(lang, "email")}</button>}
      <button type="button" className="small-btn" disabled={busy} onClick={() => go("copy")}>{t(lang, "copy")}</button>
    </span>
  );
}

// In a booking: every template, when it's due, whether it was sent, and a preview.
export function MessagesPanel({ lang, reservationId, villa }: { lang: Lang; reservationId: string; villa: string }) {
  const templates = useTemplates();
  const [booking, setBooking] = useState<MsgBooking | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const [msgLang, setMsgLang] = useState<"es" | "en" | "fr" | null>(null);
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(null);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([
      supabase.from("reservations").select(MSG_BOOKING_FIELDS).eq("id", reservationId).maybeSingle(),
      supabase.from("messages_sent").select("id, reservation_id, template_id, channel, sent_at").eq("reservation_id", reservationId).order("sent_at"),
    ]);
    if (b.data) setBooking(b.data as unknown as MsgBooking);
    setSent((s.data ?? []) as Sent[]);
  }, [reservationId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!booking || !templates.list.length) return null;
  const ml = msgLang ?? guestLang(booking);

  async function showPreview(tpl: Template) {
    if (preview?.id === tpl.id) return setPreview(null);
    // Preview without creating a check-in link as a side effect.
    const fake = { ...tpl, body: Object.fromEntries(Object.entries(tpl.body).map(([k, v]) => [k, (v ?? "").replaceAll("{checkin_link}", "[check-in]")])) };
    setPreview({ id: tpl.id, text: (await render(fake, booking!, villa, ml)).body });
  }

  async function undo(id: string) {
    await supabase.from("messages_sent").delete().eq("id", id);
    refresh();
  }

  return (
    <section className="checkin-box messages-box">
      <header>
        <span>{t(lang, "messages")}</span>
        <div className="segmented" aria-label={t(lang, "messageLanguage")}>
          {msgLangs.map((l) => (
            <button type="button" key={l} className={ml === l ? "on" : ""} onClick={() => setMsgLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>
      {booking.source === "airbnb" && <p className="muted small">{t(lang, "airbnbMessagesNote")}</p>}
      <ul className="list">
        {templates.list.filter((x) => x.active).map((tpl) => {
          const done = sent.filter((s) => s.template_id === tpl.id);
          const due = dueDay(tpl, booking);
          return (
            <li key={tpl.id} className="item msg-item">
              <span>
                <strong>{pickLang(tpl.name, lang)}</strong>
                <small>
                  {done.length
                    ? `${t(lang, "sentOn")} ${new Date(done[done.length - 1].sent_at).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${t(lang, `channel_${done[done.length - 1].channel}` as "channel_copy")}`
                    : due
                      ? `${t(lang, "dueOn")} ${format(due, loc, { day: "numeric", month: "short" })}`
                      : t(lang, "timing_manual")}
                </small>
              </span>
              <span className="spacer" />
              {done.length > 0 && <span className="pill ok">{t(lang, "sent")}</span>}
              {!done.length && isDue(tpl, booking, today()) && <span className="pill todo">{t(lang, "toSend")}</span>}
              <button type="button" className="small-btn" onClick={() => showPreview(tpl)}>{t(lang, "preview")}</button>
              <SendButtons lang={lang} tpl={tpl} booking={booking} villa={villa} msgLang={ml} onSent={refresh} />
              {done.length > 0 && (
                <button type="button" className="link" onClick={() => undo(done[done.length - 1].id)}>{t(lang, "undoSes")}</button>
              )}
              {preview?.id === tpl.id && <p className="pre msg-preview">{preview.text}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Today: the messages due for upcoming and current stays, not sent yet.
export function MessagesToSend({ lang, villas }: { lang: Lang; villas: Villas }) {
  const templates = useTemplates();
  const [bookings, setBookings] = useState<(MsgBooking & { unit_id: string })[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const day = today();

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("reservations")
      .select(MSG_BOOKING_FIELDS)
      .is("deleted_at", null)
      .eq("kind", "booking")
      .neq("status", "cancelled")
      .gte("check_out", addDays(day, -16))
      .lte("check_in", addDays(day, 61))
      .order("check_in");
    const list = (data ?? []) as unknown as (MsgBooking & { unit_id: string })[];
    setBookings(list);
    if (!list.length) return setSent(new Set());
    const s = await supabase.from("messages_sent").select("reservation_id, template_id").in("reservation_id", list.map((b) => b.id));
    setSent(new Set((s.data ?? []).map((x) => `${x.reservation_id}|${x.template_id}`)));
  }, [day]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Only bookings with a guest to write to.
  const due = bookings.filter((b) => b.guest).flatMap((b) => templates.list.filter((tpl) => isDue(tpl, b, day) && !sent.has(`${b.id}|${tpl.id}`)).map((tpl) => ({ b, tpl })));
  if (!due.length) return null;

  return (
    <section className="panel">
      <h2>
        <span className="h-icon"><Icon name="message" size={16} /></span>
        {t(lang, "messagesToSend")} <span className="count">{due.length}</span>
      </h2>
      <ul className="list">
        {due.map(({ b, tpl }) => {
          const name = [b.guest?.first_name, b.guest?.last_name].filter(Boolean).join(" ") || t(lang, "untitled");
          const villa = villas.unitName(b.unit_id);
          return (
            <li key={`${b.id}|${tpl.id}`} className="item">
              <div className="item-main">
                <Avatar name={name} color={villas.propertyOf(b.unit_id)?.color} />
                <span>
                  <strong>{pickLang(tpl.name, lang)} · {name}</strong>
                  <small>{villa} · {format(b.check_in, locale[lang], { day: "numeric", month: "short" })} → {format(b.check_out, locale[lang], { day: "numeric", month: "short" })}</small>
                </span>
              </div>
              <SendButtons lang={lang} tpl={tpl} booking={b} villa={villa} msgLang={guestLang(b)} onSent={refresh} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Settings: the family's templates, each with its moment and its text in three languages.
export function TemplatesEditor({ lang }: { lang: Lang }) {
  const templates = useTemplates();
  const [editLang, setEditLang] = useState<"es" | "en" | "fr">(lang);
  const [drafts, setDrafts] = useState<Record<string, Template>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const get = (tpl: Template) => drafts[tpl.id] ?? tpl;
  const set = (tpl: Template, patch: Partial<Template>) => setDrafts((d) => ({ ...d, [tpl.id]: { ...get(tpl), ...patch } }));
  const setText = (tpl: Template, field: "name" | "subject" | "body", value: string) => set(tpl, { [field]: { ...get(tpl)[field], [editLang]: value } });

  async function save(tpl: Template) {
    const x = get(tpl);
    const { error } = await supabase
      .from("message_templates")
      .update({ name: x.name, subject: x.subject, body: x.body, timing: x.timing, offset_days: x.offset_days, include_airbnb: x.include_airbnb, active: x.active })
      .eq("id", tpl.id);
    if (error) return;
    setDrafts(({ [tpl.id]: _, ...rest }) => rest);
    setSaved(tpl.id);
    templates.refresh();
  }

  async function add() {
    await supabase.from("message_templates").insert({ name: { [lang]: t(lang, "newTemplate") }, timing: "manual", sort: templates.list.length + 1 });
    templates.refresh();
  }

  return (
    <section className="settings-grid">
      <div className="page-head">
        <div>
          <h2 className="title">{t(lang, "messageTemplates")}</h2>
          <p className="muted">{t(lang, "templatesSub")}</p>
        </div>
        <div className="nav">
          <div className="segmented" aria-label={t(lang, "guide_edit_lang")}>
            {msgLangs.map((l) => (
              <button key={l} className={editLang === l ? "on" : ""} onClick={() => setEditLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={add}><Icon name="plus" size={16} /> {t(lang, "newTemplate")}</button>
        </div>
      </div>
      <p className="hint">{t(lang, "placeholdersHint")} {placeholders.map((p) => `{${p}}`).join(" ")}</p>
      {templates.list.map((tpl) => {
        const x = get(tpl);
        const dirty = !!drafts[tpl.id];
        return (
          <div key={tpl.id} className={`guide-edit${x.active ? "" : " faded"}`}>
            <div className="two">
              <label>{t(lang, "templateName")}<input value={x.name[editLang] ?? ""} placeholder={pickLang(x.name, lang)} onChange={(e) => setText(tpl, "name", e.target.value)} /></label>
              <label>
                {t(lang, "when")}
                <span className="inline">
                  <select value={x.timing} onChange={(e) => set(tpl, { timing: e.target.value as Timing })}>
                    {timings.map((k) => <option key={k} value={k}>{t(lang, `timing_${k}`)}</option>)}
                  </select>
                  {["after_booking", "before_arrival", "before_departure", "after_departure"].includes(x.timing) && (
                    <>
                      <input type="number" min={0} max={60} value={x.offset_days} onChange={(e) => set(tpl, { offset_days: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} style={{ width: 72 }} aria-label={t(lang, "daysWorked")} />
                      {t(lang, "daysWorked")}
                    </>
                  )}
                </span>
              </label>
            </div>
            <label>{t(lang, "subject")}<input value={x.subject[editLang] ?? ""} onChange={(e) => setText(tpl, "subject", e.target.value)} /></label>
            <label>{t(lang, "sectionBody")}<textarea rows={6} value={x.body[editLang] ?? ""} onChange={(e) => setText(tpl, "body", e.target.value)} /></label>
            <div className="task-row">
              <span className="nav">
                <label className="inline"><input type="checkbox" checked={x.active} onChange={(e) => set(tpl, { active: e.target.checked })} /> {t(lang, "active")}</label>
                <label className="inline"><input type="checkbox" checked={x.include_airbnb} onChange={(e) => set(tpl, { include_airbnb: e.target.checked })} /> {t(lang, "includeAirbnb")}</label>
              </span>
              <span className="nav">
                {saved === tpl.id && !dirty && <span className="ok-text">{t(lang, "saved")}</span>}
                <button className="primary" disabled={!dirty} onClick={() => save(tpl)}>{t(lang, "save")}</button>
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
