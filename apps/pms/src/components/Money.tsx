import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { format, today } from "../lib/dates";
import { locale, t, type Key, type Lang } from "../lib/i18n";
import { TX_FIELDS, eur, expenseCategories, incomeCategories, methods, readAirbnb, type AirbnbRow, type MoneyKind, type Transaction } from "../lib/money";
import type { Villas } from "../lib/villas";
import { Icon } from "./Icon";
import { Reports } from "./Reports";

const views = ["summary", "ledger"] as const;

// Money: the year at a glance (summary) and every income and expense (ledger). Owners and managers only.
export function Money({ lang, villas, view }: { lang: Lang; villas: Villas; view: string | null }) {
  const v = view === "ledger" ? "ledger" : "summary";
  return (
    <main className="page">
      <div className="page-head">
        <h1 className="title">{t(lang, "tab_money")}</h1>
        <div className="segmented" role="tablist">
          {views.map((x) => (
            <button key={x} role="tab" aria-selected={x === v} className={x === v ? "on" : ""} onClick={() => (location.hash = x === "summary" ? "#money" : "#money/ledger")}>
              {t(lang, x)}
            </button>
          ))}
        </div>
      </div>
      {v === "summary" ? <Reports lang={lang} villas={villas} /> : <Ledger lang={lang} villas={villas} />}
    </main>
  );
}

const shift = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
};

