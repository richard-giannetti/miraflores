import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// The guest's quote page, reached through the private link /q/<token> (no account). It shows the stay and the
// price, lets the guest accept or decline, and once accepted shows how to pay the deposit by bank transfer.

type GLang = "en" | "es" | "fr";
const glangs: GLang[] = ["en", "es", "fr"];
const loc: Record<GLang, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR" };
type Multi = Partial<Record<GLang, string>>;

interface Info {
  status: "sent" | "accepted" | "declined" | "expired" | "cancelled";
  language: string;
  guest: string | null;
  villa: string;
  unit: string;
  check_in: string;
  check_out: string;
  check_in_time: string;
  check_out_time: string;
  adults: number;
  children: number;
  plan_name: Multi;
  refundable: boolean;
  breakdown: { nights?: number; accommodation?: number; extra_guests?: number; cleaning?: number; gap?: boolean; gap_discount_pct?: number; promo?: { code: string; discount_pct: number } | null; chosen?: { discount_pct: number } };
  total: number;
  deposit: number;
  balance_due: string;
  message: string;
  valid_until: string;
  company: string;
  contact_email: string;
  contact_phone: string;
  bank_details: string | null;
  // The transfer reference, the same as in the email (MCT- and the start of the booking's id).
  reference: string;
}

const S = {
  title: { en: "Your quote", es: "Tu presupuesto", fr: "Votre devis" },
  hello: { en: "Hello", es: "Hola", fr: "Bonjour" },
  arrival: { en: "Arrival", es: "Llegada", fr: "Arrivée" },
  departure: { en: "Departure", es: "Salida", fr: "Départ" },
  from: { en: "from", es: "desde las", fr: "à partir de" },
  until: { en: "until", es: "hasta las", fr: "jusqu'à" },
  guests: { en: "Guests", es: "Personas", fr: "Personnes" },
  adults: { en: "adults", es: "adultos", fr: "adultes" },
  children: { en: "children", es: "niños", fr: "enfants" },
  nights: { en: "nights", es: "noches", fr: "nuits" },
  extraGuests: { en: "Extra guests", es: "Personas adicionales", fr: "Personnes supplémentaires" },
  cleaning: { en: "Final cleaning", es: "Limpieza final", fr: "Ménage final" },
  discount: { en: "Discount", es: "Descuento", fr: "Réduction" },
  gap: { en: "Short-stay discount", es: "Descuento por noches sueltas", fr: "Réduction courte durée" },
  promo: { en: "Promo code", es: "Código promocional", fr: "Code promo" },
  total: { en: "Total, VAT included", es: "Total, IVA incluido", fr: "Total TTC" },
  deposit: { en: "Deposit to confirm", es: "Depósito para confirmar", fr: "Acompte pour confirmer" },
  balance: { en: "Rest, due by", es: "Resto, antes del", fr: "Solde, avant le" },
  noRefund: { en: "Non-refundable rate", es: "Tarifa no reembolsable", fr: "Tarif non remboursable" },
  valid: { en: "We're holding these dates for you until", es: "Te reservamos estas fechas hasta el", fr: "Nous vous gardons ces dates jusqu'au" },
  accept: { en: "Accept the quote", es: "Aceptar el presupuesto", fr: "Accepter le devis" },
  decline: { en: "No, thank you", es: "No, gracias", fr: "Non, merci" },
  confirmDecline: { en: "Decline and free the dates?", es: "¿Rechazar y liberar las fechas?", fr: "Refuser et libérer les dates ?" },
  accepted: { en: "Thank you! To confirm the booking, please transfer the deposit:", es: "¡Gracias! Para confirmar la reserva, transfiere el depósito:", fr: "Merci ! Pour confirmer la réservation, virez l'acompte :" },
  reference: { en: "Reference", es: "Concepto", fr: "Référence" },
  amount: { en: "Amount", es: "Importe", fr: "Montant" },
  afterTransfer: {
    en: "We'll confirm your booking as soon as the transfer arrives. Questions? Write to us:",
    es: "Te confirmaremos la reserva en cuanto llegue la transferencia. ¿Dudas? Escríbenos:",
    fr: "Nous confirmerons votre réservation dès réception du virement. Une question ? Écrivez-nous :",
  },
  noBank: { en: "We'll send you the payment details shortly.", es: "Te enviaremos los datos de pago en breve.", fr: "Nous vous enverrons les coordonnées de paiement sous peu." },
  declined: { en: "You declined this quote. The dates have been released.", es: "Has rechazado este presupuesto. Las fechas se han liberado.", fr: "Vous avez refusé ce devis. Les dates ont été libérées." },
  expired: { en: "This quote has expired. Write to us and we'll check the dates again:", es: "Este presupuesto ha caducado. Escríbenos y volvemos a mirar las fechas:", fr: "Ce devis a expiré. Écrivez-nous et nous revérifierons les dates :" },
  cancelled: { en: "This quote is no longer valid. Please contact us:", es: "Este presupuesto ya no es válido. Escríbenos:", fr: "Ce devis n'est plus valable. Contactez-nous :" },
  invalid: { en: "This link isn't valid.", es: "Este enlace no es válido.", fr: "Ce lien n'est pas valide." },
  failed: { en: "Something went wrong. Please try again.", es: "Algo ha fallado. Inténtalo de nuevo.", fr: "Une erreur est survenue. Réessayez." },
};
type K = keyof typeof S;

