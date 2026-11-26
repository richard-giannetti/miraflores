import type { Department, Shift, TimeEntry } from "./types";

// Screens a staff login sees, by department. Owners and managers always see everything.
// Departments whose own modules come later (kitchen, restaurant, pool, spa) start with Today and their time.
export const departmentTabs: Record<Department, string[]> = {
  management: ["today", "calendar", "cleaning"],
  reception: ["today", "calendar", "cleaning"],
  housekeeping: ["today", "cleaning"],
  maintenance: ["today", "cleaning"],
  kitchen: ["today"],
  restaurant: ["today"],
  pool: ["today"],
  spa: ["today"],
};

export const STAFF_FIELDS = "id, user_id, full_name, department, contract, phone, email, weekly_hours, notes, active";
export const SHIFT_FIELDS = "id, staff_id, property_id, day, kind, starts, ends, note";
export const ENTRY_FIELDS = "id, staff_id, property_id, clock_in, clock_out, source, voided_at";

const TZ = "Europe/Madrid";

// The villas' local day and time of an instant, whatever the device's time zone.
export const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const localTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// The instant a local day starts, for querying entries by local dates.
export function dayStartIso(day: string) {
  const guess = new Date(`${day}T00:00:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime())).toISOString();
}

export const entryMinutes = (e: TimeEntry, now = Date.now()) => Math.max(0, Math.round(((e.clock_out ? Date.parse(e.clock_out) : now) - Date.parse(e.clock_in)) / 60_000));

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const shiftMinutes = (s: Shift) => {
  if (s.kind !== "work" || !s.starts || !s.ends) return 0;
  const d = toMin(s.ends) - toMin(s.starts);
  return d > 0 ? d : d + 24 * 60;
};

export const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
export const short = (t: string | null) => (t ?? "").slice(0, 5);

// An entry still open after this long was probably a forgotten clock-out.
export const LONG_OPEN_MIN = 14 * 60;
