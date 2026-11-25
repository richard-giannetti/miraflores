import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays, daysBetween, format, today, type Day } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { load, save } from "../lib/cache";
import { RESERVATION_FIELDS, type Villas } from "../lib/villas";
import type { ChecklistItem, Profile, Reservation, Task, TaskStatus } from "../lib/types";

const TASK_FIELDS = "id, unit_id, reservation_id, kind, title, due_date, status, assigned_to, checked, notes, completed_at";

// Tasks due in a date range, with what's needed to show them: checklists, and the stays around each task.
export function useTasks({ from, to }: { from: Day; to: Day }) {
  const key = `tasks:${from}:${to}`;
  const [list, setList] = useState<Task[]>(() => load(key) ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => load("checklist") ?? []);
  const [stays, setStays] = useState<Reservation[]>(() => load(`stays:${key}`) ?? []);

  // Only the latest refresh may update the screen; an older, slower answer is dropped.
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const [tk, ck, rs] = await Promise.all([
      supabase.from("tasks").select(TASK_FIELDS).is("deleted_at", null).gte("due_date", from).lte("due_date", to).neq("status", "skipped").order("due_date"),
      supabase.from("checklist_items").select("id, property_id, label, sort").is("deleted_at", null).order("sort"),
      supabase
        .from("reservations")
        .select(RESERVATION_FIELDS)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("kind", "booking")
        .lte("check_in", addDays(to, 90))
        .gte("check_out", from),
    ]);
    if (mine !== seq.current) return;
    if (tk.data) {
      setList(tk.data as Task[]);
      save(key, tk.data);
    }
    if (ck.data) {
      setChecklist(ck.data as ChecklistItem[]);
      save("checklist", ck.data);
    }
    if (rs.data) {
      setStays(rs.data as unknown as Reservation[]);
      save(`stays:${key}`, rs.data);
    }
  }, [from, to, key]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`tasks:${key}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, key]);

  async function update(task: Task, patch: Partial<Task>) {
    setList((l) => l.map((x) => (x.id === task.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) refresh();
  }

  async function setCheck(task: Task, item: string, on: boolean) {
    setList((l) => l.map((x) => (x.id === task.id ? { ...x, checked: on ? [...new Set([...x.checked, item])] : x.checked.filter((c) => c !== item) } : x)));
    const { error } = await supabase.rpc("set_task_check", { p_task: task.id, p_item: item, p_on: on });
    if (error) refresh();
  }

  const leaving = (task: Task) => stays.find((r) => r.id === task.reservation_id);
  // The next group to arrive in this villa on or after the cleaning day.
  const nextArrival = (task: Task) =>
    stays
      .filter((r) => r.unit_id === task.unit_id && r.check_in >= task.due_date && r.id !== task.reservation_id)
      .sort((a, b) => a.check_in.localeCompare(b.check_in))[0];

  return { list, checklist, update, setCheck, refresh, leaving, nextArrival };
}

export type TasksCtx = ReturnType<typeof useTasks>;

interface CardProps {
  task: Task;
  lang: Lang;
  profile: Profile;
  villas: Villas;
  ctx: TasksCtx;
  today: Day;
  compact?: boolean;
}

export function TaskCard({ task, lang, profile, villas, ctx, today: day, compact }: CardProps) {
  const isManager = profile.role === "owner" || profile.role === "manager";
  const canEdit = isManager || task.assigned_to === profile.id;
  const loc = locale[lang];
  const property = villas.propertyOf(task.unit_id);
  const items = ctx.checklist.filter((c) => c.property_id === property?.id);
  const leaving = ctx.leaving(task);
  const next = ctx.nextArrival(task);
  const overdue = task.due_date < day && task.status !== "done";
  const [notes, setNotes] = useState(task.notes);
  useEffect(() => setNotes(task.notes), [task.notes]);

  const name = (r?: Reservation) => (r ? [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(" ") || r.title || t(lang, "untitled") : "");
  const toggle = (id: string) => ctx.setCheck(task, id, !task.checked.includes(id));
  const setStatus = (status: TaskStatus) => ctx.update(task, { status });
  const doneCount = items.filter((i) => task.checked.includes(i.id)).length;

  return (
    <article className={`task status-${task.status}${overdue ? " overdue" : ""}`} style={{ borderLeftColor: property?.color }}>
      <header>
        <strong>
          {t(lang, `kind_${task.kind}`)} · {villas.unitName(task.unit_id)}
        </strong>
        <span className={`pill ${task.status}`}>{overdue ? t(lang, "overdue") : t(lang, `task_${task.status}`)}</span>
      </header>
      {(!compact || overdue) && <p className="muted">{format(task.due_date, loc, { weekday: "long", day: "numeric", month: "long" })}</p>}
      {leaving && (
        <p className="small">
          {t(lang, "leaving")}: {name(leaving)}
        </p>
      )}
      <p className={`small${next && next.check_in === task.due_date ? " warn" : ""}`}>
        {next ? (
          <>
            {t(lang, "nextArrival")}: {format(next.check_in, loc, { weekday: "short", day: "numeric", month: "short" })} · {next.adults + next.children}{" "}
            {t(lang, "guests")}
            {next.check_in === task.due_date && <strong> · {t(lang, "sameDay")}</strong>}
            {daysBetween(task.due_date, next.check_in) > 0 && ` (+${daysBetween(task.due_date, next.check_in)})`}
          </>
        ) : (
          t(lang, "noNextArrival")
        )}
      </p>

      <div className="task-row">
        <label className="inline">
          {t(lang, "assignedTo")}
          {isManager ? (
            <select value={task.assigned_to ?? ""} onChange={(e) => ctx.update(task, { assigned_to: e.target.value || null })}>
              <option value="">{t(lang, "nobody")}</option>
              {villas.team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.id.slice(0, 8)}
                </option>
              ))}
            </select>
          ) : (
            <span>{villas.team.find((p) => p.id === task.assigned_to)?.full_name ?? t(lang, "nobody")}</span>
          )}
        </label>
        {canEdit && (
          <span className="task-actions">
            {task.status === "todo" && <button onClick={() => setStatus("in_progress")}>{t(lang, "start")}</button>}
            {task.status !== "done" ? (
              <button className="primary" onClick={() => setStatus("done")}>
                {t(lang, "done")}
              </button>
            ) : (
              <button onClick={() => setStatus("todo")}>{t(lang, "reopen")}</button>
            )}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <details>
          <summary>
            {t(lang, "checklist")} ({doneCount}/{items.length})
          </summary>
          <ul className="checks">
            {items.map((i) => (
              <li key={i.id}>
                <label className="check">
                  <input type="checkbox" checked={task.checked.includes(i.id)} disabled={!canEdit} onChange={() => toggle(i.id)} />
                  {i.label}
                </label>
              </li>
            ))}
          </ul>
          <label>
            {t(lang, "notes")}
            <textarea rows={2} value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== task.notes && ctx.update(task, { notes })} />
          </label>
        </details>
      )}
    </article>
  );
}

interface Props {
  lang: Lang;
  profile: Profile;
  villas: Villas;
}

// All cleaning from two weeks back (to catch anything left undone) to three weeks ahead.
export function Tasks({ lang, profile, villas }: Props) {
  const day = today();
  const ctx = useTasks({ from: addDays(day, -14), to: addDays(day, 21) });
  const isManager = profile.role === "owner" || profile.role === "manager";
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [onlyMine, setOnlyMine] = useState(!isManager);
  const loc = locale[lang];

  const shown = useMemo(
    () =>
      ctx.list.filter(
        (x) =>
          (!onlyOpen || x.status === "todo" || x.status === "in_progress") &&
          (!onlyMine || x.assigned_to === profile.id) &&
          (x.due_date >= day || x.status !== "done"),
      ),
    [ctx.list, onlyOpen, onlyMine, profile.id, day],
  );
  const byDay = useMemo(() => {
    const m = new Map<Day, Task[]>();
    for (const x of shown) {
      const k = x.due_date < day ? "overdue" : x.due_date;
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    return [...m.entries()];
  }, [shown, day]);

  return (
    <main className="page">
      <div className="toolbar">
        <div className="nav">
          <button className={onlyOpen ? "on" : ""} onClick={() => setOnlyOpen(true)}>{t(lang, "open")}</button>
          <button className={!onlyOpen ? "on" : ""} onClick={() => setOnlyOpen(false)}>{t(lang, "all")}</button>
        </div>
        <div className="nav">
          <button className={!onlyMine ? "on" : ""} onClick={() => setOnlyMine(false)}>{t(lang, "all")}</button>
          <button className={onlyMine ? "on" : ""} onClick={() => setOnlyMine(true)}>{t(lang, "mine")}</button>
        </div>
      </div>
      {byDay.length === 0 && <p className="muted">{t(lang, "noTasks")}</p>}
      {byDay.map(([k, list]) => (
        <section key={k} className="day-group">
          <h2 className={k === "overdue" ? "warn" : ""}>
            {k === "overdue" ? t(lang, "overdue") : k === day ? t(lang, "today") : format(k, loc, { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <div className="cards">
            {list.map((x) => (
              <TaskCard key={x.id} task={x} lang={lang} profile={profile} villas={villas} ctx={ctx} today={day} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
