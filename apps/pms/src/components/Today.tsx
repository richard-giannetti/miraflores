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
import { Avatar, Icon, type IconName } from "./Icon";

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

  const dueTasks = tasks.list.filter((x) => x.due_date === day || x.status === "todo" || x.status === "in_progress");
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
          {r.kind === "block" ? (
            <span className="avatar muted-avatar">
              <Icon name="lock" size={16} />
            </span>
          ) : (
            <Avatar name={guestName(r)} color={villas.propertyOf(r.unit_id)?.color} />
          )}
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
          <a className="icon-btn" href={`tel:${r.guest.phone}`} aria-label={r.guest.phone} title={r.guest.phone}>
            <Icon name="phone" size={18} />
          </a>
        )}
        {isManager && action && r.status !== action.status && (
          <button className="small-btn" onClick={() => setStatus(r, action.status)}>
            {action.label}
          </button>
        )}
        {r.status === action?.status && (
          <span className="pill ok">
            <Icon name="check" size={14} /> {t(lang, `status_${r.status}`)}
          </span>
        )}
      </li>
    );
  }

  const section = (icon: IconName, title: string, list: Reservation[], action?: { label: string; status: ReservationStatus }) => (
    <section className="panel">
      <h2>
        <span className="h-icon"><Icon name={icon} size={18} /></span>
        {title} <span className="count">{list.length}</span>
      </h2>
      {list.length ? <ul className="list">{list.map((r) => row(r, action))}</ul> : <p className="muted">{t(lang, "nothing")}</p>}
    </section>
  );

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{day === today() ? t(lang, "today") : format(day, loc, { weekday: "long" })}</p>
          <h1 className="title">{format(day, loc, { weekday: day === today() ? "long" : undefined, day: "numeric", month: "long" })}</h1>
        </div>
        <div className="nav">
          <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label={t(lang, "previous")}>
            <Icon name="left" />
          </button>
          {day !== today() && <button onClick={() => setDay(today())}>{t(lang, "today")}</button>}
          <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label={t(lang, "next")}>
            <Icon name="right" />
          </button>
        </div>
      </div>

      <div className="stats">
        {[
          { icon: "arrive" as const, label: t(lang, "arrivals"), n: arrivals.length },
          { icon: "leave" as const, label: t(lang, "departures"), n: departures.length },
          { icon: "bed" as const, label: t(lang, "inHouse"), n: inHouse.length },
          { icon: "cleaning" as const, label: t(lang, "cleaningToday"), n: dueTasks.filter((x) => x.status !== "done").length },
        ].map((x) => (
          <div key={x.label} className="stat">
            <span className="h-icon"><Icon name={x.icon} size={18} /></span>
            <strong>{x.n}</strong>
            <span>{x.label}</span>
          </div>
        ))}
      </div>

      <div className="columns">
        {section("arrive", t(lang, "arrivals"), arrivals, { label: t(lang, "markCheckedIn"), status: "checked_in" })}
        {section("leave", t(lang, "departures"), departures, { label: t(lang, "markCheckedOut"), status: "checked_out" })}
        <section className="panel">
          <h2>
            <span className="h-icon"><Icon name="cleaning" size={18} /></span>
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
        {section("bed", t(lang, "inHouse"), inHouse)}
        {blocks.length > 0 && section("lock", t(lang, "blocksToday"), blocks)}
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
