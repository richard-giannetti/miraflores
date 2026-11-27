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
import { BookingRequests } from "./BookingRequests";
import { QuoteDialog, QuotesPanel } from "./Quotes";
import type { Issue } from "../lib/types";

interface Props {
  lang: Lang;
  profile: Profile;
  villas: Villas;
  me: StaffMember | null;
  // A day from the address (#today/2028-03-10); today otherwise.
  view?: string | null;
}

// The parents' home screen: who arrives, who leaves, who's in, and what needs cleaning.
export function Today({ lang, profile, villas, me, view }: Props) {
  const isManager = profile.role === "owner" || profile.role === "manager";
  const [day, setDay] = useState<Day>(() => (view && /^\d{4}-\d{2}-\d{2}$/.test(view) ? view : today()));
  const [quoting, setQuoting] = useState(false);
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
              {r.status === "option" && ` · ${t(lang, "status_option")}`}
            </small>
            {isManager && r.kind === "booking" && r.check_in >= day && (
              <small className={`checkin-state ${checkins[r.id] === "complete" ? "ok" : checkins[r.id] ? "todo" : "none"}`}>
                {t(lang, "checkinOnline")}: {t(lang, checkins[r.id] === "complete" ? "checkinDone" : checkins[r.id] ? "checkinPending" : "noCheckin")}
              </small>
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

  const section = (id: string, icon: IconName, title: string, list: Reservation[], action?: { label: string; status: ReservationStatus }) => (
    <section className="panel" id={id}>
      <h2>
        <span className="h-icon"><Icon name={icon} size={16} /></span>
        {title} <span className="count">{list.length}</span>
      </h2>
      <ul className="list">{list.map((r) => row(r, action))}</ul>
    </section>
  );

  const anchor = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const summary = [
    { id: "t-arrivals", icon: "arrive" as const, label: t(lang, "arrivals"), n: arrivals.length },
    { id: "t-departures", icon: "leave" as const, label: t(lang, "departures"), n: departures.length },
    { id: "t-inhouse", icon: "bed" as const, label: t(lang, "inHouse"), n: inHouse.length },
    { id: "t-cleaning", icon: "cleaning" as const, label: t(lang, "cleaningToday"), n: dueTasks.filter((x) => x.status !== "done").length },
  ];
  const quiet = arrivals.length + departures.length + inHouse.length + dueTasks.length + blocks.length === 0;
  const isToday = day === today();

  return (
    <main className="page today">
      <div className="page-head">
        <div>
          <p className="eyebrow">{isToday ? t(lang, "today") : format(day, loc, { weekday: "long" })}</p>
          <h1 className="title">
            {format(day, loc, { weekday: isToday ? "long" : undefined, day: "numeric", month: "long", year: day.slice(0, 4) === today().slice(0, 4) ? undefined : "numeric" })}
          </h1>
        </div>
        <div className="nav">
          {isManager && (
            <button onClick={() => setQuoting(true)}>
              <Icon name="plus" size={16} /> {t(lang, "newQuote")}
            </button>
          )}
          <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label={t(lang, "previous")}>
            <Icon name="left" />
          </button>
          {!isToday && <button onClick={() => setDay(today())}>{t(lang, "today")}</button>}
          <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label={t(lang, "next")}>
            <Icon name="right" />
          </button>
        </div>
      </div>

      {/* What someone has to act on: shown only when there's something. */}
      {isToday && (
        <div className="attention">
          {isManager && <SyncWarning lang={lang} villas={villas} />}
          {isManager && <BookingRequests lang={lang} villas={villas} />}
          {isManager && <QuotesPanel lang={lang} villas={villas} />}
          {isManager && <MessagesToSend lang={lang} villas={villas} />}
          {me && <ClockCard lang={lang} me={me} villas={villas} />}
        </div>
      )}

      {/* The day at a glance; each figure jumps to its list. */}
      <div className="summary" role="list">
        {summary.map((x) => (
          <button key={x.id} role="listitem" className={`summary-item${x.n ? "" : " zero"}`} onClick={anchor(x.id)} disabled={!x.n}>
            <Icon name={x.icon} size={18} />
            <strong>{x.n}</strong>
            <span>{x.label}</span>
          </button>
        ))}
      </div>

      {quiet ? (
        <p className="panel quiet">{t(lang, "quietDay")}</p>
      ) : (
        <div className="columns">
          {arrivals.length > 0 && section("t-arrivals", "arrive", t(lang, "arrivals"), arrivals, { label: t(lang, "markCheckedIn"), status: "checked_in" })}
          {departures.length > 0 && section("t-departures", "leave", t(lang, "departures"), departures, { label: t(lang, "markCheckedOut"), status: "checked_out" })}
          {dueTasks.length > 0 && (
            <section className="panel" id="t-cleaning">
              <h2>
                <span className="h-icon"><Icon name="cleaning" size={16} /></span>
                {t(lang, "cleaningToday")} <span className="count">{dueTasks.length}</span>
              </h2>
              <div className="cards">
                {dueTasks.map((x) => (
                  <TaskCard key={x.id} task={x} lang={lang} profile={profile} villas={villas} ctx={tasks} today={day} compact />
                ))}
              </div>
            </section>
          )}
          {inHouse.length > 0 && section("t-inhouse", "bed", t(lang, "inHouse"), inHouse)}
          {blocks.length > 0 && section("t-blocks", "lock", t(lang, "blocksToday"), blocks)}
        </div>
      )}

      <div className="columns secondary">
        {myIssues.length > 0 && (
          <section className="panel">
            <h2>
              <span className="h-icon"><Icon name="wrench" size={16} /></span>
              {t(lang, "openIssues")} <span className="count">{myIssues.length}</span>
            </h2>
            <ul className="list">
              {myIssues.slice(0, 5).map((i) => (
                <IssueRow key={i.id} issue={i} lang={lang} villas={villas} onOpen={() => setIssue(i)} />
              ))}
            </ul>
            {myIssues.length > 5 && <a className="hint" href="#maintenance">{t(lang, "tab_maintenance")} →</a>}
          </section>
        )}
        {isManager && isToday && <OnDuty lang={lang} villas={villas} />}
      </div>

      <section className="panel ahead">
        <h2>
          <span className="h-icon"><Icon name="calendar" size={16} /></span>
          {t(lang, "nextDays")}
        </h2>
        <ul className="ahead-list">
          {nextDays.map((d) => (
            <li key={d.day} className="ahead-day">
              <div className="ahead-head">
                <strong>{format(d.day, loc, { weekday: "long", day: "numeric", month: "short" })}</strong>
                <span className="muted small">
                  {[
                    d.arrivals.length > 0 && `${t(lang, "arrivals")} ${d.arrivals.length}`,
                    d.departures.length > 0 && `${t(lang, "departures")} ${d.departures.length}`,
                    d.cleanings > 0 && `${t(lang, "cleaningToday")} ${d.cleanings}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t(lang, "nothing")}
                </span>
              </div>
              {d.arrivals.length + d.departures.length > 0 && (
                <ul className="list">
                  {d.arrivals.map((r) => row(r))}
                  {d.departures.map((r) => row(r))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {quoting && <QuoteDialog lang={lang} villas={villas} prefill={{}} onClose={() => setQuoting(false)} onCreated={() => {}} />}
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
