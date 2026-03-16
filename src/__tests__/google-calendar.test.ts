import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchEventsForDate,
  formatCalendarEventSummary,
  hasConflict,
  parseGoogleLinkedCalendars,
  resolveNestedBlockReferences,
  selectGoogleCalendarAccountOptions,
  selectPrimaryGoogleAccountLabel,
} from "../google-calendar";

const event = (summary: string, startHour: number, endHour: number) => ({
  end: { dateTime: `2026-03-06T${String(endHour).padStart(2, "0")}:00:00Z` },
  start: { dateTime: `2026-03-06T${String(startHour).padStart(2, "0")}:00:00Z` },
  summary,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchEventsForDate", () => {
  it("returns an empty list when the google extension is unavailable", async () => {
    vi.stubGlobal("window", {});

    await expect(fetchEventsForDate("March 6th, 2026")).resolves.toEqual([]);
  });

  it("filters out malformed fetch results", async () => {
    const fetchGoogleCalendar = vi
      .fn()
      .mockResolvedValue([
        { event: event("Standup", 9, 10) },
        { nope: true },
        { event: "bad-result" },
      ]);

    vi.stubGlobal("window", {
      roamjs: {
        extension: {
          google: {
            fetchGoogleCalendar,
          },
        },
      },
    });

    await expect(fetchEventsForDate("March 6th, 2026")).resolves.toEqual([event("Standup", 9, 10)]);
    expect(fetchGoogleCalendar).toHaveBeenCalledWith({
      endDatePageTitle: "March 6th, 2026",
      startDatePageTitle: "March 6th, 2026",
    });
  });
});

describe("hasConflict", () => {
  it("returns null when no events overlap", () => {
    const events = [event("Standup", 9, 10), event("Lunch", 12, 13)];
    const start = new Date("2026-03-06T14:00:00Z");
    expect(hasConflict(events, start, 10)).toBeNull();
  });

  it("detects overlap when new event starts during existing event", () => {
    const events = [event("Standup", 9, 10)];
    const start = new Date("2026-03-06T09:30:00Z");
    const result = hasConflict(events, start, 10);
    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("Standup");
  });

  it("detects overlap when existing event starts during new event", () => {
    const events = [event("Standup", 9, 10)];
    const start = new Date("2026-03-06T08:55:00Z");
    const result = hasConflict(events, start, 10);
    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("Standup");
  });

  it("returns null when events are exactly adjacent (no overlap)", () => {
    const events = [event("Standup", 9, 10)];
    const start = new Date("2026-03-06T10:00:00Z");
    expect(hasConflict(events, start, 10)).toBeNull();
  });

  it("returns null for empty events array", () => {
    expect(hasConflict([], new Date("2026-03-06T14:00:00Z"), 10)).toBeNull();
  });

  it("detects overlap against all-day events", () => {
    const events = [
      {
        end: { date: "2026-03-07" },
        start: { date: "2026-03-06" },
        summary: "All Day Event",
      },
    ];
    const start = new Date("2026-03-06T14:00:00Z");
    const result = hasConflict(events, start, 10);
    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("All Day Event");
  });

  it("returns first conflicting event when multiple overlap", () => {
    const events = [event("A", 14, 15), event("B", 14, 15)];
    const start = new Date("2026-03-06T14:00:00Z");
    const result = hasConflict(events, start, 10);
    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("A");
  });

  it("skips invalid events and falls back to an untitled label", () => {
    const events = [
      { end: { dateTime: "not-a-date" }, start: { dateTime: "still-bad" }, summary: "Broken" },
      {
        end: { dateTime: "2026-03-06T10:00:00Z" },
        start: { dateTime: "2026-03-06T09:00:00Z" },
      } as unknown as ReturnType<typeof event>,
    ];
    const start = new Date("2026-03-06T09:30:00Z");
    const result = hasConflict(events, start, 10);

    expect(result).toEqual({
      endTime: "2026-03-06T10:00:00Z",
      eventName: "(No title)",
      startTime: "2026-03-06T09:00:00Z",
    });
  });
});

