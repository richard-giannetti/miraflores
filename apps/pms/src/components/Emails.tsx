import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { locale, t, type Key, type Lang } from "../lib/i18n";
import { validEmail } from "../lib/messages";

interface EmailSettings {
  enabled: boolean;
  from_name: string;
  from_address: string;
  reply_to: string;
  notify_to: string;
  notify_language: "es" | "en" | "fr";
  request_ack: boolean;
  notify_requests: boolean;
  notify_airbnb: boolean;
  notify_conflicts: boolean;
}
interface EmailRow {
  id: string;
  kind: string;
  to_address: string;
  subject: string;
  status: "queued" | "sending" | "sent" | "failed";
  error: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
}
const FIELDS = "enabled, from_name, from_address, reply_to, notify_to, notify_language, request_ack, notify_requests, notify_airbnb, notify_conflicts";
const LOG_FIELDS = "id, kind, to_address, subject, status, error, attempts, created_at, sent_at";

// The error code a function call returned ("not_configured"…), whatever shape it came in.
async function fnError(error: unknown, data: { error?: string } | null) {
  let code = data?.error ?? (error as Error | null)?.message ?? "";
  try {
    code = (await (error as { context?: Response }).context?.json())?.error ?? code;
  } catch {}
  return code;
}

function statusPill(lang: Lang, e: EmailRow) {
  // A failed email is retried a few times before it's given up.
  const final = e.status === "failed" && e.attempts >= 5;
  const cls = e.status === "sent" ? "ok" : e.status === "failed" ? (final ? "urgent" : "in_progress") : "todo";
  return <span className={`pill ${cls}`}>{t(lang, e.status === "failed" && !final ? "emailRetrying" : (`emailStatus_${e.status}` as Key))}</span>;
}

