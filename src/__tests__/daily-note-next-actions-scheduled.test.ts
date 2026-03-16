import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
}));

vi.mock("../data", () => ({
  executeQuery: mocks.executeQuery,
}));

import {
  fetchScheduledChildrenByParent,
  filterScheduledChildrenForDay,
  parseDueOrReminderDateKeyFromChildString,
} from "../planning/daily-note-next-actions/scheduled";

describe("daily-note next actions scheduled helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses page-ref due strings only when the target is a daily note", () => {
    expect(
      parseDueOrReminderDateKeyFromChildString(
        "Due:: [[February 25th, 2026]]",
        new Set(["February 25th, 2026"]),
      ),
    ).toBe("2026-02-25");
    expect(
      parseDueOrReminderDateKeyFromChildString("Due:: [[February 25th, 2026]]", new Set<string>()),
    ).toBeNull();
  });

  it("groups scheduled children by parent and day key", async () => {
    mocks.executeQuery
      .mockResolvedValueOnce([
        ["parent-1", "Call bank", "child-1", "Due:: [[February 25th, 2026]]", 0],
        ["parent-1", "Call bank", "child-2", "Reminder:: [[February 25th, 2026]]", 1],
        ["parent-2", "Review draft", "child-3", "Reminder:: [[February 26th, 2026]]", 0],
      ])
      .mockResolvedValueOnce([["February 25th, 2026"], ["February 26th, 2026"]]);

    const grouped = await fetchScheduledChildrenByParent();

    expect(grouped.get("parent-1")).toEqual({
      childUidsByDayKey: new Map([["2026-02-25", ["child-1", "child-2"]]]),
      parentString: "Call bank",
    });
    expect(grouped.get("parent-2")).toEqual({
      childUidsByDayKey: new Map([["2026-02-26", ["child-3"]]]),
      parentString: "Review draft",
    });
  });

  it("filters scheduled children to the requested day", () => {
    const filtered = filterScheduledChildrenForDay(
      new Map([
        [
          "parent-1",
          { childUidsByDayKey: new Map([["2026-02-25", ["child-1"]]]), parentString: "Call bank" },
        ],
        [
          "parent-2",
          {
            childUidsByDayKey: new Map([["2026-02-26", ["child-2"]]]),
            parentString: "Review draft",
          },
        ],
      ]),
      "February 25th, 2026",
    );

    expect(filtered).toEqual(
      new Map([["parent-1", { childUids: ["child-1"], parentString: "Call bank" }]]),
    );
  });
});
