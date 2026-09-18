import { describe, expect, it } from "vitest";

import { currentMonth, isMonth, monthLabel, shiftMonth } from "../months";

describe("months", () => {
  it("reads the local month, not the UTC one", () => {
    expect(currentMonth(new Date(2026, 8, 30, 21, 0))).toBe("2026-09");
  });

  it("steps across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-09", -8)).toBe("2026-01");
  });

  it("names the month in Spanish", () => {
    expect(monthLabel("2026-09")).toBe("Septiembre 2026");
  });

  it("accepts only YYYY-MM", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("sep")).toBe(false);
    expect(isMonth(null)).toBe(false);
  });
});
