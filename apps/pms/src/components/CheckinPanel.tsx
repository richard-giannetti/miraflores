import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { format } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { checkinUrl, countryName, type Checkin, type Traveller } from "../lib/checkin";

// The traveller sheet is in Spanish, like SES.Hospedajes.
const relLabel: Record<string, string> = { child: "Hijo/a", grandchild: "Nieto/a", sibling: "Hermano/a", nephew_niece: "Sobrino/a", ward: "Tutelado/a (tutor legal)", other: "Otro" };
import { Icon } from "./Icon";

interface Props {
  lang: Lang;
  reservationId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  villa: string;
  checkIn: string;
}

const CHECKIN_FIELDS =
  "id, reservation_id, token, status, arrival_time, signature, guest_language, invoice_name, invoice_tax_id, invoice_address, completed_at, ses_sent_at, travellers(*)";

// The online check-in of one booking, inside the reservation form: create the link, send it, see the result.
export function CheckinPanel({ lang, reservationId, guestName, guestEmail, guestPhone, villa, checkIn }: Props) {
  const [checkin, setCheckin] = useState<Checkin | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [viewing, setViewing] = useState(false);

  async function load() {
    const { data } = await supabase.from("checkins").select(CHECKIN_FIELDS).eq("reservation_id", reservationId).maybeSingle();
    setCheckin((data as Checkin | null) ?? null);
  }
  useEffect(() => {
    load();
  }, [reservationId]);

  async function create() {
    const { error } = await supabase.from("checkins").insert({ reservation_id: reservationId });
    if (!error) load();
  }

  if (checkin === undefined) return null;
  const url = checkin ? checkinUrl(checkin.token) : "";
  const firstName = guestName.split(" ")[0] ?? "";
  const message = t(lang, "checkinMessage")
    .replace("{name}", firstName)
    .replace("{villa}", villa)
    .replace("{date}", format(checkIn, locale[lang], { day: "numeric", month: "long" }))
    .replace("{url}", url);
  const phoneDigits = guestPhone.replace(/[^\d]/g, "");

  return (
    <div className="checkin-box">
      <header>
        <span>{t(lang, "checkinOnline")}</span>
        {checkin && (
          <span className={`pill ${checkin.status === "complete" ? "ok" : "todo"}`}>
            {checkin.status === "complete" ? (
              <>
                <Icon name="check" size={14} /> {t(lang, "checkinDone")}
              </>
            ) : (
              t(lang, "checkinPending")
            )}
          </span>
        )}
      </header>
      {!checkin ? (
        <button type="button" onClick={create}>
          {t(lang, "createLink")}
        </button>
      ) : (
        <>
          <div className="url">{url}</div>
          <div className="row-btns">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t(lang, "copied") : t(lang, "copy")}
            </button>
            <a href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener">
              WhatsApp
            </a>
            <a href={`mailto:${guestEmail}?subject=${encodeURIComponent(`${t(lang, "checkinOnline")} · ${villa}`)}&body=${encodeURIComponent(message)}`}>{t(lang, "email")}</a>
            <a href={url} target="_blank" rel="noopener">
              {t(lang, "openLink")}
            </a>
            {checkin.status === "complete" && (
              <button type="button" className="primary" onClick={() => setViewing(true)}>
                {t(lang, "viewRegistration")}
              </button>
            )}
          </div>
          {checkin.status === "complete" && (
            <p className={checkin.ses_sent_at ? "muted" : "warn small"}>{checkin.ses_sent_at ? `✓ ${t(lang, "sesSent")}` : t(lang, "sesNotSent")}</p>
          )}
        </>
      )}
      {/* Rendered outside the reservation form: forms can't be nested. */}
      {viewing &&
        checkin &&
        createPortal(<Registration lang={lang} checkin={checkin} villa={villa} onClose={() => setViewing(false)} onChanged={load} />, document.body)}
    </div>
  );
}

