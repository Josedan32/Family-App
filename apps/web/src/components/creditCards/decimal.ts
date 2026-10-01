/** "1,89" or "1.89" → 1.89. Percentages only — never money. */
export function parsePercent(text: string): number {
  return Number(text.replace(",", "."));
}

export function isDay(text: string, max: number): boolean {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= max;
}

/** The API accepts 0..999.99 for both percentages. */
export const MAX_PERCENT = 999.99;

export function isPercent(text: string): boolean {
  if (!/^\d+([.,]\d+)?$/.test(text.trim())) return false;
  return parsePercent(text.trim()) <= MAX_PERCENT;
}

/** A cleared date input yields "": never hand that to the date helpers. */
export function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text);
}
