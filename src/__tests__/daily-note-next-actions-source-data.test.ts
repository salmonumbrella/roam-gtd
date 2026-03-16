import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  normalizeTodoRow: vi.fn((row: readonly [string, string, string, number]) => ({
    ageDays: 0,
    createdTime: row[3],
    deferredDate: null,
    pageTitle: row[2],
    text: row[1],
    uid: row[0],
  })),
}));

vi.mock("../data", () => ({
  executeQuery: mocks.executeQuery,
  normalizeTodoRow: mocks.normalizeTodoRow,
}));

import {
  fetchNearestProjectAncestors,
  fetchOpenNextActions,
  formatContextHeading,
} from "../planning/daily-note-next-actions/source-data";
import { TEST_SETTINGS } from "./fixtures";

describe("daily-note next actions source-data helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats context headings consistently", () => {
    expect(formatContextHeading("Home")).toBe("#Home");
    expect(formatContextHeading("Work Items")).toBe("#[[Work Items]]");
    expect(formatContextHeading("")).toBe("No context");
  });

  it("filters open next actions to the target scheduled day", async () => {
    mocks.executeQuery.mockResolvedValue([
      ["u1", "{{[[TODO]]}} one #up", "Page", 2, TEST_SETTINGS.tagNextAction],
      ["u2", "{{[[TODO]]}} two #up", "Page", 1, TEST_SETTINGS.tagNextAction],
      ["u3", "[[DONE]] closed", "Page", 3, TEST_SETTINGS.tagNextAction],
    ]);

    const items = await fetchOpenNextActions(
      TEST_SETTINGS,
      "February 25th, 2026",
      new Map([
        ["u1", { childUidsByDayKey: new Map([["2026-02-25", ["child-1"]]]), parentString: "u1" }],
        ["u2", { childUidsByDayKey: new Map([["2026-02-26", ["child-2"]]]), parentString: "u2" }],
      ]),
    );

    expect(items.map((item) => item.uid)).toEqual(["u1"]);
  });

  it("finds nearest project ancestors via parent traversal", () => {
    const parentMap = new Map([
      ["todo-1", "list-1"],
      ["list-1", "project-1"],
      ["todo-2", "other-parent"],
      ["other-parent", null],
    ]);
    const stringMap = new Map([
      ["list-1", "Todo List:: 0/1"],
      ["project-1", "Project:: Ship launch"],
      ["other-parent", "Random block"],
    ]);

    const result = fetchNearestProjectAncestors(["todo-1", "todo-2"], {
      getBlockStringByUid: (uid) => stringMap.get(uid) ?? null,
      getDirectParentUid: (uid) => parentMap.get(uid) ?? null,
    });

    expect(result).toEqual(new Map([["todo-1", "project-1"]]));
  });
});
