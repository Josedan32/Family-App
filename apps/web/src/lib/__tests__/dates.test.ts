import { describe, expect, it } from "vitest";

import { addDays, formatDayMonthYear, todayLocal, weekdayDayMonth } from "../dates";

describe("dates", () => {
  it("formats a date without shifting it a day", () => {
    expect(formatDayMonthYear("2026-08-20")).toBe("20 ago 2026");
  });

  it("reads today in local time, not UTC", () => {
    // 9 p.m. on the 18th locally is already the 19th in UTC for Bogotá.
    expect(todayLocal(new Date(2026, 8, 18, 21, 0))).toBe("2026-09-18");
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("names the weekday in Spanish", () => {
    expect(weekdayDayMonth("2026-09-19")).toBe("Sábado 19 sep");
  });
});
