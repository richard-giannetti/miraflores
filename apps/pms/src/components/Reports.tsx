import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { daysBetween, format, today } from "../lib/dates";
import { locale, t, type Key, type Lang } from "../lib/i18n";
import { countryName } from "../lib/checkin";
import { eur, type Transaction } from "../lib/money";
import type { ReservationSource } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Icon, type IconName } from "./Icon";

interface Stay {
  id: string;
  unit_id: string;
  kind: "booking" | "block";
  source: ReservationSource;
  check_in: string;
  check_out: string;
  total_amount: number | null;
  created_at: string;
}

const iso = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
// Nights of [a, b) that fall inside [from, to).
const overlap = (a: string, b: string, from: string, to: string) => Math.max(0, daysBetween(a > from ? a : from, b < to ? b : to));

// The year at a glance, per villa or both: occupancy, rates, channels, lead time, nationalities, and the
// income/expense result from the ledger. Booking revenue is the amount entered on each reservation,
// spread over its nights.
export function Reports({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [year, setYear] = useState(() => Number(today().slice(0, 4)));
  const [villa, setVilla] = useState<string>("");
  const [stays, setStays] = useState<Stay[]>([]);
  const [money, setMoney] = useState<Transaction[]>([]);
  const [nations, setNations] = useState<{ nationality: string; reservation_id: string }[]>([]);
  const loc = locale[lang];
  const from = iso(year, 0);
  const to = iso(year + 1, 0);

  useEffect(() => {
    (async () => {
      const [r, m] = await Promise.all([
        supabase
          .from("reservations")
          .select("id, unit_id, kind, source, check_in, check_out, total_amount, created_at")
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .lt("check_in", to)
          .gt("check_out", from),
        supabase.from("transactions").select("id, kind, property_id, day, amount").is("deleted_at", null).gte("day", from).lt("day", to),
      ]);
      const list = (r.data ?? []) as Stay[];
      setStays(list);
      setMoney((m.data ?? []) as Transaction[]);
      const ids = list.filter((s) => s.kind === "booking").map((s) => s.id);
      if (!ids.length) return setNations([]);
      const c = await supabase.from("checkins").select("reservation_id, travellers(nationality)").in("reservation_id", ids);
      setNations(
        ((c.data ?? []) as unknown as { reservation_id: string; travellers: { nationality: string }[] }[]).flatMap((x) =>
          x.travellers.map((p) => ({ nationality: p.nationality, reservation_id: x.reservation_id })),
        ),
      );
    })();
  }, [from, to]);

  const units = villas.units.filter((u) => !villa || u.property_id === villa);
  const inVilla = (unitId: string) => units.some((u) => u.id === unitId);

  const r = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, m) => {
      const a = iso(year, m);
      const b = iso(year, m + 1);
      const days = daysBetween(a, b);
      let booked = 0;
      let blocked = 0;
      let revenue = 0;
      let paidNights = 0;
      for (const s of stays) {
        if (!inVilla(s.unit_id)) continue;
        const n = overlap(s.check_in, s.check_out, a, b);
        if (!n) continue;
        if (s.kind === "block") blocked += n;
        else {
          booked += n;
          if (s.total_amount != null) {
            revenue += (Number(s.total_amount) * n) / daysBetween(s.check_in, s.check_out);
            paidNights += n;
          }
        }
      }
      const available = days * units.length - blocked;
      const tx = money.filter((x) => x.day >= a && x.day < b && (!villa || x.property_id === villa));
      const income = tx.filter((x) => x.kind === "income").reduce((n, x) => n + Number(x.amount), 0);
      const expenses = tx.filter((x) => x.kind === "expense").reduce((n, x) => n + Number(x.amount), 0);
      return { month: a, available, booked, revenue, paidNights, income, expenses };
    });
    const total = months.reduce(
      (t, m) => ({
        available: t.available + m.available,
        booked: t.booked + m.booked,
        revenue: t.revenue + m.revenue,
        paidNights: t.paidNights + m.paidNights,
        income: t.income + m.income,
        expenses: t.expenses + m.expenses,
      }),
      { available: 0, booked: 0, revenue: 0, paidNights: 0, income: 0, expenses: 0 },
    );
    const bookings = stays.filter((s) => s.kind === "booking" && inVilla(s.unit_id) && s.check_in >= from && s.check_in < to);
    const channels = Object.entries(
      bookings.reduce<Record<string, { stays: number; nights: number; revenue: number }>>((acc, s) => {
        const c = (acc[s.source] ??= { stays: 0, nights: 0, revenue: 0 });
        c.stays++;
        c.nights += daysBetween(s.check_in, s.check_out);
        c.revenue += Number(s.total_amount ?? 0);
        return acc;
      }, {}),
    ).sort((a, b) => b[1].nights - a[1].nights);
    const leads = bookings.map((s) => daysBetween(s.created_at.slice(0, 10), s.check_in)).filter((d) => d >= 0);
    const ids = new Set(bookings.map((s) => s.id));
    const nat = Object.entries(
      nations.filter((n) => ids.has(n.reservation_id)).reduce<Record<string, number>>((acc, n) => ((acc[n.nationality] = (acc[n.nationality] ?? 0) + 1), acc), {}),
    ).sort((a, b) => b[1] - a[1]);
    return { months, total, channels, lead: leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : null, nat, travellers: nat.reduce((n, [, c]) => n + c, 0) };
  }, [stays, money, nations, villa, villas.units, year]);

  // One decimal under 10 %, so a few nights don't read as zero.
  const pct = (a: number, b: number) => {
    if (!b) return "—";
    const p = (100 * a) / b;
    return `${p > 0 && p < 10 ? p.toLocaleString(loc, { maximumFractionDigits: 1 }) : Math.round(p)} %`;
  };
  const money0 = (n: number) => eur(Math.round(n), loc).replace(/[.,]00(?=\s|$)/, "");
  const tiles: { icon: IconName; label: Key; value: string; neg?: boolean }[] = [
    { icon: "bed", label: "occupancy", value: pct(r.total.booked, r.total.available) },
    { icon: "money", label: "adr", value: r.total.paidNights ? money0(r.total.revenue / r.total.paidNights) : "—" },
    { icon: "money", label: "revpar", value: r.total.available ? money0(r.total.revenue / r.total.available) : "—" },
    { icon: "invoices", label: "bookingRevenue", value: money0(r.total.revenue) },
    { icon: "money", label: "result", value: money0(r.total.income - r.total.expenses), neg: r.total.income < r.total.expenses },
    { icon: "calendar", label: "leadTime", value: r.lead == null ? "—" : `${r.lead} ${t(lang, r.lead === 1 ? "dayWorked" : "daysWorked")}` },
  ];

  function exportCsv() {
    const n = (x: number) => x.toFixed(2).replace(".", ",");
    const rows = [["Mes", "Noches disponibles", "Noches reservadas", "Ocupación %", "Ingresos reservas", "Ingresos (caja)", "Gastos", "Resultado"]];
    for (const m of r.months)
      rows.push([m.month.slice(0, 7), String(m.available), String(m.booked), m.available ? n((100 * m.booked) / m.available) : "", n(m.revenue), n(m.income), n(m.expenses), n(m.income - m.expenses)]);
    const csv = "﻿" + rows.map((x) => x.join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `resumen-${year}${villa ? `-${villas.properties.find((v) => v.id === villa)?.slug}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="toolbar">
        <div className="nav">
          <button className="icon-btn" onClick={() => setYear(year - 1)} aria-label={t(lang, "previous")}><Icon name="left" /></button>
          <span className="range">{year}</span>
          <button className="icon-btn" onClick={() => setYear(year + 1)} aria-label={t(lang, "next")}><Icon name="right" /></button>
          <div className="segmented">
            <button className={villa === "" ? "on" : ""} onClick={() => setVilla("")}>{t(lang, "bothVillas")}</button>
            {villas.properties.map((v) => (
              <button key={v.id} className={villa === v.id ? "on" : ""} onClick={() => setVilla(v.id)}>{v.name.replace(/^Villa /, "")}</button>
            ))}
          </div>
        </div>
        <button onClick={exportCsv}>{t(lang, "exportCsv")}</button>
      </div>

      <div className="stats report-stats">
        {tiles.map((x) => (
          <div key={x.label} className="stat">
            <span className="h-icon"><Icon name={x.icon} size={16} /></span>
            <strong className={x.neg ? "negative" : ""}>{x.value}</strong>
            <span>{t(lang, x.label)}</span>
          </div>
        ))}
      </div>

      <section className="panel table-panel">
        <h2>{t(lang, "byMonth")}</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t(lang, "month")}</th>
                <th>{t(lang, "nightsBooked")}</th>
                <th>{t(lang, "occupancy")}</th>
                <th>{t(lang, "bookingRevenue")}</th>
                <th>{t(lang, "income")}</th>
                <th>{t(lang, "expenses")}</th>
                <th>{t(lang, "result")}</th>
              </tr>
            </thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month} className={m.month.slice(0, 7) === today().slice(0, 7) ? "is-today" : ""}>
                  <th className="month-label">{format(m.month, loc, { month: "long" })}</th>
                  <td>{m.booked} / {m.available}</td>
                  <td>{pct(m.booked, m.available)}</td>
                  <td>{money0(m.revenue)}</td>
                  <td>{money0(m.income)}</td>
                  <td>{money0(m.expenses)}</td>
                  <td className={m.income < m.expenses ? "negative" : ""}>{money0(m.income - m.expenses)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t(lang, "total")}</th>
                <td>{r.total.booked} / {r.total.available}</td>
                <td>{pct(r.total.booked, r.total.available)}</td>
                <td>{money0(r.total.revenue)}</td>
                <td>{money0(r.total.income)}</td>
                <td>{money0(r.total.expenses)}</td>
                <td className={r.total.income < r.total.expenses ? "negative" : ""}>{money0(r.total.income - r.total.expenses)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="columns report-columns">
        <section className="panel">
          <h2>{t(lang, "byChannel")}</h2>
          {r.channels.length === 0 ? (
            <p className="muted">{t(lang, "nothing")}</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, "source")}</th>
                  <th>{t(lang, "stays")}</th>
                  <th>{t(lang, "nights")}</th>
                  <th>{t(lang, "bookingRevenue")}</th>
                </tr>
              </thead>
              <tbody>
                {r.channels.map(([s, c]) => (
                  <tr key={s}>
                    <th>{t(lang, `source_${s}` as Key)}</th>
                    <td>{c.stays}</td>
                    <td>{c.nights}</td>
                    <td>{money0(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <h2>
            {t(lang, "nationalities")} <span className="count">{r.travellers}</span>
          </h2>
          {r.nat.length === 0 ? (
            <p className="muted">{t(lang, "noNationalities")}</p>
          ) : (
            <table className="data">
              <tbody>
                {r.nat.slice(0, 12).map(([code, n]) => (
                  <tr key={code}>
                    <th>{countryName(code, loc)}</th>
                    <td>{n}</td>
                    <td>{pct(n, r.travellers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <p className="hint">{t(lang, "reportsNote")}</p>
    </>
  );
}
