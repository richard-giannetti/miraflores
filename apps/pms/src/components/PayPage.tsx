import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// The guest's payment page, reached through the private link /pay/<token>. It shows what the payment is for
// and hands over to Stripe Checkout; Stripe brings the guest back here with ?done=1. No account needed.

type GLang = "en" | "es" | "fr";
const glangs: GLang[] = ["en", "es", "fr"];
const loc: Record<GLang, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR" };

interface Info {
  status: "pending" | "paid" | "cancelled" | "refunded" | "partially_refunded";
  kind: string;
  description: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  villa: string;
  check_in: string;
  check_out: string;
  guest: string | null;
  language: string;
}

const S = {
  title: { en: "Secure payment", es: "Pago seguro", fr: "Paiement sécurisé" },
  hello: { en: "Hello", es: "Hola", fr: "Bonjour" },
  arrival: { en: "Arrival", es: "Llegada", fr: "Arrivée" },
  departure: { en: "Departure", es: "Salida", fr: "Départ" },
  kind_deposit: { en: "Deposit", es: "Depósito", fr: "Acompte" },
  kind_balance: { en: "Balance of your stay", es: "Resto de la estancia", fr: "Solde du séjour" },
  kind_full: { en: "Your stay", es: "Tu estancia", fr: "Votre séjour" },
  kind_extra: { en: "Extra", es: "Extra", fr: "Supplément" },
  kind_other: { en: "Payment", es: "Pago", fr: "Paiement" },
  pay: { en: "Pay by card", es: "Pagar con tarjeta", fr: "Payer par carte" },
  opening: { en: "Opening the secure payment page…", es: "Abriendo la página de pago seguro…", fr: "Ouverture de la page de paiement sécurisé…" },
  stripe: {
    en: "You'll pay on Stripe's secure page (card, Apple Pay, Google Pay). We never see your card details.",
    es: "Pagarás en la página segura de Stripe (tarjeta, Apple Pay, Google Pay). Nunca vemos los datos de tu tarjeta.",
    fr: "Vous payez sur la page sécurisée de Stripe (carte, Apple Pay, Google Pay). Nous ne voyons jamais vos données de carte.",
  },
  checking: { en: "Confirming your payment…", es: "Confirmando tu pago…", fr: "Confirmation de votre paiement…" },
  paid: { en: "Payment received. Thank you!", es: "Pago recibido. ¡Gracias!", fr: "Paiement reçu. Merci !" },
  paidOn: { en: "Paid on", es: "Pagado el", fr: "Payé le" },
  cancelled: { en: "This payment link is no longer active. Please contact us.", es: "Este enlace de pago ya no está activo. Escríbenos.", fr: "Ce lien de paiement n'est plus actif. Contactez-nous." },
  refunded: { en: "This payment has been refunded.", es: "Este pago se ha devuelto.", fr: "Ce paiement a été remboursé." },
  invalid: { en: "This payment link isn't valid.", es: "Este enlace de pago no es válido.", fr: "Ce lien de paiement n'est pas valide." },
  error: { en: "The payment page couldn't be opened. Please try again in a moment.", es: "No se pudo abrir la página de pago. Inténtalo de nuevo en un momento.", fr: "La page de paiement n'a pas pu s'ouvrir. Réessayez dans un instant." },
};
type K = keyof typeof S;

export function PayPage({ token }: { token: string }) {
  const done = new URLSearchParams(location.search).has("done");
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [lang, setLang] = useState<GLang>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const tr = (k: K) => S[k][lang];

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const { data, error } = await supabase.rpc("payment_page", { p_token: token });
      const i = error ? null : ((data as Info) ?? null);
      setInfo(i);
      if (i && tries === 0) setLang(glangs.includes(i.language as GLang) ? (i.language as GLang) : (navigator.language.slice(0, 2) as GLang) in loc ? (navigator.language.slice(0, 2) as GLang) : "en");
      // Back from Stripe: the webhook may take a few seconds to mark it paid.
      if (done && i?.status === "pending" && tries++ < 10) timer = setTimeout(load, 2000);
    };
    load();
    return () => clearTimeout(timer);
  }, [token, done]);

  async function pay() {
    setBusy(true);
    setError(false);
    const { data, error } = await supabase.functions.invoke("payments", { body: { action: "checkout", token } });
    if (error || !data?.url) {
      setBusy(false);
      return setError(true);
    }
    location.href = data.url;
  }

  const fmt = (d: string) => new Intl.DateTimeFormat(loc[lang], { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const money = (n: number, c: string) => Number(n).toLocaleString(loc[lang], { style: "currency", currency: c });

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
            <h1>{info.villa}</h1>
            <div className="guest-dates">
              <div>
                <span>{tr("arrival")}</span>
                <strong>{fmt(info.check_in)}</strong>
              </div>
              <div>
                <span>{tr("departure")}</span>
                <strong>{fmt(info.check_out)}</strong>
              </div>
            </div>
          </section>
          <section className="guest-card pay-card">
            {info.guest && <p className="muted">{tr("hello")} {info.guest},</p>}
            <div className="pay-amount">
              <span>{tr(`kind_${info.kind}` as K)}{info.description && ` · ${info.description}`}</span>
              <strong>{money(info.amount, info.currency)}</strong>
            </div>
            {info.status === "paid" ? (
              <p className="ok-text">
                {tr("paid")} {info.paid_at && `${tr("paidOn")} ${new Date(info.paid_at).toLocaleDateString(loc[lang], { day: "numeric", month: "long", year: "numeric" })}.`}
              </p>
            ) : info.status === "pending" ? (
              done ? (
                <p className="muted">{tr("checking")}</p>
              ) : (
                <>
                  <button className="primary big guest-submit" disabled={busy} onClick={pay}>
                    {busy ? tr("opening") : `${tr("pay")} · ${money(info.amount, info.currency)}`}
                  </button>
                  <p className="privacy">{tr("stripe")}</p>
                </>
              )
            ) : (
              <p className="muted">{info.status === "cancelled" ? tr("cancelled") : tr("refunded")}</p>
            )}
            {error && <p className="error">{tr("error")}</p>}
          </section>
        </>
      )}
    </div>
  );
}