// Settings → Automatic emails: the master switch, sender and notifications, a test, and the latest emails.
export function EmailSettingsPanel({ lang }: { lang: Lang }) {
  const [saved, setSaved] = useState<EmailSettings | null>(null);
  const [f, setF] = useState<EmailSettings | null>(null);
  const [company, setCompany] = useState("");
  const [log, setLog] = useState<EmailRow[]>([]);
  const [testTo, setTestTo] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = locale[lang];

  const loadLog = useCallback(async () => {
    const { data } = await supabase.from("emails").select(LOG_FIELDS).order("created_at", { ascending: false }).limit(40);
    setLog((data ?? []) as EmailRow[]);
  }, []);
  useEffect(() => {
    supabase.from("email_settings").select(FIELDS).single().then(({ data }) => {
      setSaved(data as EmailSettings);
      setF(data as EmailSettings);
    });
    supabase.from("company_settings").select("email").maybeSingle().then(({ data }) => setCompany(data?.email ?? ""));
    supabase.auth.getUser().then(({ data }) => setTestTo(data.user?.email ?? ""));
    loadLog();
  }, [loadLog]);

  if (!f || !saved) return null;
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) => setF({ ...f, [k]: v });

  async function save() {
    if (!f) return;
    setNote(null);
    for (const a of [f.reply_to, f.notify_to]) if (a.trim() && !validEmail(a)) return setNote({ ok: false, text: t(lang, "badEmail") });
    if (!validEmail(f.from_address)) return setNote({ ok: false, text: t(lang, "badEmail") });
    const values = { ...f, reply_to: f.reply_to.trim(), notify_to: f.notify_to.trim(), from_address: f.from_address.trim(), from_name: f.from_name.trim() };
    const { error } = await supabase.from("email_settings").update(values).eq("id", true);
    if (error) return setNote({ ok: false, text: `${t(lang, "saveFailed")} ${error.message}` });
    setSaved(values);
    setF(values);
    setNote({ ok: true, text: t(lang, "saved") });
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const { data, error } = await supabase.functions.invoke("email-send", { body: { action: "test", to: testTo.trim(), lang } });
    setBusy(false);
    loadLog();
    if (error || data?.error) {
      const code = await fnError(error, data);
      return setNote({ ok: false, text: code === "not_configured" ? t(lang, "emailNotConfigured") : code === "bad_address" ? t(lang, "badEmail") : `${t(lang, "emailTestFailed")} ${code}` });
    }
    setNote(data.ok ? { ok: true, text: t(lang, "emailTestSent").replace("{to}", testTo.trim()) } : { ok: false, text: `${t(lang, "emailTestFailed")} ${data.error}` });
  }

  const check = (k: "request_ack" | "notify_requests" | "notify_airbnb" | "notify_conflicts", label: Key) => (
    <label className="inline">
      <input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {t(lang, label)}
    </label>
  );

  return (
    <section className="settings-grid">
      <div className="page-head">
        <div>
          <h2 className="title">{t(lang, "set_emails")}</h2>
          <p className="muted">{t(lang, "emailsSub")}</p>
        </div>
      </div>

      <div className="guide-edit">
        <label className="inline switch-row">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <strong>{t(lang, "emailsEnabled")}</strong>
        </label>
        <p className="muted small">{t(lang, f.enabled ? "emailsEnabledHint" : "emailsDisabledHint")}</p>

        <h3 className="subhead">{t(lang, "emailSender")}</h3>
        <div className="two">
          <label>
            {t(lang, "fromName")}
            <input value={f.from_name} onChange={(e) => set("from_name", e.target.value)} />
          </label>
          <label>
            {t(lang, "fromAddress")}
            <input type="email" value={f.from_address} onChange={(e) => set("from_address", e.target.value)} />
          </label>
        </div>
        <label>
          {t(lang, "replyTo")}
          <input type="email" value={f.reply_to} placeholder={company} onChange={(e) => set("reply_to", e.target.value)} />
          <small className="muted">{t(lang, "replyToHint")}</small>
        </label>

        <h3 className="subhead">{t(lang, "emailGuests")}</h3>
        {check("request_ack", "emailRequestAck")}
        <p className="muted small">{t(lang, "emailTemplatesHint")}</p>

        <h3 className="subhead">{t(lang, "emailFamily")}</h3>
        <div className="two">
          <label>
            {t(lang, "notifyTo")}
            <input type="email" value={f.notify_to} placeholder={company} onChange={(e) => set("notify_to", e.target.value)} />
          </label>
          <label>
            {t(lang, "notifyLanguage")}
            <select value={f.notify_language} onChange={(e) => set("notify_language", e.target.value as EmailSettings["notify_language"])}>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        {check("notify_requests", "emailNotifyRequests")}
        {check("notify_airbnb", "emailNotifyAirbnb")}
        {check("notify_conflicts", "emailNotifyConflicts")}

        <div className="form-end">
          <button className="primary" disabled={!dirty} onClick={save}>
            {t(lang, "save")}
          </button>
        </div>
      </div>

      <div className="guide-edit">
        <h3 className="subhead" style={{ marginTop: 0 }}>{t(lang, "emailTest")}</h3>
        <div className="inline add-row">
          <input className="grow-input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label={t(lang, "email")} />
          <button disabled={busy || !validEmail(testTo)} onClick={test}>
            {t(lang, "sendTest")}
          </button>
        </div>
        {note && <p className={note.ok ? "ok-text" : "error small"}>{note.text}</p>}
      </div>

      <div className="panel">
        <h2>
          {t(lang, "emailLog")}
          <button className="small-btn push" onClick={loadLog}>
            {t(lang, "refresh")}
          </button>
        </h2>
        {log.length === 0 ? (
          <p className="muted small">{t(lang, "emailLogEmpty")}</p>
        ) : (
          <ul className="list">
            {log.map((e) => (
              <li key={e.id} className="item">
                <span>
                  <strong>{e.subject || t(lang, `emailKind_${e.kind}` as Key)}</strong>
                  <small>
                    {[
                      new Date(e.sent_at ?? e.created_at).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                      e.to_address,
                      t(lang, `emailKind_${e.kind}` as Key),
                      e.status === "failed" && e.error,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span className="spacer" />
                {statusPill(lang, e)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// In a booking: the emails the PMS sent (or is about to send) for it.
export function EmailLog({ lang, reservationId }: { lang: Lang; reservationId: string }) {
  const [list, setList] = useState<EmailRow[]>([]);
  useEffect(() => {
    supabase
      .from("emails")
      .select(LOG_FIELDS)
      .eq("reservation_id", reservationId)
      .eq("kind", "template")
      .order("created_at")
      .then(({ data }) => setList((data ?? []) as EmailRow[]));
  }, [reservationId]);
  if (!list.length) return null;
  return (
    <div className="email-log">
      <h3 className="subhead">{t(lang, "emailLog")}</h3>
      <ul className="list">
        {list.map((e) => (
          <li key={e.id} className="item">
            <span>
              <strong>{e.subject || "…"}</strong>
              <small>
                {[new Date(e.sent_at ?? e.created_at).toLocaleString(locale[lang], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), e.to_address, e.status === "failed" && e.error]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <span className="spacer" />
            {statusPill(lang, e)}
          </li>
        ))}
      </ul>
    </div>
  );
}
