import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays, format, today, type Day } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { load, save } from "../lib/cache";
import { RESERVATION_FIELDS, type Villas } from "../lib/villas";
import type { Profile, Reservation, ReservationStatus } from "../lib/types";
import { ReservationDialog, type Draft } from "./ReservationDialog";
import { toDraft } from "./Calendar";
import { TaskCard, useTasks } from "./Tasks";

interface Props {
  lang: Lang;
  profile: Profile;
  villas: Villas;
}

// The parents' home screen: who arrives, who leaves, who's in, and what needs cleaning.
export function Today({ lang, profile, villas }: Props) {
  const isManager = profile.role === "owner" || profile.role === "manager";
  const [day, setDay] = useState<Day>(today);
  const [reservations, setReservations] = useState<Reservation[]>(() => load("today") ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("reservations")
      .select(RESERVATION_FIELDS)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .lte("check_in", day)
      .gte("check_out", day)
      .order("check_in");
    if (error) return;
    setReservations(data as unknown as Reservation[]);
    if (day === today()) save("today", data);
  }, [day]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("today")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const tasks = useTasks({ from: addDays(day, -30), to: day });

  const bookings = reservations.filter((r) => r.kind === "booking");
  const arrivals = bookings.filter((r) => r.check_in === day);
  const departures = bookings.filter((r) => r.check_out === day);
  const inHouse = bookings.filter((r) => r.check_in < day && r.check_out > day);
  const blocks = reservations.filter((r) => r.kind === "block" && r.check_out > day);

  async function setStatus(r: Reservation, status: ReservationStatus) {
    await supabase.from("reservations").update({ status }).eq("id", r.id);
    refresh();
  }

  const guestName = (r: Reservation) => [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(" ") || r.title || t(lang, "untitled");

  function row(r: Reservation, action?: { label: string; status: ReservationStatus }) {
    return (
      <li key={r.id} className="item">
        <button className="item-main" onClick={() => setDraft(toDraft(r))}>
          <span className="dot" style={{ background: villas.propertyOf(r.unit_id)?.color }} />
          <span>
            <strong>{r.kind === "block" ? r.title || t(lang, "block") : guestName(r)}</strong>
            <small>
              {villas.unitName(r.unit_id)}
              {r.kind === "booking" && ` · ${r.adults + r.children} ${t(lang, "guests")} · ${t(lang, `source_${r.source}`)}`}
              {r.check_out > addDays(day, 1) && ` · ${t(lang, "untilDate")} ${format(r.check_out, loc, { day: "numeric", month: "short" })}`}
            </small>
          </span>
        </button>
        {r.guest?.phone && (
          <a className="tel" href={`tel:${r.guest.phone}`}>
            {r.guest.phone}
          </a>
        )}
        {isManager && action && r.status !== action.status && (
          <button onClick={() => setStatus(r, action.status)}>{action.label}</button>
        )}
        {r.status === action?.status && <span className="pill ok">{t(lang, `status_${r.status}`)}</span>}
      </li>
    );
  }

  const section = (title: string, list: Reservation[], action?: { label: string; status: ReservationStatus }) => (
    <section className="panel">
      <h2>
        {title} <span className="count">{list.length}</span>
      </h2>
      {list.length ? <ul className="list">{list.map((r) => row(r, action))}</ul> : <p className="muted">{t(lang, "nothing")}</p>}
    </section>
  );

  const dueTasks = tasks.list.filter((x) => x.due_date === day || x.status === "todo" || x.status === "in_progress");

  return (
    <main className="page">
      <div className="toolbar">
        <div className="nav">
          <button onClick={() => setDay(addDays(day, -1))} aria-label={t(lang, "previous")}>‹</button>
          <button onClick={() => setDay(today())}>{t(lang, "today")}</button>
          <button onClick={() => setDay(addDays(day, 1))} aria-label={t(lang, "next")}>›</button>
          <span className="range">{format(day, loc, { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
      </div>

      <div className="columns">
        {section(t(lang, "arrivals"), arrivals, { label: t(lang, "markCheckedIn"), status: "checked_in" })}
        {section(t(lang, "departures"), departures, { label: t(lang, "markCheckedOut"), status: "checked_out" })}
        <section className="panel">
          <h2>
            {t(lang, "cleaningToday")} <span className="count">{dueTasks.length}</span>
          </h2>
          {dueTasks.length ? (
            <div className="cards">
              {dueTasks.map((x) => (
                <TaskCard key={x.id} task={x} lang={lang} profile={profile} villas={villas} ctx={tasks} today={day} compact />
              ))}
            </div>
          ) : (
            <p className="muted">{t(lang, "nothing")}</p>
          )}
        </section>
        {section(t(lang, "inHouse"), inHouse)}
        {blocks.length > 0 && section(t(lang, "blocksToday"), blocks)}
      </div>

      {draft && (
        <ReservationDialog
          lang={lang}
          draft={draft}
          units={villas.units}
          properties={villas.properties}
          canEdit={isManager}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}
