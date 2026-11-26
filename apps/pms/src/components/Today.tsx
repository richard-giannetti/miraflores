import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays, format, range, today, type Day } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { load, save } from "../lib/cache";
import { RESERVATION_FIELDS, type Villas } from "../lib/villas";
import type { Profile, Reservation, ReservationStatus, StaffMember } from "../lib/types";
import { ReservationDialog, type Draft } from "./ReservationDialog";
import { toDraft } from "./Calendar";
import { TaskCard, useTasks } from "./Tasks";
import { Avatar, Icon, type IconName } from "./Icon";
import { ClockCard, OnDuty } from "./MyTime";
import { IssueDialog, IssueRow, useIssues } from "./Maintenance";
import { MessagesToSend } from "./Messages";
import { SyncWarning } from "./AirbnbSync";
import type { Issue } from "../lib/types";

interface Props {
  lang: Lang;
  profile: Profile;
  villas: Villas;
  me: StaffMember | null;
}

// The parents' home screen: who arrives, who leaves, who's in, and what needs cleaning.
export function Today({ lang, profile, villas, me }: Props) {
  const isManager = profile.role === "owner" || profile.role === "manager";
  const [day, setDay] = useState<Day>(today);
  const [reservations, setReservations] = useState<Reservation[]>(() => load("today") ?? []);
  // Bookings arriving or leaving in the next 3 days, so the parents can prepare ahead.
  const [upcoming, setUpcoming] = useState<Reservation[]>(() => load("upcoming") ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const issues = useIssues(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  // Managers see every open issue; staff see the urgent ones and their own.
  const myIssues = issues.list.filter((i) => isManager || i.priority === "urgent" || i.assigned_to === profile.id);
  // Online check-in status per reservation (owners and managers only).
  const [checkins, setCheckins] = useState<Record<string, "pending" | "complete">>({});
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
    const [from, to] = [addDays(day, 1), addDays(day, 3)];
    const next = await supabase
      .from("reservations")
      .select(RESERVATION_FIELDS)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("kind", "booking")
      .or(`and(check_in.gte.${from},check_in.lte.${to}),and(check_out.gte.${from},check_out.lte.${to})`)
      .order("check_in");
    const ahead = (next.data ?? []) as unknown as Reservation[];
    setUpcoming(ahead);
    const ids = [...data, ...ahead].map((r) => r.id);
    if (isManager && ids.length) {
      const ck = await supabase.from("checkins").select("reservation_id, status").in("reservation_id", ids);
      setCheckins(Object.fromEntries((ck.data ?? []).map((c) => [c.reservation_id, c.status])));
    }
    if (day === today()) {
      save("today", data);
      save("upcoming", ahead);
    }
  }, [day, isManager]);

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
  const aheadTasks = useTasks({ from: addDays(day, 1), to: addDays(day, 3) });
  const nextDays = range(addDays(day, 1), 3).map((d) => ({
    day: d,
    arrivals: upcoming.filter((r) => r.check_in === d),
    departures: upcoming.filter((r) => r.check_out === d),
    cleanings: aheadTasks.list.filter((x) => x.due_date === d && x.status !== "done").length,
  }));

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
            {isManager && r.kind === "booking" && r.check_in >= day && (
              <span className={`pill ${checkins[r.id] === "complete" ? "ok" : checkins[r.id] ? "todo" : ""}`} style={{ justifySelf: "start" }}>
                {t(lang, "checkinOnline")}: {t(lang, checkins[r.id] === "complete" ? "checkinDone" : checkins[r.id] ? "checkinPending" : "noCheckin")}
              </span>
            )}
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

      {isManager && day === today() && <SyncWarning lang={lang} villas={villas} />}
      {me && day === today() && <ClockCard lang={lang} me={me} villas={villas} />}

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
        {myIssues.length > 0 && (
          <section className="panel">
            <h2>
              <span className="h-icon"><Icon name="wrench" size={18} /></span>
              {t(lang, "openIssues")} <span className="count">{myIssues.length}</span>
            </h2>
            <ul className="list">
              {myIssues.slice(0, 6).map((i) => (
                <IssueRow key={i.id} issue={i} lang={lang} villas={villas} onOpen={() => setIssue(i)} />
              ))}
            </ul>
            {myIssues.length > 6 && <a className="hint" href="#maintenance">{t(lang, "tab_maintenance")} →</a>}
          </section>
        )}
        {isManager && day === today() && <OnDuty lang={lang} villas={villas} />}
        {isManager && day === today() && <MessagesToSend lang={lang} villas={villas} />}
        {blocks.length > 0 && section("lock", t(lang, "blocksToday"), blocks)}
      </div>

      <section className="panel ahead">
        <h2>
          <span className="h-icon"><Icon name="calendar" size={18} /></span>
          {t(lang, "nextDays")}
        </h2>
        <div className="ahead-days">
          {nextDays.map((d) => (
            <div key={d.day} className="ahead-day">
              <h3>{format(d.day, loc, { weekday: "long", day: "numeric", month: "short" })}</h3>
              <p className="ahead-counts">
                <span><Icon name="arrive" size={14} /> {d.arrivals.length} {t(lang, "arrivals").toLowerCase()}</span>
                <span><Icon name="leave" size={14} /> {d.departures.length} {t(lang, "departures").toLowerCase()}</span>
                <span><Icon name="cleaning" size={14} /> {d.cleanings} {t(lang, "cleaningToday").toLowerCase()}</span>
              </p>
              {d.arrivals.length > 0 && <p className="ahead-label">{t(lang, "arrivals")}</p>}
              {d.arrivals.length > 0 && <ul className="list">{d.arrivals.map((r) => row(r))}</ul>}
              {d.departures.length > 0 && <p className="ahead-label">{t(lang, "departures")}</p>}
              {d.departures.length > 0 && <ul className="list">{d.departures.map((r) => row(r))}</ul>}
              {d.arrivals.length + d.departures.length === 0 && <p className="muted">{t(lang, "nothing")}</p>}
            </div>
          ))}
        </div>
      </section>

      {issue && (
        <IssueDialog
          lang={lang}
          profile={profile}
          villas={villas}
          issue={issue}
          onClose={() => setIssue(null)}
          onSaved={() => {
            setIssue(null);
            issues.refresh();
          }}
        />
      )}
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
