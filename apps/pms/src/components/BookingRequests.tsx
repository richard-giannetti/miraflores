import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { daysBetween, format } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { eur } from "../lib/money";
import type { Villas } from "../lib/villas";
import { Avatar, Icon } from "./Icon";
import { QuoteBreakdown, planName, type Quote } from "./Rates";
import { QuoteDialog } from "./Quotes";

interface Request {
  id: string;
  property_id: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  plan: string;
  promo_code: string | null;
  quote: Quote;
  total: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  language: string;
  created_at: string;
}

// Today: "Book direct" requests from the website, waiting for the family. Accepting creates the guest and
// the booking (as an option, or confirmed); the family then writes to the guest as usual.
export function BookingRequests({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [list, setList] = useState<Request[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [quoting, setQuoting] = useState<Request | null>(null);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("booking_requests").select("*").eq("status", "new").order("created_at");
    if (data) setList(data as Request[]);
  }, []);
  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("booking-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_requests" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  async function accept(r: Request, status: "option" | "confirmed") {
    setBusy(r.id);
    setError(null);
    const { error } = await supabase.rpc("accept_booking_request", { p_id: r.id, p_status: status });
    setBusy(null);
    if (error) return setError({ id: r.id, text: error.message.includes("unavailable") ? t(lang, "requestTaken") : `${t(lang, "saveFailed")} ${error.message}` });
    refresh();
  }
  async function decline(r: Request) {
    setBusy(r.id);
    await supabase.from("booking_requests").update({ status: "declined", handled_at: new Date().toISOString() }).eq("id", r.id);
    setBusy(null);
    refresh();
  }

  if (!list.length) return null;
  return (
    <section className="panel requests">
      <h2>
        <span className="h-icon"><Icon name="arrive" size={16} /></span>
        {t(lang, "bookingRequests")} <span className="count">{list.length}</span>
      </h2>
      <ul className="list">
        {list.map((r) => {
          const villa = villas.properties.find((v) => v.id === r.property_id);
          const option = r.quote.options?.find((o) => o.plan === r.plan);
          return (
            <li key={r.id} className="item request">
              <button className="item-main" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <Avatar name={r.name} color={villa?.color} />
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {villa?.name} · {format(r.check_in, loc, { day: "numeric", month: "short" })} → {format(r.check_out, loc, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                    {daysBetween(r.check_in, r.check_out)} {t(lang, "nights")} · {r.adults + r.children} {t(lang, "guests")}
                  </small>
                </span>
              </button>
              <span className="amount">{eur(Number(r.total), loc)}</span>
              {open === r.id && (
                <div className="request-detail">
                  <p className="small">
                    {[r.email, r.phone, option && planName(lang, option), r.promo_code, r.language.toUpperCase()].filter(Boolean).join(" · ")}
                  </p>
                  {r.message && <p className="pre msg-preview">{r.message}</p>}
                  <QuoteBreakdown lang={lang} q={{ ...r.quote, options: option ? [option] : r.quote.options }} />
                  <p className="hint">
                    {t(lang, "requestedOn")} {new Date(r.created_at).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. {t(lang, "requestHint")}
                  </p>
                </div>
              )}
              {error?.id === r.id && <p className="error small">{error.text}</p>}
              <span className="task-actions">
                <button className="small-btn" disabled={busy === r.id} onClick={() => decline(r)}>{t(lang, "decline")}</button>
                <button className="small-btn" disabled={busy === r.id} onClick={() => setQuoting(r)}>{t(lang, "sendQuote")}</button>
                <button className="small-btn" disabled={busy === r.id} onClick={() => accept(r, "option")}>{t(lang, "acceptOption")}</button>
                <button className="small-btn primary" disabled={busy === r.id} onClick={() => accept(r, "confirmed")}>{t(lang, "acceptConfirm")}</button>
              </span>
            </li>
          );
        })}
      </ul>
      {quoting && (
        <QuoteDialog
          lang={lang}
          villas={villas}
          prefill={{
            request_id: quoting.id,
            unit_id: villas.units.find((u) => u.property_id === quoting.property_id)?.id,
            check_in: quoting.check_in,
            check_out: quoting.check_out,
            adults: quoting.adults,
            children: quoting.children,
            first_name: quoting.name.split(" ")[0],
            last_name: quoting.name.split(" ").slice(1).join(" "),
            email: quoting.email,
            phone: quoting.phone,
            language: quoting.language,
            plan: quoting.plan,
            total: Number(quoting.total),
          }}
          onClose={() => setQuoting(null)}
          onCreated={refresh}
        />
      )}
    </section>
  );
}
