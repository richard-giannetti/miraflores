import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { addDays, daysBetween, format, today } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { eur } from "../lib/money";
import type { Villas } from "../lib/villas";
import { Avatar, Icon } from "./Icon";
import { QuoteBreakdown, planName, type Quote as Price } from "./Rates";

// Quotes (supabase/migrations/20261128100000_quotes.sql): a priced offer with a private link (/q/<token>) that
// holds the dates as an option booking until it expires; the guest accepts, then pays the deposit by transfer.

export const quoteUrl = (token: string) => `${location.origin}/q/${token}`;
type GuestLang = "es" | "en" | "fr";

export interface QuotePrefill {
  request_id?: string;
  unit_id?: string;
  check_in?: string;
  check_out?: string;
  adults?: number;
  children?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  language?: string;
  plan?: string;
  total?: number;
  message?: string;
}

interface OpenQuote {
  id: string;
  token: string;
  status: "sent" | "accepted";
  total: number;
  deposit: number;
  valid_until: string;
  reservation: {
    id: string;
    unit_id: string;
    status: string;
    check_in: string;
    check_out: string;
    adults: number;
    children: number;
    guest: { first_name: string; last_name: string; email: string | null; phone: string | null } | null;
  };
}

const message = (lang: Lang, q: { token: string; total: number }, name: string, villa: string) =>
  t(lang, "quoteShareText").replace("{name}", name).replace("{villa}", villa).replace("{total}", eur(Number(q.total), locale[lang])).replace("{url}", quoteUrl(q.token));

