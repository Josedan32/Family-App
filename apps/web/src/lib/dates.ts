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