function Ledger({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [list, setList] = useState<Transaction[]>([]);
  const [kind, setKind] = useState<"all" | MoneyKind>("all");
  const [open, setOpen] = useState<Transaction | MoneyKind | null>(null);
  const [importing, setImporting] = useState(false);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("transactions")
      .select(TX_FIELDS)
      .is("deleted_at", null)
      .gte("day", `${month}-01`)
      .lt("day", `${shift(month, 1)}-01`)
      .order("day", { ascending: false });
    if (data) setList(data as Transaction[]);
  }, [month]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const shown = list.filter((x) => kind === "all" || x.kind === kind);
  const sum = (k: MoneyKind) => list.filter((x) => x.kind === k).reduce((n, x) => n + Number(x.amount), 0);
  const villaName = (id: string | null) => (id ? (villas.properties.find((v) => v.id === id)?.name ?? "") : t(lang, "bothVillas"));

  // For the gestor: one line per movement, Spanish headers, semicolons and decimal commas (opens in Excel).
  function exportCsv() {
    const n = (x: number) => x.toFixed(2).replace(".", ",");
    const rows = [["Fecha", "Tipo", "Categoría", "Villa", "Concepto", "Proveedor / cliente", "Importe (IVA incl.)", "IVA %", "Base", "Cuota IVA", "Forma de pago", "Referencia"]];
    for (const x of [...list].sort((a, b) => a.day.localeCompare(b.day))) {
      const base = x.vat_rate ? Number(x.amount) / (1 + Number(x.vat_rate) / 100) : Number(x.amount);
      rows.push([
        x.day.split("-").reverse().join("/"),
        x.kind === "income" ? "Ingreso" : "Gasto",
        t("es", `cat_${x.category}` as Key),
        villaName(x.property_id).replace(t(lang, "bothVillas"), "Ambas"),
        x.description,
        x.counterparty,
        n(Number(x.amount)),
        x.vat_rate != null ? n(Number(x.vat_rate)) : "",
        x.vat_rate != null ? n(base) : "",
        x.vat_rate != null ? n(Number(x.amount) - base) : "",
        x.method ? t("es", `method_${x.method}` as Key) : "",
        x.external_ref ?? "",
      ]);
    }
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ingresos-gastos-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="toolbar">
        <div className="nav">
          <button className="icon-btn" onClick={() => setMonth(shift(month, -1))} aria-label={t(lang, "previous")}><Icon name="left" /></button>
          <span className="range month-label">{format(`${month}-01`, loc, { month: "long", year: "numeric" })}</span>
          <button className="icon-btn" onClick={() => setMonth(shift(month, 1))} aria-label={t(lang, "next")}><Icon name="right" /></button>
        </div>
        <div className="nav">
          <button onClick={() => setImporting(true)}>{t(lang, "importAirbnb")}</button>
          <button onClick={exportCsv} disabled={!list.length}>{t(lang, "exportCsv")}</button>
          <button onClick={() => setOpen("expense")}><Icon name="plus" size={16} /> {t(lang, "newExpense")}</button>
          <button className="primary" onClick={() => setOpen("income")}><Icon name="plus" size={16} /> {t(lang, "newIncome")}</button>
        </div>
      </div>

      <div className="stats money-stats">
        {(
          [
            ["income", sum("income")],
            ["expenses", sum("expense")],
            ["result", sum("income") - sum("expense")],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="stat">
            <span className="h-icon"><Icon name="money" size={16} /></span>
            <strong className={k === "result" && v < 0 ? "negative" : ""}>{eur(v, loc)}</strong>
            <span>{t(lang, k)}</span>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="segmented">
          {(["all", "income", "expense"] as const).map((k) => (
            <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
              {t(lang, k === "all" ? "all" : k === "income" ? "income" : "expenses")}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted">{t(lang, "noMovements")}</p>
      ) : (
        <ul className="list panel">
          {shown.map((x) => (
            <li key={x.id} className="item">
              <button className="item-main" onClick={() => setOpen(x)}>
                <span className="entry-day">{format(x.day, loc, { day: "numeric", month: "short" })}</span>
                <span>
                  <strong>{x.description || t(lang, `cat_${x.category}` as Key)}</strong>
                  <small>{[t(lang, `cat_${x.category}` as Key), villaName(x.property_id), x.counterparty].filter(Boolean).join(" · ")}</small>
                </span>
              </button>
              <span className={`amount ${x.kind}`}>{x.kind === "expense" ? "−" : "+"}{eur(Number(x.amount), loc)}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <TxDialog
          lang={lang}
          villas={villas}
          tx={typeof open === "string" ? null : open}
          kind={typeof open === "string" ? open : open.kind}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            refresh();
          }}
        />
      )}
      {importing && (
        <ImportDialog
          lang={lang}
          villas={villas}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

function TxDialog({ lang, villas, tx, kind, onClose, onSaved }: { lang: Lang; villas: Villas; tx: Transaction | null; kind: MoneyKind; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cats = kind === "income" ? incomeCategories : expenseCategories;
  const [f, setF] = useState({
    day: tx?.day ?? today(),
    category: tx?.category ?? cats[0],
    property_id: tx?.property_id ?? "",
    description: tx?.description ?? "",
    counterparty: tx?.counterparty ?? "",
    amount: tx ? String(tx.amount).replace(".", ",") : "",
    vat_rate: tx?.vat_rate != null ? String(tx.vat_rate) : kind === "expense" ? "21" : "",
    method: tx?.method ?? "transfer",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => ref.current?.showModal(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(f.amount.replace(/\./g, "").replace(",", "."));
    if (!(amount > 0)) return setError(t(lang, "amountRequired"));
    const row = {
      kind,
      day: f.day,
      category: f.category,
      property_id: f.property_id || null,
      description: f.description.trim(),
      counterparty: f.counterparty.trim(),
      amount,
      vat_rate: f.vat_rate === "" ? null : Number(f.vat_rate),
      method: f.method,
    };
    const { error } = tx ? await supabase.from("transactions").update(row).eq("id", tx.id) : await supabase.from("transactions").insert(row);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", tx!.id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{t(lang, kind === "income" ? (tx ? "income" : "newIncome") : tx ? "expense" : "newExpense")}</h2>
        <div className="two">
          <label>{t(lang, "date")}<input type="date" value={f.day} onChange={(e) => e.target.value && setF({ ...f, day: e.target.value })} required /></label>
          <label>
            {t(lang, "category")}
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {cats.map((c) => <option key={c} value={c}>{t(lang, `cat_${c}`)}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label>{t(lang, "amountInclVat")}<input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus={!tx} required /></label>
          <label>
            {t(lang, "vat")}
            <select value={f.vat_rate} onChange={(e) => setF({ ...f, vat_rate: e.target.value })}>
              <option value="">{t(lang, "noVat")}</option>
              {["0", "4", "10", "21"].map((r) => <option key={r} value={r}>{r} %</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label>
            {t(lang, "villa")}
            <select value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value })}>
              <option value="">{t(lang, "bothVillas")}</option>
              {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label>
            {t(lang, "paymentMethod")}
            <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {methods.map((m) => <option key={m} value={m}>{t(lang, `method_${m}`)}</option>)}
            </select>
          </label>
        </div>
        <label>{t(lang, "description")}<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label>{t(lang, kind === "income" ? "fromWhom" : "supplier")}<input value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></label>
        {tx?.external_ref && <p className="hint">{t(lang, "importedRef")} {tx.external_ref}</p>}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {tx && (
            <button type="button" className={`danger${confirmDelete ? " confirm" : ""}`} onClick={remove}>
              {confirmDelete ? t(lang, "sureDelete") : t(lang, "delete")}
            </button>
          )}
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}

// Airbnb's earnings CSV → one income per reservation (gross) and its host service fee as an expense.
function ImportDialog({ lang, villas, onClose, onDone }: { lang: Lang; villas: Villas; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<AirbnbRow[] | null>(null);
  const [listingVilla, setListingVilla] = useState<Record<string, string>>({});
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = locale[lang];
  useEffect(() => ref.current?.showModal(), []);

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    const parsed = readAirbnb(await file.text());
    if (!parsed) return setError(t(lang, "notAirbnbCsv"));
    setRows(parsed);
    // Guess each listing's villa from its name ("…Playa…" → Villa La Playa).
    const guess: Record<string, string> = {};
    for (const l of new Set(parsed.map((r) => r.listing))) {
      const v = villas.properties.find((p) => p.name.split(/\s+/).some((w) => w.length > 3 && !/^villa$/i.test(w) && l.toLowerCase().includes(w.toLowerCase())));
      guess[l] = v?.id ?? "";
    }
    setListingVilla(guess);
    const refs = parsed.map((r) => `airbnb:${r.code}`);
    const { data } = await supabase.from("transactions").select("external_ref").in("external_ref", refs).is("deleted_at", null);
    setKnown(new Set((data ?? []).map((d) => d.external_ref!.slice(7))));
  }

  const fresh = (rows ?? []).filter((r) => !known.has(r.code));

  async function importRows() {
    setBusy(true);
    setError(null);
    // Link each payout to the booking with the same villa and arrival day, when there is one.
    const { data: res } = await supabase.from("reservations").select("id, unit_id, check_in").is("deleted_at", null).in("check_in", [...new Set(fresh.map((r) => r.checkIn).filter(Boolean))]);
    const booking = (r: AirbnbRow) => {
      const villa = listingVilla[r.listing];
      return res?.find((x) => x.check_in === r.checkIn && villas.units.find((u) => u.id === x.unit_id)?.property_id === villa)?.id ?? null;
    };
    const tx = fresh.flatMap((r) => {
      const common = { property_id: listingVilla[r.listing] || null, reservation_id: booking(r), day: r.day, method: "airbnb", counterparty: "Airbnb" };
      const desc = [r.guest, r.checkIn && format(r.checkIn, loc, { day: "numeric", month: "short" }), r.nights && `${r.nights} ${t(lang, "nights")}`, r.code].filter(Boolean).join(" · ");
      return [
        { ...common, kind: "income", category: "airbnb", amount: r.gross, description: desc, external_ref: `airbnb:${r.code}` },
        ...(r.fee > 0 ? [{ ...common, kind: "expense", category: "commissions", amount: r.fee, vat_rate: 21, description: `${t(lang, "airbnbFee")} · ${r.code}`, external_ref: `airbnb-fee:${r.code}` }] : []),
      ];
    });
    const { error } = tx.length ? await supabase.from("transactions").insert(tx) : { error: null };
    setBusy(false);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onDone();
  }

  return (
    <dialog ref={ref} className="dialog wide" onClose={onClose} onCancel={onClose}>
      <div className="dialog-body">
        <h2>{t(lang, "importAirbnb")}</h2>
        <p className="muted">{t(lang, "importAirbnbHint")}</p>
        <label>{t(lang, "csvFile")}<input type="file" accept=".csv,text/csv" onChange={(e) => read(e.target.files?.[0])} /></label>
        {rows && (
          <>
            <h3>{t(lang, "listings")}</h3>
            {Object.keys(listingVilla).map((l) => (
              <label key={l} className="inline">
                <span className="spacer">{l || "—"}</span>
                <select value={listingVilla[l]} onChange={(e) => setListingVilla({ ...listingVilla, [l]: e.target.value })}>
                  <option value="">{t(lang, "bothVillas")}</option>
                  {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
            ))}
            <h3>
              {fresh.length} {t(lang, "toImport")}
              {known.size > 0 && <span className="muted"> · {known.size} {t(lang, "alreadyImported")}</span>}
            </h3>
            <ul className="list">
              {fresh.slice(0, 50).map((r) => (
                <li key={r.code} className="item">
                  <span>
                    <strong>{r.guest || r.code}</strong>
                    <small>{[r.checkIn && format(r.checkIn, loc, { day: "numeric", month: "short", year: "numeric" }), r.nights && `${r.nights} ${t(lang, "nights")}`, r.listing].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="spacer" />
                  <span className="amount income">+{eur(r.gross, loc)}</span>
                  {r.fee > 0 && <span className="amount expense">−{eur(r.fee, loc)}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary" disabled={busy || !fresh.length} onClick={importRows}>{t(lang, "import")}</button>
        </div>
      </div>
    </dialog>
  );
}
