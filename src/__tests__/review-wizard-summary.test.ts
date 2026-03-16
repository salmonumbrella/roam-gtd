import { describe, expect, it } from "vitest";

import { buildWeeklyReviewSummaryPayload } from "../review/wizard-summary";
import type { GtdState } from "../store";
import type { TodoItem } from "../types";

function makeTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Inbox",
    text: "{{[[TODO]]}} Follow up",
    uid: "todo-1",
    ...overrides,
  };
}

function createState(overrides: Partial<GtdState> = {}): GtdState {
  return {
    backHalfHydrated: true,
    backHalfLoadedAt: null,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [],
    lastWeekMetrics: null,
    loading: false,
    nextActions: [],
    projects: [],
    projectsHydrated: true,
    projectsLoadedAt: null,
    projectsLoading: false,
    someday: [],
    stale: [],
    ticklerItems: [],
    topGoals: [],
    triagedThisWeekCount: 0,
    waitingFor: [],
    workflowHydrated: true,
    ...overrides,
  };
}

describe("buildWeeklyReviewSummaryPayload", () => {
  it("includes Avg Time when the week has completed items with edit times", () => {
    const payload = buildWeeklyReviewSummaryPayload(
      createState({
        completedThisWeek: [
          makeTodo({ createdTime: 0, editTime: 2 * 86_400_000, uid: "todo-1" }),
          makeTodo({ createdTime: 0, editTime: 4 * 86_400_000, uid: "todo-2" }),
        ],
      }),
      new Date(2026, 2, 15),
    );

    expect(payload.children).toContain("Avg Time:: 3");
  });

  it("omits Avg Time when there is no cycle-time data", () => {
    const payload = buildWeeklyReviewSummaryPayload(
      createState({
        completedThisWeek: [makeTodo({ uid: "todo-1" })],
      }),
      new Date(2026, 2, 15),
    );

    expect(payload.children.some((line) => line.startsWith("Avg Time::"))).toBe(false);
  });
});
