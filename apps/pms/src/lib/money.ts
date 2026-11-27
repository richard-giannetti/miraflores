// Income and expenses (supabase/migrations/20261127100000_money.sql) and Airbnb's earnings CSV.

export type MoneyKind = "income" | "expense";
export const incomeCategories = ["stay", "airbnb", "extra", "other_income"] as const;
export const expenseCategories = ["cleaning", "laundry", "utilities", "repairs", "supplies", "commissions", "taxes", "insurance", "refunds", "other"] as const;
export const methods = ["transfer", "card", "cash", "airbnb", "other"] as const;

export interface Transaction {
  id: string;
  kind: MoneyKind;
  property_id: string | null;
  reservation_id: string | null;
  day: string;
  category: string;
  description: string;
  amount: number;
  vat_rate: number | null;
  method: string;
  counterparty: string;
  external_ref: string | null;
}

export const TX_FIELDS = "id, kind, property_id, reservation_id, day, category, description, amount, vat_rate, method, counterparty, external_ref";

export const eur = (n: number, loc: string) => n.toLocaleString(loc, { style: "currency", currency: "EUR" });

// A small CSV reader: quoted fields, commas or semicolons, CRLF.
export function parseCsv(text: string): string[][] {
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      (row = []), (cell = "");
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

// Airbnb writes dates as MM/DD/YYYY (sometimes YYYY-MM-DD).
const isoDate = (s: string) => {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
};
const num = (s: string | undefined) => {
  if (!s?.trim()) return 0;
  const t = s.replace(/[^\d,.-]/g, "");
  // "1.234,56" (European) or "1,234.56" / "1234.56".
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export interface AirbnbRow {
  code: string;
  day: string; // payout date
  checkIn: string;
  nights: number;
  guest: string;
  listing: string;
  net: number; // what Airbnb pays the host
  fee: number; // Airbnb's host service fee
  gross: number;
}

// Reservations from Airbnb's "Transaction history" / earnings CSV. Other row types (payouts, adjustments) are skipped.
export function readAirbnb(text: string): AirbnbRow[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const c = {
    date: col("date", "fecha"),
    type: col("type", "tipo"),
    code: col("confirmation code", "código de confirmación"),
    start: col("start date", "fecha de inicio"),
    nights: col("nights", "noches"),
    guest: col("guest", "huésped"),
    listing: col("listing", "anuncio"),
    amount: col("amount", "importe"),
    fee: col("service fee", "comisión de servicio"),
    gross: col("gross earnings", "ganancias brutas"),
  };
  if (c.code < 0 || c.amount < 0 || c.type < 0) return null;
  return rows
    .slice(1)
    .filter((r) => /reserva|reservation/i.test(r[c.type] ?? "") && r[c.code]?.trim())
    .map((r) => {
      const net = num(r[c.amount]);
      const fee = Math.abs(num(r[c.fee]));
      const gross = c.gross >= 0 && num(r[c.gross]) ? num(r[c.gross]) : net + fee;
      return {
        code: r[c.code].trim(),
        day: isoDate(r[c.date] ?? "") || isoDate(r[c.start] ?? ""),
        checkIn: isoDate(r[c.start] ?? ""),
        nights: num(r[c.nights]),
        guest: (r[c.guest] ?? "").trim(),
        listing: (r[c.listing] ?? "").trim(),
        net,
        fee,
        gross,
      };
    })
    .filter((r) => r.day && r.net > 0);
}
