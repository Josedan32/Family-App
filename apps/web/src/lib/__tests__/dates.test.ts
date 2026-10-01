import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  daysBetween,
  formatDayMonthYear,
  formatDateRange,
  formatDayMonth,
  nextCutoffOn,
  todayLocal,
  weekdayDayMonth,
} from "../dates";

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

describe("card date helpers", () => {
  it("counts whole days, signed", () => {
    expect(daysBetween("2026-09-30", "2026-10-02")).toBe(2);
    expect(daysBetween("2026-09-30", "2026-09-20")).toBe(-10);
    expect(daysBetween("2026-09-30", "2026-09-30")).toBe(0);
  });

  it("formats day and month without a year", () => {
    expect(formatDayMonth("2026-10-02")).toBe("2 oct");
  });

  it("formats a cycle range, repeating the year only when it changes", () => {
    expect(formatDateRange("2026-08-16", "2026-09-15")).toBe("16 ago – 15 sep 2026");
    expect(formatDateRange("2025-12-16", "2026-01-15")).toBe("16 dic 2025 – 15 ene 2026");
  });

  it("adds months clamping to the end of a short month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-15", 3)).toBe("2027-01-15");
  });

  it("finds the next cutoff on or after a date", () => {
    expect(nextCutoffOn(15, "2026-09-30")).toBe("2026-10-15");
    expect(nextCutoffOn(15, "2026-09-15")).toBe("2026-09-15");
  });

  it("clamps a cutoff on day 31 to the last day of a short month", () => {
    expect(nextCutoffOn(31, "2026-02-10")).toBe("2026-02-28");
    expect(nextCutoffOn(30, "2026-01-31")).toBe("2026-02-28");
  });
});
