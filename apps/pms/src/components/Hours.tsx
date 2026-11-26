import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { format, today } from "../lib/dates";
import { locale, t, type Key, type Lang } from "../lib/i18n";
import { ENTRY_FIELDS, LONG_OPEN_MIN, dayStartIso, entryMinutes, hm, localDay, localTime } from "../lib/staff";
import { departments, type StaffMember, type TimeEntry } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Avatar, Icon } from "./Icon";

interface Change {
  id: string;
  entry_id: string;
  action: "added" | "corrected" | "voided";
  old_clock_in: string | null;
  old_clock_out: string | null;
  new_clock_in: string | null;
  new_clock_out: string | null;
  reason: string;
  changed_at: string;
}

const nextMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

// Entries of one month (villas' local dates), for one person or everyone.
export async function loadMonth(month: string, staffId?: string) {
  let q = supabase
    .from("time_entries")
    .select(ENTRY_FIELDS)
    .gte("clock_in", dayStartIso(`${month}-01`))
    .lt("clock_in", dayStartIso(`${nextMonth(month, 1)}-01`))
    .order("clock_in");
  if (staffId) q = q.eq("staff_id", staffId);
  const { data } = await q;
  return (data ?? []) as TimeEntry[];
}

export const monthTotal = (entries: TimeEntry[]) => entries.filter((e) => !e.voided_at).reduce((n, e) => n + entryMinutes(e), 0);

