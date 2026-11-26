import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays, format, range, startOfWeek, today } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { ENTRY_FIELDS, SHIFT_FIELDS, entryMinutes, hm, localDay, localTime, short } from "../lib/staff";
import type { Shift, StaffMember, TimeEntry } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Avatar, Icon } from "./Icon";
import { loadMonth } from "./Hours";

// Re-render every 30 s so running times stay current.
function useTick() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// The big button: clock in when you start, clock out when you leave. The server's clock is the one recorded.
export function ClockCard({ lang, me, villas, onChange }: { lang: Lang; me: StaffMember; villas: Villas; onChange?: () => void }) {
  const [open, setOpen] = useState<TimeEntry | null | undefined>(undefined);
  const [todayShift, setTodayShift] = useState<Shift | null>(null);
  const [property, setProperty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useTick();

  const refresh = useCallback(async () => {
    const [e, s] = await Promise.all([
      supabase.from("time_entries").select(ENTRY_FIELDS).eq("staff_id", me.id).is("clock_out", null).is("voided_at", null).maybeSingle(),
      supabase.from("shifts").select(SHIFT_FIELDS).eq("staff_id", me.id).eq("day", today()).eq("kind", "work").is("deleted_at", null).order("starts").limit(1),
    ]);
    if (e.error) return setError(t(lang, "offline"));
    setOpen(e.data as TimeEntry | null);
    const shift = (s.data?.[0] as Shift | undefined) ?? null;
    setTodayShift(shift);
    setProperty((p) => p || shift?.property_id || "");
  }, [me.id, lang]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function clock() {
    setBusy(true);
    setError(null);
    const { error } = open ? await supabase.rpc("clock_out") : await supabase.rpc("clock_in", { p_property: property || null });
    setBusy(false);
    if (error) setError(error.message.includes("fetch") ? t(lang, "offline") : `${t(lang, "saveFailed")} ${error.message}`);
    await refresh();
    onChange?.();
  }

  return (
    <section className={`panel clock-card${open ? " running" : ""}`}>
      <div className="clock-state">
        <span className="clock-dot" aria-hidden="true" />
        <span>
          <strong>{open ? `${t(lang, "workingSince")} ${localTime(open.clock_in)}` : t(lang, "notWorking")}</strong>
          <small>
            {open ? hm(entryMinutes(open, now)) : todayShift ? `${t(lang, "shift")} ${short(todayShift.starts)}–${short(todayShift.ends)}` : me.full_name}
            {todayShift?.property_id && ` · ${villas.properties.find((v) => v.id === todayShift.property_id)?.name ?? ""}`}
          </small>
        </span>
      </div>
      {!open && villas.properties.length > 1 && (
        <select value={property} onChange={(e) => setProperty(e.target.value)} aria-label={t(lang, "villa")}>
          <option value="">{t(lang, "anyVilla")}</option>
          {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}
      <button className={`big ${open ? "danger confirm" : "primary"}`} disabled={busy || open === undefined} onClick={clock}>
        {open ? t(lang, "clockOut") : t(lang, "clockIn")}
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// A staff member's own page: the clock, their week, and their hours this month.
export function MyTime({ lang, me, villas }: { lang: Lang; me: StaffMember | null; villas: Villas }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const week = startOfWeek(today());
  const month = today().slice(0, 7);
  const loc = locale[lang];
  const now = useTick();

  const refresh = useCallback(async () => {
    if (!me) return;
    const [s, e] = await Promise.all([
      supabase.from("shifts").select(SHIFT_FIELDS).eq("staff_id", me.id).is("deleted_at", null).gte("day", week).lte("day", addDays(week, 6)).order("starts"),
      loadMonth(month, me.id),
    ]);
    if (s.data) setShifts(s.data as Shift[]);
    setEntries(e);
  }, [me, week, month]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!me)
    return (
      <main className="page">
        <h1 className="title">{t(lang, "tab_me")}</h1>
        <p className="muted">{t(lang, "notStaff")}</p>
      </main>
    );

  const valid = entries.filter((e) => !e.voided_at);
  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t(lang, `dept_${me.department}`)}</p>
          <h1 className="title">{me.full_name}</h1>
        </div>
      </div>
      <ClockCard lang={lang} me={me} villas={villas} onChange={refresh} />

      <section className="panel">
        <h2>
          <span className="h-icon"><Icon name="calendar" size={18} /></span>
          {t(lang, "myShifts")} · {t(lang, "thisWeek").toLowerCase()}
        </h2>
        <ul className="list">
          {range(week, 7).map((d) => {
            const mine = shifts.filter((s) => s.day === d);
            return (
              <li key={d} className={`item${d === today() ? " is-today-row" : ""}`}>
                <span className="entry-day">{format(d, loc, { weekday: "short", day: "numeric" })}</span>
                <span className="spacer" />
                {mine.length === 0 ? (
                  <small className="muted">—</small>
                ) : (
                  mine.map((s) => (
                    <span key={s.id} className={`chip kind-${s.kind}`} style={{ ["--villa" as string]: villas.properties.find((v) => v.id === s.property_id)?.color }}>
                      {s.kind === "work" ? `${short(s.starts)}–${short(s.ends)}` : t(lang, `shift_${s.kind}`)}
                      {s.property_id && <small>{villas.properties.find((v) => v.id === s.property_id)?.name.replace(/^Villa /, "")}</small>}
                    </span>
                  ))
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>
          <span className="h-icon"><Icon name="today" size={18} /></span>
          {t(lang, "myMonth")} <span className="count">{hm(valid.reduce((n, e) => n + entryMinutes(e, now), 0))}</span>
        </h2>
        {valid.length === 0 ? (
          <p className="muted">{t(lang, "noEntries")}</p>
        ) : (
          <ul className="list">
            {[...valid].reverse().map((e) => (
              <li key={e.id} className="item entry">
                <span className="entry-day">{format(localDay(e.clock_in), loc, { weekday: "short", day: "numeric" })}</span>
                <span className="entry-times">
                  <strong>{localTime(e.clock_in)} – {e.clock_out ? localTime(e.clock_out) : "…"}</strong>
                  {e.source === "manual" && <small>{t(lang, "manual")}</small>}
                </span>
                <span className="spacer" />
                <span className="entry-hours">{hm(entryMinutes(e, now))}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{t(lang, "hoursNote")}</p>
      </section>
    </main>
  );
}

// Managers' Today: who is clocked in right now, live.
export function OnDuty({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [list, setList] = useState<(TimeEntry & { staff: { full_name: string; department: string } | null })[]>([]);
  const now = useTick();

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("time_entries")
      .select(`${ENTRY_FIELDS}, staff:staff_members(full_name, department)`)
      .is("clock_out", null)
      .is("voided_at", null)
      .order("clock_in");
    if (data) setList(data as unknown as typeof list);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("on-duty")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  if (list.length === 0) return null;
  return (
    <section className="panel">
      <h2>
        <span className="h-icon"><Icon name="guests" size={18} /></span>
        {t(lang, "onDuty")} <span className="count">{list.length}</span>
      </h2>
      <ul className="list">
        {list.map((e) => (
          <li key={e.id} className="item">
            <div className="item-main">
              <Avatar name={e.staff?.full_name ?? "?"} color={villas.properties.find((v) => v.id === e.property_id)?.color} />
              <span>
                <strong>{e.staff?.full_name}</strong>
                <small>
                  {e.staff && t(lang, `dept_${e.staff.department}` as Parameters<typeof t>[1])}
                  {e.property_id && ` · ${villas.properties.find((v) => v.id === e.property_id)?.name}`}
                </small>
              </span>
            </div>
            <small className="muted right">
              {t(lang, "workingSince")} {localTime(e.clock_in)}
              <br />
              {hm(entryMinutes(e, now))}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
