import { describe, expect, it } from "vitest";

import {
  buildProjectBurnupData,
  computeAvgTime,
  computeProjectHealth,
  computeWeekOverWeekDelta,
  getProjectColor,
  sortProjectsByHealth,
} from "../store/dashboard-derived";
import type { ProjectSummary, TodoItem } from "../types";

function makeProject(
  overrides: Partial<ProjectSummary> = {},
): Pick<ProjectSummary, "doneCount" | "lastDoneTime" | "statusText" | "totalCount"> {
  return {
    doneCount: 0,
    lastDoneTime: null,
    statusText: null,
    totalCount: 0,
    ...overrides,
  };
}

describe("computeAvgTime", () => {
  it("returns the mean days between create and edit time", () => {
    const items: Array<TodoItem> = [
      {
        ageDays: 0,
        createdTime: 0,
        deferredDate: null,
        editTime: 3 * 86_400_000,
        pageTitle: "Work",
        text: "",
        uid: "a",
      },
      {
        ageDays: 0,
        createdTime: 0,
        deferredDate: null,
        editTime: 5 * 86_400_000,
        pageTitle: "Work",
        text: "",
        uid: "b",
      },
    ];

    expect(computeAvgTime(items)).toBeCloseTo(4);
  });

  it("returns null when there are no completed items", () => {
    expect(computeAvgTime([])).toBeNull();
  });

  it("ignores items without an edit time", () => {
    const items: Array<TodoItem> = [
      {
        ageDays: 0,
        createdTime: 0,
        deferredDate: null,
        pageTitle: "Work",
        text: "",
        uid: "a",
      },
    ];

    expect(computeAvgTime(items)).toBeNull();
  });
});

describe("computeProjectHealth", () => {
  const now = Date.UTC(2026, 2, 15);
  const day = 86_400_000;

  it("returns completed when all todos are done", () => {
    expect(
      computeProjectHealth(makeProject({ doneCount: 3, lastDoneTime: now, totalCount: 3 }), now),
    ).toBe("completed");
  });

  it("returns on track when the latest completion is under seven days old", () => {
    expect(
      computeProjectHealth(
        makeProject({ doneCount: 1, lastDoneTime: now - 3 * day, totalCount: 4 }),
        now,
      ),
    ).toBe("on track");
  });

  it("returns lagging for projects idle for seven to ten days", () => {
    expect(
      computeProjectHealth(
        makeProject({ doneCount: 1, lastDoneTime: now - 8 * day, totalCount: 4 }),
        now,
      ),
    ).toBe("lagging");
  });

  it("returns poor when the project has not moved in over ten days", () => {
    expect(
      computeProjectHealth(
        makeProject({ doneCount: 1, lastDoneTime: now - 12 * day, totalCount: 4 }),
        now,
      ),
    ).toBe("poor");
  });

  it("returns poor when no work has been completed", () => {
    expect(computeProjectHealth(makeProject({ totalCount: 4 }), now)).toBe("poor");
  });

  it("returns canceled when the status indicates cancellation", () => {
    expect(
      computeProjectHealth(
        makeProject({ doneCount: 1, lastDoneTime: now, statusText: "#[[x]]", totalCount: 4 }),
        now,
      ),
    ).toBe("canceled");
  });
});

describe("getProjectColor", () => {
  it("returns a stable color for the same uid", () => {
    expect(getProjectColor("abc123")).toBe(getProjectColor("abc123"));
  });

  it("returns a hex color string", () => {
    expect(getProjectColor("project-1")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("sortProjectsByHealth", () => {
  it("sorts by health order and then by latest completion time", () => {
    const sorted = sortProjectsByHealth([
      { health: "poor" as const, lastDoneTime: 10 },
      { health: "completed" as const, lastDoneTime: 20 },
      { health: "lagging" as const, lastDoneTime: 30 },
      { health: "on track" as const, lastDoneTime: 40 },
      { health: "canceled" as const, lastDoneTime: 50 },
    ]);

    expect(sorted.map((project) => project.health)).toEqual([
      "completed",
      "on track",
      "lagging",
      "poor",
      "canceled",
    ]);
  });
});

describe("computeWeekOverWeekDelta", () => {
  it("returns flat when both values are zero", () => {
    expect(computeWeekOverWeekDelta(0, 0)).toEqual({
      direction: "flat",
      pct: 0,
      previous: 0,
    });
  });

  it("returns up when there is no previous baseline", () => {
    expect(computeWeekOverWeekDelta(3, 0)).toEqual({
      direction: "up",
      pct: 100,
      previous: 0,
    });
  });
});

describe("buildProjectBurnupData", () => {
  it("builds scope and completion lines from creation/completion history", () => {
    const start = Date.UTC(2026, 2, 1);
    const history = [
      {
        createTime: start,
        editTime: start + 2 * 86_400_000,
        isDone: true,
        projectUid: "project-1",
        todoUid: "todo-1",
      },
      {
        createTime: start + 3 * 86_400_000,
        editTime: null,
        isDone: false,
        projectUid: "project-1",
        todoUid: "todo-2",
      },
    ];

    expect(
      buildProjectBurnupData(history, { bucketCount: 4, now: start + 7 * 86_400_000 }),
    ).toEqual(
      expect.arrayContaining([
        { completed: 0, scope: 1 },
        { completed: 1, scope: 2 },
      ]),
    );
  });
});
