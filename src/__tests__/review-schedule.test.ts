import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConflictResult } from "../google-calendar";

const {
  createEvent,
  fetchEventsForDate,
  formatCalendarEventSummary,
  getOrderedChildren,
  hasConflict,
  isGoogleCalendarAvailable,
} = vi.hoisted(() => ({
  createEvent: vi.fn(),
  fetchEventsForDate: vi.fn(),
  formatCalendarEventSummary: vi.fn(),
  getOrderedChildren: vi.fn(),
  hasConflict: vi.fn(),
  isGoogleCalendarAvailable: vi.fn(),
}));

vi.mock("../google-calendar", () => ({
  createEvent,
  fetchEventsForDate,
  formatCalendarEventSummary,
  hasConflict,
  isGoogleCalendarAvailable,
}));

vi.mock("../graph-utils", () => ({
  getOrderedChildren,
}));

import {
  applyScheduleIntentToBlock,
  checkScheduleConflict,
  clearDueDateChild,
  getCurrentDueDateValue,
  upsertDueDateChild,
} from "../review/schedule";

describe("weekly review schedule", () => {
  let createBlock: ReturnType<typeof vi.fn>;
  let deleteBlock: ReturnType<typeof vi.fn>;
  let updateBlock: ReturnType<typeof vi.fn>;
  let generateUID: ReturnType<typeof vi.fn>;
  let pull: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createBlock = vi.fn(() => Promise.resolve());
    deleteBlock = vi.fn(() => Promise.resolve());
    updateBlock = vi.fn(() => Promise.resolve());
    generateUID = vi.fn(() => "generated-due-uid");
    pull = vi.fn(() => ({ ":block/string": "{{[[TODO]]}} follow up with Alice" }));

    createEvent.mockReset();
    fetchEventsForDate.mockReset();
    formatCalendarEventSummary.mockReset();
    getOrderedChildren.mockReset();
    hasConflict.mockReset();
    isGoogleCalendarAvailable.mockReset();
    getOrderedChildren.mockReturnValue([]);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull },
        deleteBlock,
        updateBlock,
        util: {
          generateUID,
        },
      },
    });
  });

  it("reads the current due date value while stripping preserved hashtags", () => {
    getOrderedChildren.mockReturnValue([
      { order: 0, string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
    ]);

    expect(getCurrentDueDateValue("parent-uid")).toBe("March 26th, 2026");
  });

  it("creates a new due child and marks it as side view", async () => {
    const result = await upsertDueDateChild("parent-uid", "March 26th, 2026", []);

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Due:: [[March 26th, 2026]]", uid: "generated-due-uid" },
      location: { order: "last", "parent-uid": "parent-uid" },
    });
    expect(updateBlock).toHaveBeenCalledWith({
      block: { "block-view-type": "side", uid: "generated-due-uid" },
    });
    expect(result).toEqual([
      { order: 0, string: "Due:: [[March 26th, 2026]]", uid: "generated-due-uid" },
    ]);
  });

  it("updates an existing due child while preserving inline hashtags", async () => {
    const children = [
      { order: 0, string: "Due:: [[March 20th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
      { order: 1, string: "something else", uid: "other-uid" },
    ];

    const result = await upsertDueDateChild("parent-uid", "March 26th, 2026", children);

    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { "block-view-type": "side", uid: "due-uid" },
    });
    expect(result).toEqual([
      { order: 0, string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
      { order: 1, string: "something else", uid: "other-uid" },
    ]);
  });

  it("clears the due child entirely when it carries no hashtag metadata", async () => {
    const children = [{ order: 0, string: "Due:: [[March 26th, 2026]]", uid: "due-uid" }];

    const result = await clearDueDateChild("parent-uid", children);

    expect(deleteBlock).toHaveBeenCalledWith({ block: { uid: "due-uid" } });
    expect(updateBlock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("keeps hashtag metadata inline when clearing a due child", async () => {
    const children = [
      { order: 0, string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
    ];

    const result = await clearDueDateChild("parent-uid", children);

    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "#[[Office]] #urgent", uid: "due-uid" },
    });
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(result).toEqual([{ order: 0, string: "#[[Office]] #urgent", uid: "due-uid" }]);
  });

  it("returns null for conflicts when the intent has no time or calendar integration is unavailable", async () => {
    isGoogleCalendarAvailable.mockReturnValue(false);

    const result = await checkScheduleConflict({
      date: new Date("2026-03-26T09:00:00.000Z"),
      roamDate: "March 26th, 2026",
      time: "9:00 AM",
    });

    expect(fetchEventsForDate).not.toHaveBeenCalled();
    expect(hasConflict).not.toHaveBeenCalled();
    expect(result).toBeNull();

    isGoogleCalendarAvailable.mockReturnValue(true);

    const noTime = await checkScheduleConflict({
      date: new Date("2026-03-26T09:00:00.000Z"),
      roamDate: "March 26th, 2026",
      time: "",
    });

    expect(noTime).toBeNull();
  });

  it("delegates conflict detection to google-calendar helpers and returns null on fetch failure", async () => {
    const conflict: ConflictResult = {
      endTime: "2026-03-26T09:10:00.000Z",
      eventName: "Standup",
      startTime: "2026-03-26T09:00:00.000Z",
    };
    const intent = {
      date: new Date("2026-03-26T09:00:00.000Z"),
      roamDate: "March 26th, 2026",
      time: "9:00 AM",
    };

    isGoogleCalendarAvailable.mockReturnValue(true);
    fetchEventsForDate.mockResolvedValue([{ summary: "Standup" }]);
    hasConflict.mockReturnValue(conflict);

    await expect(checkScheduleConflict(intent)).resolves.toEqual(conflict);
    expect(fetchEventsForDate).toHaveBeenCalledWith("March 26th, 2026");
    expect(hasConflict).toHaveBeenCalledWith([{ summary: "Standup" }], intent.date, 10);

    fetchEventsForDate.mockRejectedValueOnce(new Error("network"));

    await expect(checkScheduleConflict(intent)).resolves.toBeNull();
  });

  it("updates the due date without touching calendar APIs when the intent has no time", async () => {
    isGoogleCalendarAvailable.mockReturnValue(true);

    await applyScheduleIntentToBlock("parent-uid", {
      date: new Date("2026-03-26T09:00:00.000Z"),
      roamDate: "March 26th, 2026",
      time: "",
    });

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Due:: [[March 26th, 2026]]", uid: "generated-due-uid" },
      location: { order: "last", "parent-uid": "parent-uid" },
    });
    expect(createEvent).not.toHaveBeenCalled();
    expect(formatCalendarEventSummary).not.toHaveBeenCalled();
  });

  it("creates a calendar event with the formatted summary when calendar integration is available", async () => {
    isGoogleCalendarAvailable.mockReturnValue(true);
    formatCalendarEventSummary.mockReturnValue("Follow up with Alice");

    await applyScheduleIntentToBlock("parent-uid", {
      date: new Date("2026-03-26T09:00:00.000Z"),
      googleCalendarAccount: "Work",
      roamDate: "March 26th, 2026",
      time: "9:00 AM",
    });

    expect(pull).toHaveBeenCalledWith("[:block/string]", [":block/uid", "parent-uid"]);
    expect(formatCalendarEventSummary).toHaveBeenCalledWith("{{[[TODO]]}} follow up with Alice");
    expect(createEvent).toHaveBeenCalledWith(
      "Follow up with Alice",
      "parent-uid",
      new Date("2026-03-26T09:00:00.000Z"),
      10,
      "Work",
    );
  });

  it("notifies the caller when calendar event creation fails", async () => {
    const onGoogleCalendarUnavailable = vi.fn();

    isGoogleCalendarAvailable.mockReturnValue(true);
    formatCalendarEventSummary.mockReturnValue("Follow up with Alice");
    createEvent.mockRejectedValue(new Error("calendar unavailable"));

    await applyScheduleIntentToBlock(
      "parent-uid",
      {
        date: new Date("2026-03-26T09:00:00.000Z"),
        roamDate: "March 26th, 2026",
        time: "9:00 AM",
      },
      onGoogleCalendarUnavailable,
    );

    expect(onGoogleCalendarUnavailable).toHaveBeenCalledTimes(1);
  });
});
