// Invoice shapes and the same arithmetic the database uses when issuing (public.issue_invoice):
// each line's base rounded to the cent, its VAT rounded to the cent, then summed.

export type InvoiceKind = "invoice" | "simplified" | "corrective";

export interface InvoiceLine {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number; // before VAT
  vat_rate: number;
  sort: number;
}

export interface Company {
  legal_name: string;
  tax_id: string;
  address: string;
  postal_code: string;
  city: string;
  province: string;
  country: string;
  email: string;
  phone: string;
  default_vat_rate: number;
  invoice_footer: string;
  // Quotes: shown to guests once they accept; and how long a quote holds the dates.
  bank_details: string;
  quote_valid_days: number;
}

export interface Invoice {
  id: string;
  reservation_id: string | null;
  kind: InvoiceKind;
  status: "draft" | "issued";
  full_number: string | null;
  issue_date: string | null;
  operation_date: string | null;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  customer_country: string;
  customer_email: string;
  corrects_invoice_id: string | null;
  correction_reason: string;
  notes: string;
  total_base: number | null;
  total_vat: number | null;
  total: number | null;
  issuer: Company | null;
  verifactu_status: string | null;
  created_at: string;
  invoice_lines?: InvoiceLine[];
  corrects?: { full_number: string | null; issue_date: string | null } | null;
}

export const INVOICE_FIELDS =
  "id, reservation_id, kind, status, full_number, issue_date, operation_date, customer_name, customer_tax_id, customer_address, customer_country, customer_email, corrects_invoice_id, correction_reason, notes, total_base, total_vat, total, issuer, verifactu_status, created_at, invoice_lines(id, description, quantity, unit_price, vat_rate, sort), corrects:corrects_invoice_id(full_number, issue_date)";

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const lineBase = (l: InvoiceLine) => cents(l.quantity * l.unit_price);
export const lineVat = (l: InvoiceLine) => cents((lineBase(l) * l.vat_rate) / 100);

export function totals(lines: InvoiceLine[]) {
  const byRate = new Map<number, { base: number; vat: number }>();
  for (const l of lines) {
    const r = byRate.get(l.vat_rate) ?? { base: 0, vat: 0 };
    r.base = cents(r.base + lineBase(l));
    r.vat = cents(r.vat + lineVat(l));
    byRate.set(l.vat_rate, r);
  }
  const base = cents(lines.reduce((s, l) => s + lineBase(l), 0));
  const vat = cents(lines.reduce((s, l) => s + lineVat(l), 0));
  return { base, vat, total: cents(base + vat), byRate: [...byRate.entries()].sort((a, b) => b[0] - a[0]) };
}

// A price the guest paid, VAT included, turned into the price before VAT.
export const withoutVat = (gross: number, rate: number) => Math.round((gross / (1 + rate / 100)) * 10000) / 10000;

export const money = (n: number | null | undefined, locale: string) =>
  (n ?? 0).toLocaleString(locale, { style: "currency", currency: "EUR" });