export function QuotePage({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [lang, setLang] = useState<GLang>("en");
  const [busy, setBusy] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState(false);
  const tr = (k: K) => S[k][lang];

  useEffect(() => {
    supabase.rpc("quote_page", { p_token: token }).then(({ data, error }) => {
      const i = error ? null : ((data as Info) ?? null);
      setInfo(i);
      if (i && glangs.includes(i.language as GLang)) setLang(i.language as GLang);
    });
  }, [token]);

  async function respond(accept: boolean) {
    if (!accept && !confirmDecline) return setConfirmDecline(true);
    setBusy(true);
    setError(false);
    const { data, error } = await supabase.rpc("quote_respond", { p_token: token, p_accept: accept });
    setBusy(false);
    if (error) return setError(true);
    setInfo(data as Info);
    window.scrollTo({ top: 0 });
  }

  const day = (d: string) => new Intl.DateTimeFormat(loc[lang], { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const money = (n: number) => Number(n).toLocaleString(loc[lang], { style: "currency", currency: "EUR" });
  const b = info?.breakdown ?? {};
  const plan = info ? (info.plan_name[lang] || info.plan_name.en || info.plan_name.es || "") : "";
  const contact = info && (
    <p className="muted">
      {[info.contact_email && <a key="e" href={`mailto:${info.contact_email}`}>{info.contact_email}</a>, info.contact_phone && <a key="p" href={`tel:${info.contact_phone}`}>{info.contact_phone}</a>].filter(Boolean).flatMap((x, i) => (i ? [" · ", x] : [x]))}
    </p>
  );

  return (
    <div className="guest">
      <header className="guest-top">
        <img src="/logo.png" alt="Miraflores" />
        <div className="langs" role="group" aria-label="Language">
          {glangs.map((l) => (
            <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {info === undefined && <p className="guest-card muted">…</p>}
      {info === null && <p className="guest-card">{tr("invalid")}</p>}
      {info && (
        <>
          <section className="guest-hero">
            <p className="eyebrow">{tr("title")}</p>
            <h1>{info.unit}</h1>
            <div className="guest-dates">
              <div>
                <span>{tr("arrival")}</span>
                <strong>{day(info.check_in)}</strong>
                <small>{tr("from")} {info.check_in_time}</small>
              </div>
              <div>
                <span>{tr("departure")}</span>
                <strong>{day(info.check_out)}</strong>
                <small>{tr("until")} {info.check_out_time}</small>
              </div>
            </div>
          </section>

          {info.status === "accepted" && (
            <section className="guest-card pay-card">
              <p className="ok-text">{tr("accepted")}</p>
              {info.bank_details ? (
                <>
                  <p className="pre bank">{info.bank_details}</p>
                  <table className="quote-table">
                    <tbody>
                      <tr className="total">
                        <th>{tr("amount")}</th>
                        <td>{money(info.deposit)}</td>
                      </tr>
                      <tr>
                        <th>{tr("reference")}</th>
                        <td>
                          <strong>{info.reference}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              ) : (
                <p>{tr("noBank")}</p>
              )}
              <p className="muted">{tr("afterTransfer")}</p>
              {contact}
            </section>
          )}

          <section className="guest-card">
            {info.guest && <p className="muted">{tr("hello")} {info.guest},</p>}
            {info.message && <p className="pre">{info.message}</p>}
            <table className="quote-table">
              <tbody>
                <tr>
                  <th>{tr("guests")}</th>
                  <td>
                    {info.adults} {tr("adults")}
                    {info.children > 0 && `, ${info.children} ${tr("children")}`}
                  </td>
                </tr>
                {b.accommodation != null && (
                  <tr>
                    <th>{b.nights} {tr("nights")}{b.gap ? ` · ${tr("gap")} −${Number(b.gap_discount_pct)} %` : ""}</th>
                    <td>{money(b.accommodation)}</td>
                  </tr>
                )}
                {!!b.extra_guests && (
                  <tr>
                    <th>{tr("extraGuests")}</th>
                    <td>{money(b.extra_guests)}</td>
                  </tr>
                )}
                {!!b.cleaning && (
                  <tr>
                    <th>{tr("cleaning")}</th>
                    <td>{money(b.cleaning)}</td>
                  </tr>
                )}
                {!!b.chosen?.discount_pct && (
                  <tr>
                    <th>{plan || tr("discount")}</th>
                    <td>−{Number(b.chosen.discount_pct)} %</td>
                  </tr>
                )}
                {b.promo && (
                  <tr>
                    <th>{tr("promo")} {b.promo.code}</th>
                    <td>−{Number(b.promo.discount_pct)} %</td>
                  </tr>
                )}
                <tr className="total">
                  <th>{tr("total")}</th>
                  <td>{money(info.total)}</td>
                </tr>
                <tr>
                  <th>{tr("deposit")}</th>
                  <td>{money(info.deposit)}</td>
                </tr>
                {Number(info.total) > Number(info.deposit) && (
                  <tr>
                    <th>{tr("balance")} {day(info.balance_due)}</th>
                    <td>{money(Number(info.total) - Number(info.deposit))}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {!info.refundable && <p className="muted">{tr("noRefund")}</p>}

            {info.status === "sent" && (
              <>
                <p className="muted">
                  {tr("valid")}{" "}
                  {new Date(info.valid_until).toLocaleString(loc[lang], { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.
                </p>
                <button className="primary big guest-submit" disabled={busy} onClick={() => respond(true)}>
                  {tr("accept")} · {money(info.total)}
                </button>
                <button className={`link decline${confirmDecline ? " danger" : ""}`} disabled={busy} onClick={() => respond(false)}>
                  {confirmDecline ? tr("confirmDecline") : tr("decline")}
                </button>
              </>
            )}
            {info.status === "declined" && <p className="muted">{tr("declined")}</p>}
            {(info.status === "expired" || info.status === "cancelled") && (
              <>
                <p className="muted">{tr(info.status)}</p>
                {contact}
              </>
            )}
            {error && <p className="error">{tr("failed")}</p>}
          </section>
          <p className="guest-foot muted">{info.company}</p>
        </>
      )}
    </div>
  );
}
