const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "2026-08-20" → "20 ago 2026". Parsed by hand: a bare ISO date handed to
 *  `new Date` is UTC midnight, which is the previous day in Bogotá. */
export function formatDayMonthYear(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS_ES[month - 1]} ${year}`;
}
