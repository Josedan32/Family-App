const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const WEEKDAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function parse(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** "2026-08-20" → "20 ago 2026". Parsed by hand: a bare ISO date handed to
 *  `new Date` is UTC midnight, which is the previous day in Bogotá. */
export function formatDayMonthYear(isoDate: string): string {
  const { year, month, day } = parse(isoDate);
  return `${day} ${MONTHS_ES[month - 1]} ${year}`;
}

/**
 * Today as "YYYY-MM-DD" in local time. Not `toISOString()`: that is UTC, and
 * from 7 p.m. in Bogotá it is already tomorrow there.
 */
export function todayLocal(now: Date = new Date()): string {
  return toIso(now);
}

/** Today as "YYYY-MM-DD" where the household lives, wherever the server runs. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parse(isoDate);
  return toIso(new Date(year, month - 1, day + days));
}

/** "2026-09-19" → "Sábado 19 sep". */
export function weekdayDayMonth(isoDate: string): string {
  const { year, month, day } = parse(isoDate);
  const weekday = WEEKDAYS_ES[new Date(year, month - 1, day).getDay()];
  return `${weekday} ${day} ${MONTHS_ES[month - 1]}`;
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = parse(fromIso);
  const to = parse(toIso);
  const ms =
    Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day);
  return Math.round(ms / 86_400_000);
}

/** "2026-10-02" → "2 oct". */
export function formatDayMonth(isoDate: string): string {
  const { month, day } = parse(isoDate);
  return `${day} ${MONTHS_ES[month - 1]}`;
}

/** "16 ago – 15 sep 2026"; the start repeats its year only when the years differ. */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = parse(startIso);
  const end = parse(endIso);
  const left =
    start.year === end.year ? formatDayMonth(startIso) : formatDayMonthYear(startIso);
  return `${left} – ${formatDayMonthYear(endIso)}`;
}

function lastDayOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Adds calendar months, clamping the day to the target month's last day. */
export function addMonths(isoDate: string, months: number): string {
  const { year, month, day } = parse(isoDate);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const clamped = Math.min(day, lastDayOf(targetYear, targetMonth));
  return toIso(new Date(targetYear, targetMonth - 1, clamped));
}

/** The first statement cutoff on or after `fromIso`. Mirrors the API's
 *  `next_cutoff_on_or_after`: the day clamps to short months. */
export function nextCutoffOn(cutoffDay: number, fromIso: string): string {
  const { year, month } = parse(fromIso);
  const inMonth = (y: number, m: number) =>
    toIso(new Date(y, m - 1, Math.min(cutoffDay, lastDayOf(y, m))));
  const thisMonth = inMonth(year, month);
  if (thisMonth >= fromIso) return thisMonth;
  return month === 12 ? inMonth(year + 1, 1) : inMonth(year, month + 1);
}
