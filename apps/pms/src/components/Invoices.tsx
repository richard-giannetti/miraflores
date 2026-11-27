import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { format, today } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { INVOICE_FIELDS, money, totals, withoutVat, type Company, type Invoice, type InvoiceKind, type InvoiceLine } from "../lib/invoices";
import type { Profile } from "../lib/types";
import { Icon } from "./Icon";

const go = (id?: string) => (location.hash = id ? `#invoices/${id}` : "#invoices");

interface Props {
  lang: Lang;
  profile: Profile;
  openId: string | null;
}

export function Invoices({ lang, profile, openId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [editCompany, setEditCompany] = useState(false);
  const [year, setYear] = useState(today().slice(0, 4));
  const loc = locale[lang];

  async function refresh() {
    const [inv, co] = await Promise.all([
      supabase.from("invoices").select(INVOICE_FIELDS).is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("company_settings").select("*").single(),
    ]);
    if (inv.data) setInvoices(inv.data as unknown as Invoice[]);
    if (co.data) setCompany(co.data as Company);
  }

  useEffect(() => {
    refresh();
  }, [openId]);

  const companyMissing = company && (!company.tax_id || !company.address);
  const years = useMemo(() => [...new Set([today().slice(0, 4), ...invoices.map((i) => (i.issue_date ?? i.created_at).slice(0, 4))])].sort().reverse(), [invoices]);
  const shown = invoices.filter((i) => (i.issue_date ?? i.created_at).startsWith(year));
  const sum = shown.filter((i) => i.status === "issued").reduce((s, i) => s + (i.total ?? 0), 0);

  const banners = (
    <>
      {companyMissing && (
        <p className="banner error" onClick={() => setEditCompany(true)}>
          {t(lang, "companyMissing")}
        </p>
      )}
      <p className="banner">{t(lang, "verifactuNote")}</p>
    </>
  );

  const open = openId ? invoices.find((i) => i.id === openId) : null;

  return (
    <main className="page">
      {open ? (
        <>
          {banners}
          <InvoiceDetail lang={lang} invoice={open} company={company} onChanged={refresh} />
        </>
      ) : (
        <>
          <div className="page-head">
            <h1 className="title">{t(lang, "tab_invoices")}</h1>
            <div className="nav">
              {profile.role === "owner" && (
                <button onClick={() => setEditCompany(true)}>
                  <Icon name="settings" size={18} /> {t(lang, "company")}
                </button>
              )}
              <button className="primary" onClick={() => newInvoice()}>
                <Icon name="plus" size={18} /> {t(lang, "newInvoice")}
              </button>
            </div>
          </div>
          <div className="toolbar">
            <div className="segmented">
              {years.map((y) => (
                <button key={y} className={y === year ? "on" : ""} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
            <span className="range">
              {t(lang, "totalLabel")} {t(lang, "issued").toLowerCase()}: <strong>{money(sum, loc)}</strong>
            </span>
          </div>
          {banners}
          {shown.length === 0 ? (
            <p className="muted">{t(lang, "noInvoices")}</p>
          ) : (
            <ul className="list panel">
              {shown.map((i) => (
                <li key={i.id} className="item">
                  <button className="item-main" onClick={() => go(i.id)}>
                    <span className="avatar muted-avatar">
                      <Icon name="invoices" size={16} />
                    </span>
                    <span>
                      <strong>
                        {i.full_number ?? t(lang, "draft")} · {i.customer_name || t(lang, "untitled")}
                      </strong>
                      <small>
                        {t(lang, `inv_${i.kind}`)}
                        {i.issue_date && ` · ${format(i.issue_date, loc, { day: "numeric", month: "short", year: "numeric" })}`}
                      </small>
                    </span>
                  </button>
                  <strong>{money(i.status === "issued" ? i.total : totals(i.invoice_lines ?? []).total, loc)}</strong>
                  <span className={`pill ${i.status === "issued" ? "ok" : "todo"}`}>{t(lang, i.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editCompany && company && (
        <CompanyDialog
          lang={lang}
          company={company}
          onClose={() => setEditCompany(false)}
          onSaved={() => {
            setEditCompany(false);
            refresh();
          }}
        />
      )}
    </main>
  );
}

// A new blank draft, or one filled from a reservation (see ReservationDialog).
export async function newInvoice(from?: { reservationId: string; customer: string; email: string; description: string; gross: number | null; operationDate: string }) {
  const co = await supabase.from("company_settings").select("default_vat_rate").single();
  const vatRate = Number(co.data?.default_vat_rate ?? 10);
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      reservation_id: from?.reservationId ?? null,
      customer_name: from?.customer ?? "",
      customer_email: from?.email ?? "",
      operation_date: from?.operationDate ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return;
  if (from) {
    await supabase.from("invoice_lines").insert({
      invoice_id: data.id,
      description: from.description,
      quantity: 1,
      unit_price: from.gross ? withoutVat(from.gross, vatRate) : 0,
      vat_rate: vatRate,
      sort: 0,
    });
  }
  go(data.id);
}

function InvoiceDetail({ lang, invoice, company, onChanged }: { lang: Lang; invoice: Invoice; company: Company | null; onChanged: () => void }) {
  const draft = invoice.status === "draft";
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const loc = locale[lang];

  async function correct() {
    const { data, error } = await supabase.rpc("start_correction", { p_id: invoice.id, p_reason: reason });
    if (!error && data) go(data as string);
  }

  return (
    <>
      <div className="toolbar no-print">
        <div className="nav">
          <button onClick={() => go()}>
            <Icon name="left" size={18} /> {t(lang, "back")}
          </button>
          <span className="range">{invoice.full_number ?? `${t(lang, `inv_${invoice.kind}`)} · ${t(lang, "draft")}`}</span>
        </div>
        <div className="nav">
          <button onClick={() => window.print()}>
            <Icon name="printer" size={18} /> {t(lang, "print")}
          </button>
          {!draft && invoice.kind !== "corrective" && <button onClick={() => setCorrecting(true)}>{t(lang, "correct")}</button>}
        </div>
      </div>
      {correcting && (
        <div className="panel no-print correct-box">
          <label>
            {t(lang, "correctionReason")}
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
          <div className="actions">
            <span className="spacer" />
            <button onClick={() => setCorrecting(false)}>{t(lang, "cancel")}</button>
            <button className="primary" disabled={!reason.trim()} onClick={correct}>
              {t(lang, "correct")}
            </button>
          </div>
        </div>
      )}
      {draft && <DraftEditor lang={lang} invoice={invoice} onChanged={onChanged} />}
      <InvoicePrint invoice={invoice} company={company} locale={loc} />
    </>
  );
}

function DraftEditor({ lang, invoice, onChanged }: { lang: Lang; invoice: Invoice; onChanged: () => void }) {
  const [f, setF] = useState({
    kind: invoice.kind,
    customer_name: invoice.customer_name,
    customer_tax_id: invoice.customer_tax_id,
    customer_address: invoice.customer_address,
    customer_country: invoice.customer_country,
    customer_email: invoice.customer_email,
    operation_date: invoice.operation_date ?? "",
    correction_reason: invoice.correction_reason,
    notes: invoice.notes,
  });
  const [lines, setLines] = useState<InvoiceLine[]>(() => [...(invoice.invoice_lines ?? [])].sort((a, b) => a.sort - b.sort));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const loc = locale[lang];
  const sum = totals(lines);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (i: number, patch: Partial<InvoiceLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    setError(null);
    const r1 = await supabase
      .from("invoices")
      .update({ ...f, operation_date: f.operation_date || null })
      .eq("id", invoice.id);
    if (r1.error) return fail(r1.error.message);
    // Drafts only: replace the lines wholesale.
    const r2 = await supabase.from("invoice_lines").delete().eq("invoice_id", invoice.id);
    if (r2.error) return fail(r2.error.message);
    if (lines.length) {
      const r3 = await supabase
        .from("invoice_lines")
        .insert(lines.map((l, i) => ({ invoice_id: invoice.id, description: l.description, quantity: l.quantity, unit_price: l.unit_price, vat_rate: l.vat_rate, sort: i })));
      if (r3.error) return fail(r3.error.message);
    }
    setBusy(false);
    onChanged();
    return true;
  }

  async function issue() {
    if (!confirmIssue) return setConfirmIssue(true);
    if (!(await save())) return;
    const { error } = await supabase.rpc("issue_invoice", { p_id: invoice.id });
    if (error) return fail(error.message);
    onChanged();
  }

  async function removeDraft() {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    go();
  }

  function fail(msg: string) {
    setBusy(false);
    setConfirmIssue(false);
    setError(explain(lang, msg));
    return false;
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save();
  };

  return (
    <form className="panel editor no-print" onSubmit={submit}>
      <div className="two">
        <label>
          {t(lang, "invoice")}
          <select value={f.kind} disabled={invoice.kind === "corrective"} onChange={(e) => set("kind", e.target.value as InvoiceKind)}>
            {(invoice.kind === "corrective" ? ["corrective"] : ["invoice", "simplified"]).map((k) => (
              <option key={k} value={k}>
                {t(lang, `inv_${k as InvoiceKind}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(lang, "operationDate")}
          <input type="date" value={f.operation_date} onChange={(e) => set("operation_date", e.target.value)} />
        </label>
      </div>
      {f.kind === "simplified" && sum.total > 400 && <p className="error">{t(lang, "simplifiedLimit")}</p>}
      {invoice.kind === "corrective" && (
        <label>
          {t(lang, "correctionReason")}
          <input value={f.correction_reason} onChange={(e) => set("correction_reason", e.target.value)} />
        </label>
      )}

      <h3>{t(lang, "customer")}</h3>
      <div className="two">
        <label>
          {t(lang, "customerName")}
          <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
        </label>
        <label>
          {t(lang, "taxId")}
          <input value={f.customer_tax_id} onChange={(e) => set("customer_tax_id", e.target.value)} />
        </label>
      </div>
      <label>
        {t(lang, "address")}
        <input value={f.customer_address} onChange={(e) => set("customer_address", e.target.value)} />
      </label>
      <div className="two">
        <label>
          {t(lang, "country")}
          <input value={f.customer_country} onChange={(e) => set("customer_country", e.target.value)} />
        </label>
        <label>
          {t(lang, "email")}
          <input type="email" value={f.customer_email} onChange={(e) => set("customer_email", e.target.value)} />
        </label>
      </div>

      <h3>{t(lang, "lines")}</h3>
      <div className="lines">
        <div className="line head">
          <span>{t(lang, "description")}</span>
          <span>{t(lang, "qty")}</span>
          <span>{t(lang, "unitPrice")}</span>
          <span>{t(lang, "priceInclVat")}</span>
          <span>{t(lang, "vat")} %</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div className="line" key={i}>
            <input aria-label={t(lang, "description")} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <input aria-label={t(lang, "qty")} type="number" step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
            <input aria-label={t(lang, "unitPrice")} type="number" step="0.0001" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} />
            <input
              aria-label={t(lang, "priceInclVat")}
              type="number"
              step="0.01"
              key={`${l.unit_price}-${l.vat_rate}`}
              defaultValue={Math.round(l.unit_price * (1 + l.vat_rate / 100) * 100) / 100}
              onBlur={(e) => setLine(i, { unit_price: withoutVat(Number(e.target.value), l.vat_rate) })}
            />
            <input aria-label={t(lang, "vat")} type="number" step="1" value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: Number(e.target.value) })} />
            <button type="button" aria-label={t(lang, "delete")} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, { description: "", quantity: 1, unit_price: 0, vat_rate: ls[0]?.vat_rate ?? 10, sort: ls.length }])}>
          {t(lang, "addLine")}
        </button>
      </div>
      <p className="totals-line">
        {t(lang, "base")}: {money(sum.base, loc)} · {t(lang, "vat")}: {money(sum.vat, loc)} · <strong>{t(lang, "totalLabel")}: {money(sum.total, loc)}</strong>
      </p>
      <label>
        {t(lang, "notes")}
        <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="danger" onClick={removeDraft}>
          {t(lang, "deleteDraft")}
        </button>
        <span className="spacer" />
        <button disabled={busy}>{t(lang, "save")}</button>
        <button type="button" className={confirmIssue ? "danger confirm" : "primary"} disabled={busy} onClick={issue}>
          {confirmIssue ? t(lang, "confirmIssue") : t(lang, "issue")}
        </button>
      </div>
    </form>
  );
}

// The database's refusals (public.issue_invoice) in the user's language.
function explain(lang: Lang, msg: string) {
  if (msg.includes("company")) return t(lang, "companyMissing");
  if (msg.includes("customer")) return t(lang, "customerMissing");
  if (msg.includes("at least one line")) return t(lang, "needLine");
  if (msg.includes("Simplified")) return t(lang, "simplifiedLimit");
  return `${t(lang, "saveFailed")} ${msg}`;
}

// The invoice as printed. Labels in Spanish and English: legal text in Spanish, readable by foreign guests.
function InvoicePrint({ invoice, company, locale: loc }: { invoice: Invoice; company: Company | null; locale: string }) {
  const issuer = invoice.issuer ?? company;
  const lines = [...(invoice.invoice_lines ?? [])].sort((a, b) => a.sort - b.sort);
  const sum = totals(lines);
  const d = (x: string | null) => (x ? format(x, "es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
  const m = (n: number) => money(n, "es-ES");
  const title = { invoice: "Factura / Invoice", simplified: "Factura simplificada / Simplified invoice", corrective: "Factura rectificativa / Corrective invoice" }[invoice.kind];

  return (
    <article className={`invoice-print${invoice.status === "draft" ? " is-draft" : ""}`} lang="es">
      <header>
        <div>
          <h1>{title}</h1>
          <p>
            <strong>Nº:</strong> {invoice.full_number ?? "BORRADOR / DRAFT"}
            <br />
            <strong>Fecha / Date:</strong> {d(invoice.issue_date)}
            {invoice.operation_date && invoice.operation_date !== invoice.issue_date && (
              <>
                <br />
                <strong>Fecha de la operación / Date of service:</strong> {d(invoice.operation_date)}
              </>
            )}
          </p>
        </div>
        <div className="issuer">
          <strong>{issuer?.legal_name}</strong>
          <br />
          NIF: {issuer?.tax_id}
          <br />
          {issuer?.address}
          <br />
          {[issuer?.postal_code, issuer?.city, issuer?.province].filter(Boolean).join(" ")}
          {issuer?.country && <><br />{issuer.country}</>}
          {issuer?.email && <><br />{issuer.email}</>}
        </div>
      </header>

      {(invoice.customer_name || invoice.kind !== "simplified") && (
        <section className="customer">
          <span className="label">Cliente / Customer</span>
          <strong>{invoice.customer_name}</strong>
          {invoice.customer_tax_id && <span>NIF / ID: {invoice.customer_tax_id}</span>}
          {invoice.customer_address && <span>{invoice.customer_address}</span>}
          {invoice.customer_country && <span>{invoice.customer_country}</span>}
        </section>
      )}

      {invoice.kind === "corrective" && (
        <p className="corrects">
          Rectifica la factura / Corrects invoice <strong>{invoice.corrects?.full_number}</strong> ({d(invoice.corrects?.issue_date ?? null)}).
          {invoice.correction_reason && <> Motivo / Reason: {invoice.correction_reason}</>}
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Concepto / Description</th>
            <th>Cant. / Qty</th>
            <th>Precio / Price</th>
            <th>IVA / VAT</th>
            <th>Importe / Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id ?? i}>
              <td>{l.description}</td>
              <td>{l.quantity.toLocaleString(loc)}</td>
              <td>{m(Number(l.unit_price))}</td>
              <td>{Number(l.vat_rate)} %</td>
              <td>{m(Math.round(l.quantity * l.unit_price * 100) / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="sum">
        <tbody>
          {sum.byRate.map(([rate, r]) => (
            <tr key={rate}>
              <td>Base imponible / Taxable base ({rate} %)</td>
              <td>{m(r.base)}</td>
            </tr>
          ))}
          {sum.byRate.map(([rate, r]) => (
            <tr key={`v${rate}`}>
              <td>IVA / VAT {rate} %</td>
              <td>{m(r.vat)}</td>
            </tr>
          ))}
          <tr className="grand">
            <td>Total</td>
            <td>{m(invoice.status === "issued" ? Number(invoice.total) : sum.total)}</td>
          </tr>
        </tbody>
      </table>

      {invoice.notes && <p className="notes">{invoice.notes}</p>}
      {issuer?.invoice_footer && <footer>{issuer.invoice_footer}</footer>}
    </article>
  );
}

function CompanyDialog({ lang, company, onClose, onSaved }: { lang: Lang; company: Company; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState(company);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => ref.current?.showModal(), []);
  const field = (k: keyof Company, label: Parameters<typeof t>[1], type = "text") => (
    <label>
      {t(lang, label)}
      <input type={type} value={String(f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: type === "number" ? Number(e.target.value) : e.target.value }))} />
    </label>
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("company_settings").update(f).eq("id", true);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{t(lang, "company")}</h2>
        <div className="two">
          {field("legal_name", "legalName")}
          {field("tax_id", "companyTaxId")}
        </div>
        {field("address", "address")}
        <div className="two">
          {field("postal_code", "postalCode")}
          {field("city", "city")}
        </div>
        <div className="two">
          {field("province", "province")}
          {field("country", "country")}
        </div>
        <div className="two">
          {field("email", "email", "email")}
          {field("phone", "phone", "tel")}
        </div>
        {field("default_vat_rate", "defaultVat", "number")}
        <label>
          {t(lang, "footer")}
          <textarea rows={2} value={f.invoice_footer} onChange={(e) => setF((x) => ({ ...x, invoice_footer: e.target.value }))} />
        </label>
        <label>
          {t(lang, "bankDetails")}
          <textarea rows={3} value={f.bank_details} onChange={(e) => setF((x) => ({ ...x, bank_details: e.target.value }))} />
          <small className="muted">{t(lang, "bankDetailsHint")}</small>
        </label>
        {field("quote_valid_days", "quoteValidDays", "number")}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <span className="spacer" />
          <button type="button" onClick={() => ref.current?.close()}>
            {t(lang, "cancel")}
          </button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}
