import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { addDays, format, range, startOfWeek, today, type Day } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { SHIFT_FIELDS, hm, shiftMinutes, short } from "../lib/staff";
import { departments, shiftKinds, type Shift, type ShiftKind, type StaffMember } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Avatar, Icon } from "./Icon";

type Draft = Omit<Shift, "id"> & { id?: string };

// The planned week: one row per person, one column per day. Click a day to add a shift.
export function Schedule({ lang, villas, staff }: { lang: Lang; villas: Villas; staff: StaffMember[] }) {
  const [week, setWeek] = useState<Day>(() => startOfWeek(today()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const days = range(week, 7);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("shifts").select(SHIFT_FIELDS).is("deleted_at", null).gte("day", week).lte("day", addDays(week, 6)).order("starts");
    if (data) setShifts(data as Shift[]);
  }, [week]);

  useEffect(() => {
    refresh();
    setNotice(null);
  }, [refresh]);

  const people = staff
    .filter((s) => s.active)
    .sort((a, b) => departments.indexOf(a.department) - departments.indexOf(b.department) || a.full_name.localeCompare(b.full_name));

  // Repeat last week's shifts on the same weekdays, without touching days already planned.
  async function copyLastWeek() {
    const { data } = await supabase.from("shifts").select(SHIFT_FIELDS).is("deleted_at", null).gte("day", addDays(week, -7)).lte("day", addDays(week, -1));
    const planned = new Set(shifts.map((s) => `${s.staff_id}|${s.day}`));
    const rows = ((data ?? []) as Shift[])
      .filter((s) => !planned.has(`${s.staff_id}|${addDays(s.day, 7)}`))
      .map(({ id: _id, ...s }) => ({ ...s, day: addDays(s.day, 7) }));
    if (rows.length) await supabase.from("shifts").insert(rows);
    setNotice(`${rows.length} ${t(lang, "copiedShifts")}`);
    refresh();
  }

  const label = (s: Shift) =>
    s.kind === "work" ? `${short(s.starts)}–${short(s.ends)}` : t(lang, `shift_${s.kind}`);

  return (
    <>
      <div className="toolbar">
        <div className="nav">
          <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label={t(lang, "previous")}><Icon name="left" /></button>
          <span className="range">
            {format(week, loc, { day: "numeric", month: "short" })} – {format(addDays(week, 6), loc, { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))} aria-label={t(lang, "next")}><Icon name="right" /></button>
          {week !== startOfWeek(today()) && <button onClick={() => setWeek(startOfWeek(today()))}>{t(lang, "thisWeek")}</button>}
        </div>
        <div className="nav">
          {notice && <span className="muted">{notice}</span>}
          <button onClick={copyLastWeek}>{t(lang, "copyLastWeek")}</button>
        </div>
      </div>

      {people.length === 0 ? (
        <p className="muted">{t(lang, "noStaff")}</p>
      ) : (
        <div className="grid-wrap">
          <table className="schedule">
            <thead>
              <tr>
                <th className="who" />
                {days.map((d) => (
                  <th key={d} className={d === today() ? "is-today" : ""}>
                    <span>{format(d, loc, { weekday: "short" })}</span>
                    <strong>{format(d, loc, { day: "numeric" })}</strong>
                  </th>
                ))}
                <th className="sum-col">{t(lang, "planned")}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const mine = shifts.filter((s) => s.staff_id === p.id);
                const minutes = mine.reduce((n, s) => n + shiftMinutes(s), 0);
                const over = p.weekly_hours != null && minutes > p.weekly_hours * 60;
                return (
                  <tr key={p.id}>
                    <th className="who">
                      <div className="who-in">
                        <Avatar name={p.full_name} />
                        <span>
                          <strong>{p.full_name}</strong>
                          <small>{t(lang, `dept_${p.department}`)}</small>
                        </span>
                      </div>
                    </th>
                    {days.map((d) => (
                      <td key={d} className={d === today() ? "is-today" : ""}>
                        {mine
                          .filter((s) => s.day === d)
                          .map((s) => (
                            <button
                              key={s.id}
                              className={`chip kind-${s.kind}`}
                              style={{ ["--villa" as string]: villas.properties.find((v) => v.id === s.property_id)?.color }}
                              onClick={() => setDraft(s)}
                              title={s.note || undefined}
                            >
                              {label(s)}
                              {s.property_id && <small>{villas.properties.find((v) => v.id === s.property_id)?.name.replace(/^Villa /, "")}</small>}
                            </button>
                          ))}
                        <button
                          className="chip-add"
                          aria-label={`${t(lang, "newShift")} · ${p.full_name} · ${d}`}
                          onClick={() => setDraft({ staff_id: p.id, day: d, kind: "work", starts: "09:00", ends: "15:00", property_id: null, note: "" })}
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      </td>
                    ))}
                    <td className={`sum-col${over ? " warn" : ""}`}>
                      {hm(minutes)}
                      {p.weekly_hours != null && <small> / {p.weekly_hours}h</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <ShiftDialog
          lang={lang}
          draft={draft}
          villas={villas}
          person={staff.find((s) => s.id === draft.staff_id)}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function ShiftDialog({ lang, draft, villas, person, onClose, onSaved }: { lang: Lang; draft: Draft; villas: Villas; person?: StaffMember; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({ ...draft, starts: short(draft.starts) || "09:00", ends: short(draft.ends) || "15:00" });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loc = locale[lang];
  useEffect(() => ref.current?.showModal(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const work = f.kind === "work";
    if (work && f.starts === f.ends) return setError(t(lang, "badTimes"));
    const row = {
      staff_id: f.staff_id,
      day: f.day,
      kind: f.kind,
      starts: work ? f.starts : null,
      ends: work ? f.ends : null,
      property_id: f.property_id || null,
      note: f.note,
    };
    const { error } = draft.id ? await supabase.from("shifts").update(row).eq("id", draft.id) : await supabase.from("shifts").insert(row);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    const { error } = await supabase.from("shifts").update({ deleted_at: new Date().toISOString() }).eq("id", draft.id!);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{draft.id ? t(lang, "shift") : t(lang, "newShift")}</h2>
        <p className="muted">
          {person?.full_name} · {format(f.day, loc, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <div className="segmented" role="radiogroup">
          {shiftKinds.map((k) => (
            <button type="button" key={k} role="radio" aria-checked={f.kind === k} className={f.kind === k ? "on" : ""} onClick={() => setF({ ...f, kind: k as ShiftKind })}>
              {t(lang, `shift_${k}`)}
            </button>
          ))}
        </div>
        <label>{t(lang, "date")}<input type="date" value={f.day} onChange={(e) => e.target.value && setF({ ...f, day: e.target.value })} /></label>
        {f.kind === "work" && (
          <>
            <div className="two">
              <label>{t(lang, "from")}<input type="time" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} required /></label>
              <label>{t(lang, "to")}<input type="time" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} required /></label>
            </div>
            <label>
              {t(lang, "villa")}
              <select value={f.property_id ?? ""} onChange={(e) => setF({ ...f, property_id: e.target.value || null })}>
                <option value="">{t(lang, "anyVilla")}</option>
                {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          </>
        )}
        <label>{t(lang, "notes")}<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {draft.id && (
            <button type="button" className={`danger${confirmDelete ? " confirm" : ""}`} onClick={remove}>
              {confirmDelete ? t(lang, "sureDelete") : t(lang, "delete")}
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
