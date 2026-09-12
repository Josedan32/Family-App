/**
 * FORMATTING ONLY.
 *
 * The client never does arithmetic on money. Every total comes from the server,
 * computed in integers. JavaScript numbers cannot represent 0.1 exactly, so a
 * total summed here would eventually disagree with the one summed there.
 */

const MINOR_UNITS: Record<string, number> = { COP: 0, USD: 2, EUR: 2 };

/** U+2212, not a hyphen. */
const MINUS = "−";

function fractionDigits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

/** The design keeps the space between the currency symbol and the amount. */
export function formatMoney(amountMinor: number, currency: string): string {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}

export function formatSigned(
  amountMinor: number,
  currency: string,
  kind: "income" | "expense",
): string {
  const formatted = formatMoney(amountMinor, currency);
  return kind === "income" ? `+${formatted}` : `${MINUS}${formatted}`;
}

/** Digits only. Grouping separators, currency symbols and words are discarded. */
export function parseAmountInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits === "" ? 0 : Number.parseInt(digits, 10);
}

export function groupDigits(amountMinor: number, currency: string): string {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}
