import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { supabase, OVERLAP } from "../lib/supabase";
import { addDays, daysBetween, format, range, startOfWeek, today, weekday, type Day } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { load, save } from "../lib/cache";
import { RESERVATION_FIELDS, type Villas } from "../lib/villas";
import type { Reservation, Role } from "../lib/types";
import { ReservationDialog, type Draft } from "./ReservationDialog";

const DAY_W = 48; // px per day column

interface Props {
  lang: Lang;
  role: Role;
  villas: Villas;
}

type Drag =
  | { mode: "select"; unitId: string; from: number; to: number }
  | { mode: "move" | "resize"; res: Reservation; x0: number; dDays: number; unitId: string; moved: boolean };

export function Calendar({ lang, role, villas }: Props) {
  const { properties, units } = villas;
  const canEdit = role === "owner" || role === "manager";
  const [span, setSpan] = useState<14 | 31>(14);
  const [start, setStart] = useState<Day>(() => startOfWeek(today()));
  const days = useMemo(() => range(start, span), [start, span]);
  const end = addDays(start, span);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // Reservations overlapping the visible range, plus a margin so neighbouring pages are cached too.
  const from = addDays(start, -31);
  const to = addDays(end, 62);
  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("reservations")
      .select(RESERVATION_FIELDS)
      .is("deleted_at", null)
      .lt("check_in", to)
      .gt("check_out", from);
    if (error) {
      setOffline(true);
      const cached = load<Reservation[]>("reservations");
      if (cached) setReservations(cached);
      return;
    }
    setOffline(false);
    setReservations(data as unknown as Reservation[]);
    // Keep a wide window for offline reading.
    save("reservations", data);
  }, [from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates from other devices, and a refresh when the connection comes back.
  useEffect(() => {
    const channel = supabase
      .channel("reservations")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => refresh())
      .subscribe();
    const online = () => refresh();
    const offlineEvt = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineEvt);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineEvt);
    };
  }, [refresh]);

  const todayDay = today();
  const dayIndexAt = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(span - 1, Math.floor((clientX - rect.left) / DAY_W)));
  };

  // Drag across empty days to create a reservation.
  function onRowPointerDown(e: ReactPointerEvent<HTMLDivElement>, unitId: string) {
    if (!canEdit || e.button !== 0 || (e.target as HTMLElement).closest(".bar")) return;
    const i = dayIndexAt(e.clientX, e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode: "select", unitId, from: i, to: i });
  }

  function onBarPointerDown(e: ReactPointerEvent<HTMLDivElement>, res: Reservation) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!canEdit) return setDraft(toDraft(res));
    e.currentTarget.setPointerCapture(e.pointerId);
    const resize = (e.target as HTMLElement).classList.contains("handle");
    setDrag({ mode: resize ? "resize" : "move", res, x0: e.clientX, dDays: 0, unitId: res.unit_id, moved: false });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "select") {
      const row = e.currentTarget.querySelector<HTMLElement>(`[data-unit="${d.unitId}"]`) ?? e.currentTarget;
      setDrag({ ...d, to: dayIndexAt(e.clientX, row) });
      return;
    }
    const dDays = Math.round((e.clientX - d.x0) / DAY_W);
    // Moving onto another villa's row.
    let unitId = d.unitId;
    if (d.mode === "move") {
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.unit) as HTMLElement | undefined;
      if (over?.dataset.unit) unitId = over.dataset.unit;
    }
    const moved = d.moved || Math.abs(e.clientX - d.x0) > 4 || unitId !== d.res.unit_id;
    if (dDays !== d.dDays || unitId !== d.unitId || moved !== d.moved) setDrag({ ...d, dDays, unitId, moved });
  }

  async function onPointerUp() {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.mode === "select") {
      const a = Math.min(d.from, d.to);
      const b = Math.max(d.from, d.to);
      setDraft({ unit_id: d.unitId, check_in: days[a], check_out: addDays(days[b], 1) });
      return;
    }
    if (!d.moved || (d.dDays === 0 && d.unitId === d.res.unit_id)) {
      if (!d.moved) setDraft(toDraft(d.res));
      return;
    }
    const patch =
      d.mode === "move"
        ? { unit_id: d.unitId, check_in: addDays(d.res.check_in, d.dDays), check_out: addDays(d.res.check_out, d.dDays) }
        : { check_out: maxDay(addDays(d.res.check_out, d.dDays), addDays(d.res.check_in, 1)) };
    // Show the change straight away; undo it if the database refuses.
    setReservations((rs) => rs.map((r) => (r.id === d.res.id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("reservations").update(patch).eq("id", d.res.id);
    if (error) {
      setMessage(error.code === OVERLAP ? t(lang, "overlap") : `${t(lang, "saveFailed")} ${error.message}`);
      refresh();
    }
  }

  // Where a reservation's bar sits, with any drag in progress applied.
  function barFor(r: Reservation) {
    let checkIn = r.check_in;
    let checkOut = r.check_out;
    let unitId = r.unit_id;
    if (drag && drag.mode !== "select" && drag.res.id === r.id) {
      if (drag.mode === "move") {
        checkIn = addDays(checkIn, drag.dDays);
        checkOut = addDays(checkOut, drag.dDays);
        unitId = drag.unitId;
      } else {
        checkOut = maxDay(addDays(checkOut, drag.dDays), addDays(checkIn, 1));
      }
    }
    // Hotel-style: a stay starts mid-day on arrival and ends mid-day on departure.
    const left = (daysBetween(start, checkIn) + 0.5) * DAY_W;
    const width = daysBetween(checkIn, checkOut) * DAY_W;
    return { unitId, left, width, nights: daysBetween(checkIn, checkOut) };
  }

  const loc = locale[lang];
  const label = (r: Reservation) =>
    r.kind === "block"
      ? r.title || t(lang, "block")
      : [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(" ") || r.title || t(lang, "untitled");

  return (
    <main className="calendar" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
      <div className="toolbar">
        <div className="nav">
          <button onClick={() => setStart(addDays(start, -7))} aria-label={t(lang, "previous")}>‹</button>
          <button onClick={() => setStart(startOfWeek(today()))}>{t(lang, "today")}</button>
          <button onClick={() => setStart(addDays(start, 7))} aria-label={t(lang, "next")}>›</button>
          <span className="range">
            {format(start, loc, { day: "numeric", month: "short" })} – {format(addDays(end, -1), loc, { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <div className="nav">
          <button className={span === 14 ? "on" : ""} onClick={() => setSpan(14)}>{t(lang, "twoWeeks")}</button>
          <button className={span === 31 ? "on" : ""} onClick={() => setSpan(31)}>{t(lang, "month")}</button>
          {canEdit ? (
            <button className="primary" onClick={() => units[0] && setDraft({ unit_id: units[0].id, check_in: todayDay, check_out: addDays(todayDay, 1) })}>
              + {t(lang, "newReservation")}
            </button>
          ) : (
            <span className="badge">{t(lang, "readOnly")}</span>
          )}
        </div>
      </div>

      {offline && <p className="banner">{t(lang, "offline")}</p>}
      {message && (
        <p className="banner error" onClick={() => setMessage(null)}>
          {message}
        </p>
      )}

      <div className="grid-wrap">
        <div className="grid" style={{ width: 180 + span * DAY_W }}>
          <div className="head">
            <div className="corner" />
            {days.map((d) => (
              <div key={d} className={`day${isWeekend(d) ? " weekend" : ""}${d === todayDay ? " is-today" : ""}`} style={{ width: DAY_W }}>
                <span>{format(d, loc, { weekday: "short" })}</span>
                <strong>{format(d, loc, { day: "numeric" })}</strong>
                {(d === start || d.endsWith("-01")) && <em>{format(d, loc, { month: "short" })}</em>}
              </div>
            ))}
          </div>

          {properties.map((p) =>
            units
              .filter((u) => u.property_id === p.id)
              .map((u) => {
                const sel = drag?.mode === "select" && drag.unitId === u.id ? drag : null;
                return (
                  <div key={u.id} className="row">
                    <div className="unit" style={{ borderLeftColor: p.color }}>
                      <strong>{u.name}</strong>
                      <span>
                        {p.locality} · {u.capacity} {t(lang, "guests")}
                      </span>
                    </div>
                    <div className="cells" data-unit={u.id} onPointerDown={(e) => onRowPointerDown(e, u.id)} style={{ width: span * DAY_W }}>
                      {days.map((d) => (
                        <div key={d} className={`cell${isWeekend(d) ? " weekend" : ""}${d === todayDay ? " is-today" : ""}`} style={{ width: DAY_W }} />
                      ))}
                      {sel && (
                        <div
                          className="selection"
                          style={{ left: Math.min(sel.from, sel.to) * DAY_W, width: (Math.abs(sel.to - sel.from) + 1) * DAY_W }}
                        />
                      )}
                      {reservations.map((r) => {
                        const b = barFor(r);
                        if (b.unitId !== u.id || b.left + b.width < 0 || b.left > span * DAY_W) return null;
                        return (
                          <div
                            key={r.id}
                            className={`bar ${r.kind} status-${r.status} source-${r.source}${drag && drag.mode !== "select" && drag.res.id === r.id ? " dragging" : ""}`}
                            style={{ left: b.left, width: b.width, ["--villa" as string]: p.color }}
                            onPointerDown={(e) => onBarPointerDown(e, r)}
                            title={`${label(r)} · ${b.nights} ${t(lang, "nights")}`}
                          >
                            <span className="label">{label(r)}</span>
                            {r.kind === "booking" && <span className="meta">{r.adults + r.children} · {t(lang, `source_${r.source}`)}</span>}
                            {canEdit && <span className="handle" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }),
          )}
        </div>
      </div>

      {canEdit && <p className="hint">{t(lang, "dragHint")}</p>}

      {draft && (
        <ReservationDialog
          lang={lang}
          draft={draft}
          units={units}
          properties={properties}
          canEdit={canEdit}
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

const isWeekend = (d: Day) => [0, 6].includes(weekday(d));
const maxDay = (a: Day, b: Day) => (a > b ? a : b);

export function toDraft(r: Reservation): Draft {
  return {
    id: r.id,
    unit_id: r.unit_id,
    guest_id: r.guest_id,
    kind: r.kind,
    status: r.status,
    source: r.source,
    check_in: r.check_in,
    check_out: r.check_out,
    adults: r.adults,
    children: r.children,
    total_amount: r.total_amount,
    title: r.title,
    notes: r.notes,
    first_name: r.guest?.first_name ?? "",
    last_name: r.guest?.last_name ?? "",
    email: r.guest?.email ?? "",
    phone: r.guest?.phone ?? "",
  };
}
