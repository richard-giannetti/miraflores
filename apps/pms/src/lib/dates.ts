// Calendar days as "YYYY-MM-DD" strings, computed in UTC so no time zone can shift a day.

export type Day = string;

const toDate = (d: Day) => new Date(`${d}T00:00:00Z`);
const fromDate = (d: Date): Day => d.toISOString().slice(0, 10);

export const addDays = (d: Day, n: number): Day => {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromDate(x);
};

export const daysBetween = (a: Day, b: Day) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);

export const today = (): Day => {
  // The villas' local date, whatever the device's time zone.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
};

export const range = (start: Day, count: number): Day[] => Array.from({ length: count }, (_, i) => addDays(start, i));

export const weekday = (d: Day) => toDate(d).getUTCDay(); // 0 = Sunday

export const startOfWeek = (d: Day) => addDays(d, -((weekday(d) + 6) % 7)); // Monday

export const format = (d: Day, locale: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(toDate(d));