describe("formatCalendarEventSummary", () => {
  it("strips TODO markers, hashtags, and page refs, then capitalizes", () => {
    const input =
      "{{[[TODO]]}} ask someone to schedule a meeting and send the agenda #[[Agenda]]";
    expect(formatCalendarEventSummary(input)).toBe(
      "Ask someone to schedule a meeting and send the agenda",
    );
  });

  it("returns fallback title when content is fully stripped", () => {
    expect(formatCalendarEventSummary("{{[[TODO]]}} #[[Agenda]] [[Home]]")).toBe("(Untitled)");
  });

  it("strips repeated legacy leading status markers before formatting", () => {
    expect(formatCalendarEventSummary("- [[DONE]] {{[[ARCHIVED]]}} follow up #[[Agenda]]")).toBe(
      "Follow up",
    );
  });

  it("removes query/code-only content", () => {
    const input = "{{[[query]]: {:find ?x}}} ```js const x = 1```";
    expect(formatCalendarEventSummary(input)).toBe("(Untitled)");
    expect(formatCalendarEventSummary(":q [:find ?e]")).toBe("(Untitled)");
  });

  it("resolves nested block refs into plain text summary", () => {
    const refs: Record<string, string> = {
      refuid001: "{{[[TODO]]}} ask someone to schedule a meeting and send the agenda",
      refuid002: "((refuid001)) #[[Agenda]]",
    };
    const input = "{{[[TODO]]}} ((refuid002)) #[[Agenda]]";
    expect(formatCalendarEventSummary(input, (uid) => refs[uid] ?? null)).toBe(
      "Ask someone to schedule a meeting and send the agenda",
    );
  });

  it("drops unresolved block refs while keeping surrounding text", () => {
    expect(formatCalendarEventSummary("follow up ((miss00001)) soon", () => null)).toBe(
      "Follow up soon",
    );
  });

  it("strips markdown links, styling, commands, and leading punctuation", () => {
    const input = "- **follow** [docs](https://example.com) {{or}} ~~soon~~";

    expect(formatCalendarEventSummary(input)).toBe("Follow docs soon");
  });
});

describe("google account selection", () => {
  it("prefers the account bound to calendar=primary", () => {
    const calendars = [
      { account: "Work", calendar: "my-team-calendar@group.calendar.google.com" },
      { account: "Personal", calendar: "primary" },
    ];
    expect(selectPrimaryGoogleAccountLabel(calendars)).toBe("Personal");
  });

  it("falls back to first configured account when no primary row is present", () => {
    const calendars = [
      { account: "Work", calendar: "team@group.calendar.google.com" },
      { account: "Personal", calendar: "home@group.calendar.google.com" },
    ];
    expect(selectPrimaryGoogleAccountLabel(calendars)).toBe("Work");
  });

  it("parses linked calendars from JSON array or wrapped calendars payload", () => {
    const raw = [
      '{"calendar":"primary","account":"Personal"}',
      '{"calendars":[{"calendar":"team@group.calendar.google.com","account":"Work"}]}',
    ];
    expect(parseGoogleLinkedCalendars(raw)).toEqual([
      { account: "Personal", calendar: "primary" },
      { account: "Work", calendar: "team@group.calendar.google.com" },
    ]);
  });

  it("dedupes account options and keeps the preferred account first", () => {
    const calendars = [
      { account: "Work", calendar: "team@group.calendar.google.com" },
      { account: "Personal", calendar: "primary" },
      { account: "Work", calendar: "primary" },
    ];
    expect(selectGoogleCalendarAccountOptions(calendars)).toEqual([
      { account: "Personal", label: "Personal" },
      { account: "Work", label: "Work" },
    ]);
  });

  it("falls back to oauth account labels when linked calendars are missing", () => {
    expect(selectGoogleCalendarAccountOptions([], ["user@example.com"])).toEqual([
      { account: "user@example.com", label: "user@example.com" },
    ]);
  });

  it("moves the preferred account to the front of oauth labels when present", () => {
    const calendars = [{ account: "Work", calendar: "primary" }];

    expect(selectGoogleCalendarAccountOptions(calendars, ["Personal", "Work", "Personal"])).toEqual(
      [
        { account: "Work", label: "Work" },
        { account: "Personal", label: "Personal" },
      ],
    );
  });
});

describe("linked calendar parsing", () => {
  it("returns an empty list for invalid or empty payloads", () => {
    expect(parseGoogleLinkedCalendars("not-json")).toEqual([]);
    expect(parseGoogleLinkedCalendars("{bad")).toEqual([]);
    expect(parseGoogleLinkedCalendars({ account: " ", calendar: " " })).toEqual([]);
  });
});

describe("resolveNestedBlockReferences", () => {
  it("stops expanding references at the configured maximum depth", () => {
    const refs: Record<string, string> = {
      refuid001: "((refuid002))",
      refuid002: "((refuid003))",
      refuid003: "done",
    };

    expect(resolveNestedBlockReferences("((refuid001))", (uid) => refs[uid] ?? null, 1)).toBe(
      "((refuid002))",
    );
    expect(resolveNestedBlockReferences("((refuid001))", (uid) => refs[uid] ?? null, 3)).toBe(
      "done",
    );
  });
});