function Registration({ lang, checkin, villa, onClose, onChanged }: { lang: Lang; checkin: Checkin; villa: string; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const loc = locale[lang];
  useEffect(() => ref.current?.showModal(), []);
  const travellers = [...(checkin.travellers ?? [])].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));

  async function setSes(sent: boolean) {
    const { data } = await supabase.auth.getUser();
    await supabase
      .from("checkins")
      .update({ ses_sent_at: sent ? new Date().toISOString() : null, ses_sent_by: sent ? data.user?.id : null })
      .eq("id", checkin.id);
    onChanged();
  }

  // Each traveller's data as label/value pairs, in the order SES.Hospedajes asks for them.
  const fields = (p: Traveller): [string, string][] =>
    [
      ["Nombre", p.first_name],
      ["Primer apellido", p.last_name_1],
      ["Segundo apellido", p.last_name_2],
      ["Sexo", { M: "Hombre", F: "Mujer", X: "Otro", "": "" }[p.sex]],
      ["Fecha de nacimiento", p.birth_date ? format(p.birth_date, "es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""],
      ["Nacionalidad", p.nationality ? `${countryName(p.nationality, "es-ES")} (${p.nationality})` : ""],
      ["Tipo de documento", { DNI: "DNI", NIE: "NIE", PASSPORT: "Pasaporte", ID_CARD: "Documento de identidad", OTHER: "Otro", "": "" }[p.doc_type]],
      ["Número de documento", p.doc_number],
      ["Número de soporte", p.doc_support_number],
      ["Fecha de expedición", p.doc_issue_date ? format(p.doc_issue_date, "es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""],
      ["Dirección", p.residence_address],
      ["Localidad", [p.residence_postal_code, p.residence_city, p.residence_municipality_code && `(INE ${p.residence_municipality_code})`].filter(Boolean).join(" ")],
      ["País de residencia", p.residence_country ? `${countryName(p.residence_country, "es-ES")} (${p.residence_country})` : ""],
      ["Teléfono", p.phone],
      ["Email", p.email],
      // Older check-ins hold free text; newer ones one of `relationships`.
      ["Parentesco con el viajero 1", relLabel[p.relationship] ?? p.relationship],
    ].filter(([, v]) => v) as [string, string][];

  // A plain printable sheet, to copy into SES.Hospedajes or keep on file.
  function print() {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Parte de viajeros · ${esc(villa)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}th{text-align:left;color:#555;font-weight:600;width:40%;padding:3px 8px 3px 0}td{padding:3px 0}img{max-width:260px;border:1px solid #ddd}</style>
<h1>Parte de viajeros · ${esc(villa)}</h1>
<p>Check-in online completado el ${checkin.completed_at ? new Date(checkin.completed_at).toLocaleString("es-ES") : ""}</p>
${travellers.map((p, i) => `<h2>Viajero ${i + 1}</h2><table>${fields(p).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`).join("")}
${checkin.signature ? `<h2>Firma</h2><img src="${checkin.signature}">` : ""}
<script>print()</script>`);
    w.document.close();
  }

  return (
    // stopPropagation: React passes these events up through the portal to the reservation dialog.
    <dialog
      ref={ref}
      className="dialog"
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
    >
      {/* Not a <form>: React passes events up through the portal, so a submit would reach the reservation form. */}
      <div className="dialog-body">
        <h2>{t(lang, "registration")}</h2>
        <p className="muted">
          {villa}
          {checkin.completed_at && ` · ${new Date(checkin.completed_at).toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" })}`}
        </p>
        <table className="reg-table">
          <tbody>
            {checkin.arrival_time && (
              <tr>
                <th>{t(lang, "arrivalTimeLabel")}</th>
                <td>{checkin.arrival_time}</td>
              </tr>
            )}
            {checkin.invoice_name && (
              <tr>
                <th>{t(lang, "invoiceTo")}</th>
                <td>
                  {checkin.invoice_name}
                  {checkin.invoice_tax_id && ` · ${checkin.invoice_tax_id}`}
                  {checkin.invoice_address && <><br />{checkin.invoice_address}</>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {travellers.map((p, i) => (
          <div key={p.id ?? i} className="reg-traveller">
            <h3>
              {i + 1}. {p.first_name} {p.last_name_1} {p.last_name_2}
            </h3>
            <table className="reg-table">
              <tbody>
                {fields(p).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {checkin.signature && (
          <div>
            <h3>{t(lang, "signature")}</h3>
            <img className="sig-img" src={checkin.signature} alt={t(lang, "signature")} />
          </div>
        )}
        <div className="actions">
          {checkin.ses_sent_at ? (
            <span className="pill ok">
              <Icon name="check" size={14} /> {t(lang, "sesSent")}
              <button type="button" className="link" onClick={() => setSes(false)}>
                {t(lang, "undoSes")}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setSes(true)}>
              {t(lang, "markSesSent")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={print}>
            <Icon name="printer" size={18} /> {t(lang, "printSheet")}
          </button>
          <button type="button" onClick={() => ref.current?.close()}>
            {t(lang, "close")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
