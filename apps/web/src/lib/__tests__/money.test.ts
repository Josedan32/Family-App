import { describe, expect, it } from "vitest";

import { formatMoney, formatSigned, parseAmountInput } from "../money";

// Intl.NumberFormat inserts U+00A0 (non-breaking space) between the symbol
// and the amount, not a regular space -- matches the design's dollar-space-amount look.
const NBSP = " ";

describe("formatMoney", () => {
  it("formats COP with no decimals and dot grouping", () => {
    expect(formatMoney(2_000_000, "COP")).toBe(`$${NBSP}2.000.000`);
  });

  it("formats zero", () => {
    expect(formatMoney(0, "COP")).toBe(`$${NBSP}0`);
  });

  it("formats USD with two decimals", () => {
    expect(formatMoney(1234, "USD")).toContain("12,34");
  });
});

describe("formatSigned", () => {
  it("prefixes income with a plus", () => {
    expect(formatSigned(50_000, "COP", "income")).toBe(`+$${NBSP}50.000`);
  });

  it("uses a true minus sign for expenses, not a hyphen", () => {
    const rendered = formatSigned(50_000, "COP", "expense");
    expect(rendered.startsWith("−")).toBe(true);
    expect(rendered.startsWith("-")).toBe(false);
  });
});

describe("parseAmountInput", () => {
  it("strips grouping separators", () => {
    expect(parseAmountInput("2.000.000")).toBe(2_000_000);
  });

  it("ignores non-digits", () => {
    expect(parseAmountInput("$15.000 pesos")).toBe(15_000);
  });

  it("returns zero for empty input", () => {
    expect(parseAmountInput("")).toBe(0);
  });
});