// The share buttons for a quote link: copy, WhatsApp, email.
function ShareLink({ lang, token, total, name, villa, phone, email }: { lang: Lang; token: string; total: number; name: string; villa: string; phone?: string | null; email?: string | null }) {
  const [copied, setCopied] = useState(false);
  const text = message(lang, { token, total }, name.split(" ")[0] ?? "", villa);
  const tel = (phone ?? "").replace(/[^\d]/g, "");
  return (
    <span className="task-actions">
      <button
        type="button"
        className="small-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(quoteUrl(token));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {}
        }}
      >
        {copied ? t(lang, "copied") : t(lang, "copyLink")}
      </button>
      {tel && (
        <a className="small-btn link-btn" href={`https://wa.me/${tel}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">
          WhatsApp
        </a>
      )}
      {email && (
        <a className="small-btn link-btn" href={`mailto:${email}?subject=${encodeURIComponent(`${t(lang, "quote")} · ${villa}`)}&body=${encodeURIComponent(text)}`}>
          {t(lang, "email")}
        </a>
      )}
    </span>
  );
}

// Today: open quotes (waiting for the guest, or accepted and waiting for the transfer), and "New quote".
export function QuotesPanel({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [list, setList] = useState<OpenQuote[]>([]);
  const [creating, setCreating] = useState<QuotePrefill | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("quotes")
      .select("id, token, status, total, deposit, valid_until, reservation:reservations(id, unit_id, status, check_in, check_out, adults, children, guest:guests(first_name, last_name, email, phone))")
      .in("status", ["sent", "accepted"])
      .order("valid_until");
    // An accepted quote whose booking is already confirmed is done.
    setList(((data ?? []) as unknown as OpenQuote[]).filter((q) => q.reservation.status === "option"));
  }, []);
  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("quotes")
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  async function confirm(q: OpenQuote) {
    setBusy(q.id);
    await supabase.from("reservations").update({ status: "confirmed" }).eq("id", q.reservation.id);
    setBusy(null);
    refresh();
  }
  async function cancel(q: OpenQuote) {
    setBusy(q.id);
    // Cancelling the booking frees the dates; the quote follows (database trigger).
    await supabase.from("reservations").update({ status: "cancelled" }).eq("id", q.reservation.id);
    setBusy(null);
    refresh();
  }

  return (
    <section className="panel quotes-panel">
      <h2>
        <span className="h-icon"><Icon name="invoices" size={16} /></span>
        {t(lang, "quotes")} {list.length > 0 && <span className="count">{list.length}</span>}
        <button className="small-btn push" onClick={() => setCreating({})}>
          <Icon name="plus" size={14} /> {t(lang, "newQuote")}
        </button>
      </h2>
      {list.length === 0 && <p className="muted small">{t(lang, "quotesEmpty")}</p>}
      <ul className="list">
        {list.map((q) => {
          const r = q.reservation;
          const name = [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(" ") || t(lang, "untitled");
          const villa = villas.unitName(r.unit_id);
          const expired = q.status === "sent" && new Date(q.valid_until) < new Date();
          return (
            <li key={q.id} className="item">
              <span className="item-main">
                <Avatar name={name} color={villas.propertyOf(r.unit_id)?.color} />
                <span>
                  <strong>{name}</strong>
                  <small>
                    {villa} · {format(r.check_in, loc, { day: "numeric", month: "short" })} → {format(r.check_out, loc, { day: "numeric", month: "short", year: "numeric" })} · {eur(Number(q.total), loc)}
                  </small>
                </span>
              </span>
              <span className={`pill ${q.status === "accepted" ? "ok" : expired ? "" : "todo"}`}>
                {q.status === "accepted"
                  ? t(lang, "quoteAcceptedPill").replace("{deposit}", eur(Number(q.deposit), loc))
                  : `${t(lang, "quoteWaiting")} ${new Date(q.valid_until).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
              </span>
              <span className="task-actions">
                <ShareLink lang={lang} token={q.token} total={q.total} name={name} villa={villa} phone={r.guest?.phone} email={r.guest?.email} />
                {q.status === "accepted" && (
                  <button className="small-btn primary" disabled={busy === q.id} onClick={() => confirm(q)}>
                    {t(lang, "depositReceived")}
                  </button>
                )}
                <button className="small-btn" disabled={busy === q.id} onClick={() => cancel(q)}>
                  {t(lang, "cancelQuote")}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {creating && (
        <QuoteDialog
          lang={lang}
          villas={villas}
          prefill={creating}
          onClose={() => setCreating(null)}
          onCreated={refresh}
        />
      )}
    </section>
  );
}

// Make a quote: villa, dates, guests, the guest's details, the price (from the rate calculation, editable), the
// deposit, how long it holds the dates and a personal note. Then the link to send.
export function QuoteDialog({ lang, villas, prefill, onClose, onCreated }: { lang: Lang; villas: Villas; prefill: QuotePrefill; onClose: () => void; onCreated: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = addDays(today(), 14);
  const [f, setF] = useState({
    unit_id: prefill.unit_id ?? villas.units[0]?.id ?? "",
    check_in: prefill.check_in ?? start,
    check_out: prefill.check_out ?? addDays(start, 7),
    adults: prefill.adults ?? 2,
    children: prefill.children ?? 0,
    first_name: prefill.first_name ?? "",
    last_name: prefill.last_name ?? "",
    email: prefill.email ?? "",
    phone: prefill.phone ?? "",
    language: (["es", "en", "fr"].includes(prefill.language ?? "") ? prefill.language : lang) as GuestLang,
    message: prefill.message ?? "",
  });
  const [price, setPrice] = useState<Price | null>(null);
  const [plan, setPlan] = useState(prefill.plan ?? "standard");
  const [total, setTotal] = useState(prefill.total != null ? String(prefill.total) : "");
  const [deposit, setDeposit] = useState("");
  const [depositPct, setDepositPct] = useState(30);
  const [validDays, setValidDays] = useState(3);
  const [created, setCreated] = useState<{ token: string } | null>(null);
  const [emailsOn, setEmailsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = locale[lang];
  useEffect(() => ref.current?.showModal(), []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const unit = villas.units.find((u) => u.id === f.unit_id);
  const propertyId = unit?.property_id;

  useEffect(() => {
    supabase.from("company_settings").select("quote_valid_days").maybeSingle().then(({ data }) => data && setValidDays(data.quote_valid_days));
    supabase.from("email_settings").select("enabled").maybeSingle().then(({ data }) => setEmailsOn(!!data?.enabled));
  }, []);
  useEffect(() => {
    if (propertyId) supabase.from("pricing").select("deposit_pct").eq("property_id", propertyId).maybeSingle().then(({ data }) => data && setDepositPct(Number(data.deposit_pct)));
  }, [propertyId]);

  // The rate calculation, as on the website; the chosen option fills in the total (still editable).
  useEffect(() => {
    if (!propertyId || f.check_out <= f.check_in) return setPrice(null);
    supabase
      .rpc("quote", { p_villa: propertyId, p_check_in: f.check_in, p_check_out: f.check_out, p_guests: f.adults + f.children })
      .then(({ data }) => setPrice(data as Price));
  }, [propertyId, f.check_in, f.check_out, f.adults, f.children]);
  const option = price?.available ? (price.options.find((o) => o.plan === plan) ?? price.options[0]) : undefined;
  useEffect(() => {
    if (option && prefill.total == null) setTotal(String(option.total));
  }, [option?.plan, option?.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalN = Number(total.replace(",", "."));
  useEffect(() => {
    if (totalN > 0) setDeposit(String(Math.round(totalN * depositPct) / 100));
  }, [totalN, depositPct]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.first_name.trim()) return setError(t(lang, "nameRequired"));
    if (!f.email.trim() && !f.phone.trim()) return setError(t(lang, "quoteNeedsContact"));
    if (!(totalN > 0)) return setError(t(lang, "amountRequired"));
    const dep = Number(deposit.replace(",", "."));
    if (!(dep >= 0 && dep <= totalN)) return setError(t(lang, "depositInvalid"));
    setBusy(true);
    const { data, error } = await supabase.rpc("create_quote", {
      p: {
        ...f,
        request_id: prefill.request_id ?? "",
        total: Math.round(totalN * 100) / 100,
        deposit: Math.round(dep * 100) / 100,
        valid_days: validDays,
        plan: option?.plan ?? "standard",
        plan_name: option ? (option.kind === "standard" ? {} : option.name) : {},
        refundable: option?.refundable ?? true,
        breakdown: price?.available ? { ...price, chosen: option } : {},
      },
    });
    setBusy(false);
    if (error) return setError(error.code === "23P01" ? t(lang, "overlap") : `${t(lang, "saveFailed")} ${error.message}`);
    setCreated({ token: (data as { token: string }).token });
    onCreated();
  }

  const name = [f.first_name, f.last_name].filter(Boolean).join(" ");
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      {created ? (
        <div className="dialog-body">
          <h2>{t(lang, "quoteCreated")}</h2>
          <p>{t(lang, "quoteCreatedHint").replace("{days}", String(validDays))}</p>
          {emailsOn && f.email && <p className="ok-text">{t(lang, "quoteEmailed").replace("{email}", f.email)}</p>}
          <p className="pre small">{quoteUrl(created.token)}</p>
          <ShareLink lang={lang} token={created.token} total={totalN} name={name} villa={unit?.name ?? ""} phone={f.phone} email={emailsOn ? null : f.email} />
          <div className="actions">
            <span className="spacer" />
            <a className="link-btn small-btn" href={`/q/${created.token}`} target="_blank" rel="noopener">{t(lang, "preview")}</a>
            <button className="primary" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h2>{t(lang, "newQuote")}</h2>
          <div className="two">
            <label>
              {t(lang, "villa")}
              <select value={f.unit_id} onChange={(e) => set("unit_id", e.target.value)}>
                {villas.units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t(lang, "guestLanguage")}
              <select value={f.language} onChange={(e) => set("language", e.target.value as GuestLang)}>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </label>
          </div>
          <div className="two">
            <label>{t(lang, "checkIn")}<input type="date" value={f.check_in} onChange={(e) => set("check_in", e.target.value)} /></label>
            <label>{t(lang, "checkOut")}<input type="date" value={f.check_out} min={addDays(f.check_in, 1)} onChange={(e) => set("check_out", e.target.value)} /></label>
          </div>
          <div className="two">
            <label>{t(lang, "adults")}<input type="number" min={1} value={f.adults} onChange={(e) => set("adults", Math.max(1, Number(e.target.value) || 1))} /></label>
            <label>{t(lang, "children")}<input type="number" min={0} value={f.children} onChange={(e) => set("children", Math.max(0, Number(e.target.value) || 0))} /></label>
          </div>
          <div className="two">
            <label>{t(lang, "firstName")}<input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></label>
            <label>{t(lang, "lastName")}<input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></label>
          </div>
          <div className="two">
            <label>{t(lang, "email")}<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label>{t(lang, "phone")}<input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          </div>

          <h3>{t(lang, "price")}</h3>
          {price?.available ? (
            <>
              <QuoteBreakdown lang={lang} q={{ ...price, options: [] }} />
              {price.options.length > 1 && (
                <label>
                  {t(lang, "rateOption")}
                  <select value={option?.plan} onChange={(e) => { setPlan(e.target.value); setTotal(""); }}>
                    {price.options.map((o) => (
                      <option key={o.plan} value={o.plan}>{planName(lang, o)} · {eur(o.total, loc)}{o.refundable ? "" : ` · ${t(lang, "noRefund")}`}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            price && <p className="hint">{t(lang, "quoteNoAutoPrice")} ({price.reason})</p>
          )}
          <div className="two">
            <label>{t(lang, "quoteTotal")}<input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
            <label>
              {t(lang, "deposit")} ({depositPct} %)
              <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </label>
          </div>
          <label>
            {t(lang, "holdDates")}
            <span className="inline">
              <input type="number" min={1} max={30} value={validDays} onChange={(e) => setValidDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} style={{ width: 72 }} />
              {t(lang, "days")} · {t(lang, "until")} {format(addDays(today(), validDays), loc, { day: "numeric", month: "long" })}
            </span>
          </label>
          <label>
            {t(lang, "quoteMessage")}
            <textarea rows={3} value={f.message} placeholder={t(lang, "quoteMessageHint")} onChange={(e) => set("message", e.target.value)} />
          </label>
          {f.check_out > f.check_in && <p className="hint">{daysBetween(f.check_in, f.check_out)} {t(lang, "nights")} · {t(lang, "quoteHoldsHint")}</p>}
          {error && <p className="error small">{error}</p>}
          <div className="actions">
            <span className="spacer" />
            <button type="button" onClick={() => ref.current?.close()}>{t(lang, "cancel")}</button>
            <button className="primary" disabled={busy}>{t(lang, "createQuote")}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
