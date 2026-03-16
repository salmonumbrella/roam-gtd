import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent, ConflictResult } from "../google-calendar";

const mocks = vi.hoisted(() => ({
  fetchEventsForDate: vi.fn<(roamDateTitle: string) => Promise<Array<CalendarEvent>>>(
    async () => [],
  ),
  hasConflict: vi.fn<
    (
      events: Array<CalendarEvent>,
      startTime: Date,
      durationMinutes: number,
    ) => ConflictResult | null
  >(() => null),
  isGoogleCalendarAvailable: vi.fn<() => boolean>(() => true),
}));

vi.mock("../google-calendar", async () => {
  const actual = await vi.importActual<typeof import("../google-calendar")>("../google-calendar");
  return {
    ...actual,
    fetchEventsForDate: mocks.fetchEventsForDate,
    hasConflict: mocks.hasConflict,
    isGoogleCalendarAvailable: mocks.isGoogleCalendarAvailable,
  };
});

import {
  formatScheduleConflictMessage,
  getTriageDueDateTooltipLabel,
  loadMatchedCalendarEventTimeLabel,
  matchCalendarEventTime,
  resolveScheduleConflictMessage,
} from "../triage/schedule-support";

function formatLocalTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

describe("triage schedule support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the due-date tooltip when due is unset and otherwise appends matched calendar time only for persisted dates", () => {
    expect(
      getTriageDueDateTooltipLabel({
        gcalTime: "9:30 AM",
        persistedDueDate: "[[February 25th, 2026]]",
        scheduleIntent: null,
        unsetDue: true,
      }),
    ).toBeNull();

    expect(
      getTriageDueDateTooltipLabel({
        gcalTime: "9:30 AM",
        persistedDueDate: "[[February 25th, 2026]]",
        scheduleIntent: null,
        unsetDue: false,
      }),
    ).toBe("[[February 25th, 2026]] at 9:30 AM");

    expect(
      getTriageDueDateTooltipLabel({
        gcalTime: "9:30 AM",
        persistedDueDate: "[[February 25th, 2026]]",
        scheduleIntent: {
          date: new Date("2026-02-26T17:30:00.000Z"),
          googleCalendarAccount: null,
          roamDate: "February 26th, 2026",
          time: "09:30",
        },
        unsetDue: false,
      }),
    ).toBe(`February 26th, 2026 at ${formatLocalTime("2026-02-26T17:30:00.000Z")}`);
  });

  it("matches calendar events by exact inclusion and fuzzy prefix overlap", () => {
    expect(matchCalendarEventTime("  Review Draft for Launch  ", "review draft")).toBe(true);
    expect(
      matchCalendarEventTime("Weekly planning with product and design", "weekly planning wit"),
    ).toBe(true);
    expect(matchCalendarEventTime("Ship homepage", "Budget review")).toBe(false);
  });

  it("loads the matched calendar time label for the closest event summary", async () => {
    mocks.fetchEventsForDate.mockResolvedValueOnce([
      {
        end: { dateTime: "2026-02-25T18:00:00.000Z" },
        start: { dateTime: "2026-02-25T17:30:00.000Z" },
        summary: "Review draft",
      },
      {
        end: { dateTime: "2026-02-25T20:00:00.000Z" },
        start: { dateTime: "2026-02-25T19:30:00.000Z" },
        summary: "Another event",
      },
    ]);

    await expect(
      loadMatchedCalendarEventTimeLabel({
        persistedDueDate: "February 25th, 2026",
        targetText: "{{[[TODO]]}} Review draft with team",
      }),
    ).resolves.toBe(formatLocalTime("2026-02-25T17:30:00.000Z"));
  });

  it("fails closed when matched-time lookup is unavailable, has no match, or calendar fetch throws", async () => {
    mocks.isGoogleCalendarAvailable.mockReturnValueOnce(false);
    await expect(
      loadMatchedCalendarEventTimeLabel({
        persistedDueDate: "February 25th, 2026",
        targetText: "Review draft",
      }),
    ).resolves.toBeNull();

    mocks.fetchEventsForDate.mockResolvedValueOnce([
      {
        end: { dateTime: "2026-02-25T18:00:00.000Z" },
        start: { dateTime: "2026-02-25T17:30:00.000Z" },
        summary: "Another event",
      },
    ]);
    await expect(
      loadMatchedCalendarEventTimeLabel({
        persistedDueDate: "February 25th, 2026",
        targetText: "Review draft",
      }),
    ).resolves.toBeNull();

    mocks.fetchEventsForDate.mockRejectedValueOnce(new Error("boom"));
    await expect(
      loadMatchedCalendarEventTimeLabel({
        persistedDueDate: "February 25th, 2026",
        targetText: "Review draft",
      }),
    ).resolves.toBeNull();
  });

  it("formats schedule conflict messages with local time ranges", () => {
    expect(
      formatScheduleConflictMessage({
        conflict: {
          endTime: "2026-02-25T18:00:00.000Z",
          eventName: "Design review",
          startTime: "2026-02-25T17:30:00.000Z",
        },
        scheduleConflictLabel: "Conflict",
      }),
    ).toBe(
      `Conflict: "Design review" ${formatLocalTime("2026-02-25T17:30:00.000Z")}-${formatLocalTime("2026-02-25T18:00:00.000Z")}`,
    );
  });

  it("returns the formatted conflict message when calendar events overlap", async () => {
    const intent = {
      date: new Date("2026-02-25T17:30:00.000Z"),
      googleCalendarAccount: null,
      roamDate: "February 25th, 2026",
      time: "09:30",
    };

    const events = [
      {
        end: {},
        start: {},
        summary: "Design review",
      },
    ];

    mocks.fetchEventsForDate.mockResolvedValueOnce(events);
    mocks.hasConflict.mockReturnValueOnce({
      endTime: "2026-02-25T18:00:00.000Z",
      eventName: "Design review",
      startTime: "2026-02-25T17:30:00.000Z",
    });

    await expect(
      resolveScheduleConflictMessage({
        intent,
        scheduleConflictLabel: "Conflict",
      }),
    ).resolves.toBe(
      `Conflict: "Design review" ${formatLocalTime("2026-02-25T17:30:00.000Z")}-${formatLocalTime("2026-02-25T18:00:00.000Z")}`,
    );

    expect(mocks.hasConflict).toHaveBeenCalledWith(events, intent.date, 10);
  });

  it("fails closed for conflict lookup when time is missing, no overlap exists, or calendar fetch throws", async () => {
    await expect(
      resolveScheduleConflictMessage({
        intent: {
          date: new Date("2026-02-25T17:30:00.000Z"),
          googleCalendarAccount: null,
          roamDate: "February 25th, 2026",
          time: "",
        },
        scheduleConflictLabel: "Conflict",
      }),
    ).resolves.toBeNull();

    mocks.hasConflict.mockReturnValueOnce(null);
    await expect(
      resolveScheduleConflictMessage({
        intent: {
          date: new Date("2026-02-25T17:30:00.000Z"),
          googleCalendarAccount: null,
          roamDate: "February 25th, 2026",
          time: "09:30",
        },
        scheduleConflictLabel: "Conflict",
      }),
    ).resolves.toBeNull();

    mocks.fetchEventsForDate.mockRejectedValueOnce(new Error("boom"));
    await expect(
      resolveScheduleConflictMessage({
        intent: {
          date: new Date("2026-02-25T17:30:00.000Z"),
          googleCalendarAccount: null,
          roamDate: "February 25th, 2026",
          time: "09:30",
        },
        scheduleConflictLabel: "Conflict",
      }),
    ).resolves.toBeNull();
  });
});
