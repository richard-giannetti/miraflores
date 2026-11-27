import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays, format } from "../lib/dates";
import { locale, t, type Key, type Lang } from "../lib/i18n";
import { eur } from "../lib/money";

interface Payment {
  id: string;
  token: string;
  kind: "deposit" | "balance" | "full" | "extra" | "other";
  description: string;
  amount: number;
  status: "pending" | "paid" | "cancelled" | "refunded" | "partially_refunded";
  paid_at: string | null;
  refunded_amount: number;
  created_at: string;
}

export const payUrl = (token: string) => `${location.origin}/pay/${token}`;

interface Props {
  lang: Lang;
  reservationId: string;
  propertyId: string | undefined;
  total: number | null;
  checkIn: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  villa: string;
}

// In a booking: what's been paid by card, what's still owed, and payment links to send. Inside the booking
// form, so every button is type="button".
export function PaymentsPanel({ lang, reservationId, propertyId, total, checkIn, guestName, guestPhone, guestEmail, villa }: Props) {
  const [list, setList] = useState<Payment[]>([]);
  // Invoices drafted from these payments (see draft_invoice_for_payment).
  const [invoices, setInvoices] = useState<{ id: string; payment_id: string; status: "draft" | "issued"; full_number: string | null }[]>([]);
  const [rules, setRules] = useState<{ deposit_pct: number; balance_days_before: number } | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<{ id: string; amount: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("payments").select("id, token, kind, description, amount, status, paid_at, refunded_amount, created_at").eq("reservation_id", reservationId).order("created_at");
    setList((data ?? []) as Payment[]);
    const inv = await supabase.from("invoices").select("id, payment_id, status, full_number").eq("reservation_id", reservationId).not("payment_id", "is", null).is("deleted_at", null);
    setInvoices((inv.data ?? []) as typeof invoices);
  }, [reservationId]);
  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`payments-${reservationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `reservation_id=eq.${reservationId}` }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, reservationId]);
  useEffect(() => {
    if (propertyId) supabase.from("pricing").select("deposit_pct, balance_days_before").eq("property_id", propertyId).maybeSingle().then(({ data }) => setRules(data));
  }, [propertyId]);

  const paid = list.filter((p) => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded").reduce((n, p) => n + Number(p.amount) - Number(p.refunded_amount), 0);
  const pendingTotal = list.filter((p) => p.status === "pending").reduce((n, p) => n + Number(p.amount), 0);
  const owed = total != null ? Math.max(0, Math.round((total - paid) * 100) / 100) : null;
  const deposit = total != null && rules ? Math.round(total * rules.deposit_pct) / 100 : null;
  const balanceDue = rules ? addDays(checkIn, -rules.balance_days_before) : null;

  async function create(kind: Payment["kind"], amount: number) {
    setError(null);
    if (!(amount >= 0.5)) return setError(t(lang, "amountRequired"));
    setBusy(true);
    const { error } = await supabase.from("payments").insert({ reservation_id: reservationId, kind, amount: Math.round(amount * 100) / 100 });
    setBusy(false);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    setCustom(null);
    refresh();
  }

  async function cancel(p: Payment) {
    await supabase.from("payments").update({ status: "cancelled" }).eq("id", p.id);
    refresh();
  }

  async function refund() {
    if (!refunding) return;
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("payments", { body: { action: "refund", payment_id: refunding.id, amount: Number(refunding.amount.replace(",", ".")) } });
    setBusy(false);
    if (error || data?.error) {
      let code = data?.error ?? error?.message;
      try {
        code = (await (error as { context?: Response }).context?.json())?.error ?? code;
      } catch {}
      return setError(code === "not_configured" ? t(lang, "stripeNotConfigured") : `${t(lang, "refundFailed")} ${code}`);
    }
    setRefunding(null);
    refresh();
  }

  const message = (p: Payment) =>
    t(lang, "payMessage")
      .replace("{name}", guestName.split(" ")[0] ?? "")
      .replace("{amount}", eur(Number(p.amount), loc))
      .replace("{villa}", villa)
      .replace("{date}", format(checkIn, loc, { day: "numeric", month: "long" }))
      .replace("{url}", payUrl(p.token));

  async function copy(p: Payment) {
    try {
      await navigator.clipboard.writeText(payUrl(p.token));
      setCopied(p.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(t(lang, "copyByHand"));
    }
  }

  const phone = guestPhone.replace(/[^\d]/g, "");
  const invoiceOf = (p: Payment) => invoices.find((i) => i.payment_id === p.id);

  return (
    <section className="checkin-box payments-box">
      <header>
        <span>{t(lang, "payments")}</span>
        {total != null && (
          <span className="muted small">
            {t(lang, "paid")} {eur(paid, loc)} · {t(lang, "owed")} {eur(owed ?? 0, loc)}
          </span>
        )}
      </header>
      {total == null && <p className="muted small">{t(lang, "setTotalFirst")}</p>}

      {list.length > 0 && (
        <ul className="list">
          {list.map((p) => (
            <li key={p.id} className={`item${p.status === "cancelled" ? " faded" : ""}`}>
              <span>
                <strong>
                  {t(lang, `payKind_${p.kind}` as Key)} · {eur(Number(p.amount), loc)}
                </strong>
                <small>
                  {p.paid_at
                    ? `${t(lang, "paidOn")} ${new Date(p.paid_at).toLocaleDateString(loc, { day: "numeric", month: "short" })}`
                    : `${t(lang, "createdOn")} ${new Date(p.created_at).toLocaleDateString(loc, { day: "numeric", month: "short" })}`}
                  {Number(p.refunded_amount) > 0 && ` · ${t(lang, "refunded")} ${eur(Number(p.refunded_amount), loc)}`}
                </small>
              </span>
              <span className="spacer" />
              <span className={`pill ${p.status === "paid" ? "ok" : p.status === "pending" ? "todo" : ""}`}>{t(lang, `payStatus_${p.status}` as Key)}</span>
              {p.status === "pending" && (
                <span className="task-actions">
                  <button type="button" className="small-btn" onClick={() => copy(p)}>{copied === p.id ? t(lang, "copied") : t(lang, "copyLink")}</button>
                  {phone && (
                    <a className="small-btn link-btn" href={`https://wa.me/${phone}?text=${encodeURIComponent(message(p))}`} target="_blank" rel="noopener">WhatsApp</a>
                  )}
                  {guestEmail && (
                    <a className="small-btn link-btn" href={`mailto:${guestEmail}?subject=${encodeURIComponent(`${t(lang, "payments")} · ${villa}`)}&body=${encodeURIComponent(message(p))}`}>{t(lang, "email")}</a>
                  )}
                  <button type="button" className="small-btn" onClick={() => cancel(p)}>{t(lang, "cancelLink")}</button>
                </span>
              )}
              {invoiceOf(p) && (
                <a className="small-btn link-btn" href={`#invoices/${invoiceOf(p)!.id}`}>
                  {invoiceOf(p)!.full_number ?? t(lang, "invoiceDraft")}
                </a>
              )}
              {Number(p.refunded_amount) > 0 && invoiceOf(p)?.status === "issued" && (
                <p className="hint refund-note">{t(lang, "refundNeedsCorrective")}</p>
              )}
              {(p.status === "paid" || p.status === "partially_refunded") && refunding?.id !== p.id && (
                <button type="button" className="small-btn" onClick={() => setRefunding({ id: p.id, amount: String(Number(p.amount) - Number(p.refunded_amount)) })}>{t(lang, "refund")}</button>
              )}
              {refunding?.id === p.id && (
                <span className="task-actions">
                  <input className="narrow-input" inputMode="decimal" value={refunding.amount} onChange={(e) => setRefunding({ ...refunding, amount: e.target.value })} aria-label={t(lang, "refundAmount")} />
                  <button type="button" className="small-btn danger confirm" disabled={busy} onClick={refund}>{t(lang, "refundConfirm")}</button>
                  <button type="button" className="small-btn" onClick={() => setRefunding(null)}>{t(lang, "close")}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {total != null && owed != null && owed - pendingTotal > 0.004 && (
        <div className="row-btns">
          {paid === 0 && pendingTotal === 0 && deposit != null && deposit > 0 && deposit < total && (
            <button type="button" disabled={busy} onClick={() => create("deposit", deposit)}>
              {t(lang, "depositLink")} ({rules?.deposit_pct} % · {eur(deposit, loc)})
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => create(paid === 0 && pendingTotal === 0 ? "full" : "balance", owed - pendingTotal)}>
            {paid === 0 && pendingTotal === 0 ? t(lang, "fullLink") : t(lang, "balanceLink")} ({eur(owed - pendingTotal, loc)})
          </button>
          {custom == null ? (
            <button type="button" onClick={() => setCustom("")}>{t(lang, "otherAmount")}</button>
          ) : (
            <span className="inline">
              <input className="narrow-input" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus aria-label={t(lang, "amount")} />
              <button type="button" className="primary" disabled={busy} onClick={() => create("other", Number(custom.replace(",", ".")))}>{t(lang, "createPayLink")}</button>
            </span>
          )}
        </div>
      )}
      {balanceDue && paid > 0 && owed != null && owed > 0 && <p className="hint">{t(lang, "balanceDueBy")} {format(balanceDue, loc, { day: "numeric", month: "long" })}</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
