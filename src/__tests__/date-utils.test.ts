import { describe, expect, it } from "vitest";

import {
  formatRoamDate,
  getISOWeekBounds,
  getISOWeekNumber,
  getMondayOfWeek,
  getMonthLogIdRange,
  parseRoamDate,
  toRoamLogId,
} from "../date-utils";

describe("date utils", () => {
  it("formats roam dates with the expected ordinal suffixes", () => {
    expect(formatRoamDate(new Date(2026, 0, 1))).toBe("January 1st, 2026");
    expect(formatRoamDate(new Date(2026, 0, 2))).toBe("January 2nd, 2026");
    expect(formatRoamDate(new Date(2026, 0, 3))).toBe("January 3rd, 2026");
    expect(formatRoamDate(new Date(2026, 0, 11))).toBe("January 11th, 2026");
  });

  it("parses valid roam dates and rejects invalid inputs", () => {
    expect(parseRoamDate("February 29th, 2024")).toEqual(new Date(2024, 1, 29));
    expect(parseRoamDate("")).toBeNull();
    expect(parseRoamDate("Not a date")).toBeNull();
    expect(parseRoamDate("Smarch 10th, 2026")).toBeNull();
    expect(parseRoamDate("February 30th, 2026")).toBeNull();
  });

  it("computes monday-based week helpers and log-id ranges", () => {
    const sunday = new Date(2026, 2, 8, 16, 30);
    const monday = getMondayOfWeek(sunday);
    const bounds = getISOWeekBounds(sunday);

    expect(monday).toEqual(new Date(2026, 2, 2, 16, 30));
    expect(bounds.start).toEqual(new Date(2026, 2, 2, 0, 0, 0, 0));
    expect(bounds.end).toEqual(new Date(2026, 2, 9, 0, 0, 0, 0));
    expect(getISOWeekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(toRoamLogId(new Date(2026, 1, 15))).toBe(Date.UTC(2026, 1, 15));
    expect(getMonthLogIdRange(new Date(2026, 1, 15))).toEqual({
      end: Date.UTC(2026, 1, 28),
      start: Date.UTC(2026, 1, 1),
    });
  });
});
