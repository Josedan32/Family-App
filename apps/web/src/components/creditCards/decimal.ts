/** "1,89" or "1.89" → 1.89. Percentages only — never money. */
export function parsePercent(text: string): number {
  return Number(text.replace(",", "."));
}

export function isDay(text: string, max: number): boolean {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= max;
}