// The working-time register: what each person actually clocked, month by month. Managers fix mistakes
// here (with a reason that's kept), export it for the gestor and print it for signing.
export function Hours({ lang, villas, staff }: { lang: Lang; villas: Villas; staff: StaffMember[] }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [edit, setEdit] = useState<{ entry?: TimeEntry; staff: StaffMember } | null>(null);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const list = await loadMonth(month);
    setEntries(list);
    const ids = list.map((e) => e.id);
    const c = ids.length ? await supabase.from("time_entry_changes").select("*").in("entry_id", ids).order("changed_at") : { data: [] };
    setChanges((c.data ?? []) as Change[]);
  }, [month]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const people = staff
    .filter((s) => s.active || entries.some((e) => e.staff_id === s.id))
    .sort((a, b) => departments.indexOf(a.department) - departments.indexOf(b.department) || a.full_name.localeCompare(b.full_name));
  const villaName = (id: string | null) => villas.properties.find((v) => v.id === id)?.name ?? "";
  const monthLabel = format(`${month}-01`, loc, { month: "long", year: "numeric" });

  function exportCsv() {
    const rows = [["Nombre", "Departamento", "Fecha", "Entrada", "Salida", "Horas", "Villa", "Origen", "Anulado"]];
    for (const p of people)
      for (const e of entries.filter((x) => x.staff_id === p.id))
        rows.push([
          p.full_name,
          t("es", `dept_${p.department}`),
          localDay(e.clock_in),
          localTime(e.clock_in),
          e.clock_out ? localTime(e.clock_out) : "",
          e.clock_out ? (entryMinutes(e) / 60).toFixed(2).replace(".", ",") : "",
          villaName(e.property_id),
          e.source === "manual" ? "Manual" : "App",
          e.voided_at ? "Sí" : "",
        ]);
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `registro-jornada-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // One page per person, in Spanish, with room for both signatures (the legal register).
  function printRegister() {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const pages = people
      .map((p) => {
        const mine = entries.filter((e) => e.staff_id === p.id && !e.voided_at);
        const rows = mine
          .map((e) => `<tr><td>${localDay(e.clock_in).split("-").reverse().join("/")}</td><td>${localTime(e.clock_in)}</td><td>${e.clock_out ? localTime(e.clock_out) : "—"}</td><td>${e.clock_out ? hm(entryMinutes(e)) : ""}</td><td>${esc(villaName(e.property_id))}</td><td>${e.source === "manual" ? "Manual" : ""}</td></tr>`)
          .join("");
        return `<section><h1>Registro de jornada · ${esc(format(`${month}-01`, "es-ES", { month: "long", year: "numeric" }))}</h1>
<p><b>Trabajador:</b> ${esc(p.full_name)} · <b>Departamento:</b> ${esc(t("es", `dept_${p.department}`))}</p>
<table><thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Villa</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">Sin fichajes</td></tr>'}</tbody></table>
<p class="total"><b>Total:</b> ${hm(monthTotal(mine))}</p>
<div class="sign"><div>Firma de la empresa</div><div>Firma del trabajador</div></div></section>`;
      })
      .join("");
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Registro de jornada ${month}</title>
<style>body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:28px}h1{font-size:16px;margin:0 0 6px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}th{color:#555}.total{margin-top:10px}.sign{display:flex;gap:40px;margin-top:48px}.sign div{flex:1;border-top:1px solid #999;padding-top:6px;color:#555}section{page-break-after:always}section:last-child{page-break-after:auto}</style>
${pages}<script>print()</script>`);
    w.document.close();
  }

  return (
    <>
      <div className="toolbar">
        <div className="nav">
          <button className="icon-btn" onClick={() => setMonth(nextMonth(month, -1))} aria-label={t(lang, "previous")}><Icon name="left" /></button>
          <span className="range month-label">{monthLabel}</span>
          <button className="icon-btn" onClick={() => setMonth(nextMonth(month, 1))} aria-label={t(lang, "next")}><Icon name="right" /></button>
        </div>
        <div className="nav">
          <button onClick={exportCsv}>{t(lang, "exportCsv")}</button>
          <button onClick={printRegister}><Icon name="printer" size={18} /> {t(lang, "printRegister")}</button>
        </div>
      </div>
      <p className="hint top-hint">{t(lang, "hoursNote")}</p>

      {people.length === 0 && <p className="muted">{t(lang, "noStaff")}</p>}
      <div className="hours">
        {people.map((p) => {
          const mine = entries.filter((e) => e.staff_id === p.id);
          const valid = mine.filter((e) => !e.voided_at);
          const days = new Set(valid.map((e) => localDay(e.clock_in))).size;
          const open = valid.filter((e) => !e.clock_out);
          return (
            <details key={p.id} className="panel hours-person" open={open.some((e) => entryMinutes(e) > LONG_OPEN_MIN) || undefined}>
              <summary>
                <Avatar name={p.full_name} />
                <span className="who-text">
                  <strong>{p.full_name}</strong>
                  <small>{t(lang, `dept_${p.department}`)}</small>
                </span>
                {open.length > 0 && <span className="pill in_progress">{t(lang, "stillOpen")}</span>}
                <span className="hours-total">
                  <strong>{hm(monthTotal(valid))}</strong>
                  <small>{days} {t(lang, days === 1 ? "dayWorked" : "daysWorked")}</small>
                </span>
              </summary>
              {mine.length === 0 ? (
                <p className="muted">{t(lang, "noEntries")}</p>
              ) : (
                <ul className="list">
                  {mine.map((e) => {
                    const long = !e.clock_out && entryMinutes(e) > LONG_OPEN_MIN;
                    const edited = changes.some((c) => c.entry_id === e.id && c.action !== "added");
                    return (
                      <li key={e.id} className={`item entry${e.voided_at ? " voided" : ""}`}>
                        <span className="entry-day">{format(localDay(e.clock_in), loc, { weekday: "short", day: "numeric" })}</span>
                        <span className="entry-times">
                          <strong>{localTime(e.clock_in)} – {e.clock_out ? localTime(e.clock_out) : "…"}</strong>
                          <small>{[villaName(e.property_id), e.source === "manual" && t(lang, "manual"), edited && t(lang, "edited")].filter(Boolean).join(" · ")}</small>
                        </span>
                        {long && <span className="pill warn-pill">{t(lang, "forgotClockOut")}</span>}
                        <span className="spacer" />
                        <span className="entry-hours">{e.clock_out ? hm(entryMinutes(e)) : ""}</span>
                        {!e.voided_at && (
                          <button className="small-btn" onClick={() => setEdit({ entry: e, staff: p })}>{t(lang, "fix")}</button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button className="small-btn add-entry" onClick={() => setEdit({ staff: p })}>
                <Icon name="plus" size={14} /> {t(lang, "addEntry")}
              </button>
            </details>
          );
        })}
      </div>

      {edit && (
        <EntryDialog
          lang={lang}
          villas={villas}
          staff={edit.staff}
          entry={edit.entry}
          changes={changes.filter((c) => c.entry_id === edit.entry?.id)}
          month={month}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

const errors: Record<string, Key> = { reason_required: "reasonRequired", time_entries_order_check: "badTimes" };

function EntryDialog({
  lang,
  villas,
  staff,
  entry,
  changes,
  month,
  onClose,
  onSaved,
}: {
  lang: Lang;
  villas: Villas;
  staff: StaffMember;
  entry?: TimeEntry;
  changes: Change[];
  month: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const firstDay = today().startsWith(month) ? today() : `${month}-01`;
  const [f, setF] = useState({
    day: entry ? localDay(entry.clock_in) : firstDay,
    in: entry ? localTime(entry.clock_in) : "09:00",
    out: entry?.clock_out ? localTime(entry.clock_out) : entry ? "" : "15:00",
    property: entry?.property_id ?? "",
    reason: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const loc = locale[lang];
  useEffect(() => ref.current?.showModal(), []);

  const explain = (msg: string) => {
    const k = Object.keys(errors).find((x) => msg.includes(x));
    return k ? t(lang, errors[k]) : `${t(lang, "saveFailed")} ${msg}`;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.reason.trim()) return setError(t(lang, "reasonRequired"));
    const { error } = entry
      ? await supabase.rpc("correct_time_entry", { p_id: entry.id, p_day: f.day, p_in: f.in, p_out: f.out || null, p_reason: f.reason })
      : await supabase.rpc("add_time_entry", { p_staff: staff.id, p_property: f.property || null, p_day: f.day, p_in: f.in, p_out: f.out, p_reason: f.reason });
    if (error) return setError(explain(error.message));
    onSaved();
  }

  async function voidIt() {
    if (!f.reason.trim()) return setError(t(lang, "reasonRequired"));
    if (!confirmVoid) return setConfirmVoid(true);
    const { error } = await supabase.rpc("void_time_entry", { p_id: entry!.id, p_reason: f.reason });
    if (error) return setError(explain(error.message));
    onSaved();
  }

  const when = (iso: string | null) => (iso ? `${format(localDay(iso), loc, { day: "numeric", month: "short" })} ${localTime(iso)}` : "…");

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{entry ? t(lang, "editEntry") : t(lang, "addEntry")}</h2>
        <p className="muted">{staff.full_name}</p>
        <label>{t(lang, "date")}<input type="date" value={f.day} onChange={(e) => e.target.value && setF({ ...f, day: e.target.value })} required /></label>
        <div className="two">
          <label>{t(lang, "from")}<input type="time" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} required /></label>
          <label>{t(lang, "to")}<input type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} required={!entry || !!entry.clock_out} /></label>
        </div>
        {!entry && (
          <label>
            {t(lang, "villa")}
            <select value={f.property} onChange={(e) => setF({ ...f, property: e.target.value })}>
              <option value="">{t(lang, "anyVilla")}</option>
              {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        )}
        <label>{t(lang, "reason")}<input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required /></label>
        {changes.length > 0 && (
          <>
            <h3>{t(lang, "history")}</h3>
            <ul className="list history">
              {changes.map((c) => (
                <li key={c.id} className="item">
                  <span>
                    <strong>{new Date(c.changed_at).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })} · {c.reason}</strong>
                    <small>
                      {c.action === "added" ? `+ ${when(c.new_clock_in)} – ${when(c.new_clock_out)}` : c.action === "voided" ? `✕ ${when(c.old_clock_in)} – ${when(c.old_clock_out)}` : `${when(c.old_clock_in)} – ${when(c.old_clock_out)} → ${when(c.new_clock_in)} – ${when(c.new_clock_out)}`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {entry && (
            <button type="button" className={`danger${confirmVoid ? " confirm" : ""}`} onClick={voidIt}>
              {confirmVoid ? t(lang, "sureVoid") : t(lang, "voidEntry")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}
