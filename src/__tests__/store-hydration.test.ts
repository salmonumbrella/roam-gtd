import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  pullEntities: vi.fn((): Array<Record<string, unknown>> => []),
  runRoamQuery: vi.fn((..._args: Array<unknown>) => [] as Array<Array<string | number>>),
}));

vi.mock("../data", () => ({
  computeAgeDays: () => 0,
  executeQuery: mocks.executeQuery,
  normalizeTodoRow: (
    row: readonly [string, string, string, number],
    deferredDate: string | null = null,
  ) => ({
    ageDays: 0,
    createdTime: row[3],
    deferredDate,
    pageTitle: row[2],
    text: row[1],
    uid: row[0],
  }),
  normalizeTopGoalRow: (row: readonly [string, string, string]) => ({
    goal: row[1],
    pageTitle: row[2],
    text: row[1],
    uid: row[0],
  }),
  pullEntities: mocks.pullEntities,
  runRoamQuery: mocks.runRoamQuery,
}));

import type { GtdState } from "../store";
import { runStoreRefresh } from "../store/hydration";
import { TEST_SETTINGS } from "./fixtures";

function createEmptyState(): GtdState {
  return {
    backHalfHydrated: false,
    backHalfLoadedAt: null,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [],
    lastWeekMetrics: null,
    loading: false,
    nextActions: [],
    projects: [],
    projectsHydrated: false,
    projectsLoadedAt: null,
    projectsLoading: false,
    someday: [],
    stale: [],
    ticklerItems: [],
    topGoals: [],
    triagedThisWeekCount: 0,
    waitingFor: [],
    workflowHydrated: false,
  };
}

describe("store hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates workflow scope without mutating unrelated slices", async () => {
    mocks.executeQuery.mockImplementation(async (queryDef?: { query?: string }) => {
      const query = queryDef?.query ?? "";
      if (query.includes(":in $ [?tag-title ...]")) {
        return [["todo-1", "{{[[TODO]]}} next", "Page", 1000, TEST_SETTINGS.tagNextAction]];
      }
      return [];
    });

    let state = createEmptyState();
    const notify = vi.fn();

    await runStoreRefresh({
      getState: () => state,
      notify,
      scopeMask: 1 << 1,
      setState: (nextState) => {
        state = nextState;
      },
      settings: TEST_SETTINGS,
    });

    expect(state.nextActions.map((item) => item.uid)).toEqual(["todo-1"]);
    expect(state.inbox).toEqual([]);
    expect(state.projects).toEqual([]);
    expect(state.backHalfHydrated).toBe(false);
  });

  it("hydrates projects scope and marks project hydration state", async () => {
    // buildActiveProjectEntityIdsQuery returns entity IDs
    mocks.executeQuery.mockResolvedValue([[101]]);
    // pullEntities returns PulledProjectEntity data
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          { ":block/string": "Status:: #[[ON_TRACK]]", ":block/uid": "status-1" },
          {
            ":block/children": [
              {
                ":block/refs": [{ ":node/title": "DONE" }],
                ":block/string": "{{[[DONE]]}} Closed blocker",
                ":block/uid": "todo-2",
                ":create/time": 1200,
                ":edit/time": 2200,
              },
              {
                ":block/refs": [{ ":node/title": "TODO" }],
                ":block/string": "{{[[TODO]]}} Review blockers",
                ":block/uid": "todo-1",
                ":create/time": 1000,
              },
            ],
            ":block/string": "Todo List::",
            ":block/uid": "list-1",
          },
        ],
        ":block/string": "Project:: Ship launch",
        ":block/uid": "project-1",
      },
    ]);

    let state = createEmptyState();

    await runStoreRefresh({
      getState: () => state,
      notify: vi.fn(),
      scopeMask: 1 << 2,
      setState: (nextState) => {
        state = nextState;
      },
      settings: TEST_SETTINGS,
    });

    expect(state.projectsHydrated).toBe(true);
    expect(state.projectsLoading).toBe(false);
    expect(state.projectsLoadedAt).toEqual(expect.any(Number));
    expect(mocks.pullEntities).toHaveBeenCalledWith(expect.stringContaining(":edit/time"), [101]);
    expect(state.projects).toEqual([
      expect.objectContaining({
        doneCount: 1,
        lastDoneTime: 2200,
        lastTodoUid: "todo-1",
        pageTitle: "Ship launch",
        pageUid: "project-1",
        totalCount: 2,
      }),
    ]);
  });

  it("hydrates back-half scope and updates hydration flags", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 2, 3, 9, 0, 0).getTime());
    mocks.executeQuery.mockResolvedValue([]);

    let state = createEmptyState();

    try {
      await runStoreRefresh({
        getState: () => state,
        notify: vi.fn(),
        scopeMask: 1 << 3,
        setState: (nextState) => {
          state = nextState;
        },
        settings: TEST_SETTINGS,
      });
    } finally {
      nowSpy.mockRestore();
    }

    expect(state.backHalfHydrated).toBe(true);
    expect(state.backHalfLoadedAt).toEqual(expect.any(Number));
    expect(state.completedThisWeek).toEqual([]);
    expect(state.topGoals).toEqual([]);
  });

  it("hydrates completed-this-week items with edit time and parses decimal avg time", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 2, 3, 9, 0, 0).getTime());
    mocks.executeQuery.mockImplementation(async (queryDef?: { query?: string }) => {
      const query = queryDef?.query ?? "";
      if (query.includes(":find ?uid ?s ?page-title ?create-time ?edit-time")) {
        return [["done-1", "{{[[DONE]]}} Ship it", "Ship launch", 1000, 2500]];
      }
      return [];
    });
    mocks.runRoamQuery.mockImplementation((...args: Array<unknown>) => {
      const [query, parentUid] = args as [string, string?];
      if (query.includes('[?p :node/title "Weekly Reviews"]')) {
        return [["weekly-reviews"]];
      }
      if (query.includes(":find ?child-uid ?child-str ?order")) {
        expect(parentUid).toBe("weekly-reviews");
        return [["review-entry-1", "Weekly Review", 0]];
      }
      if (query.includes(":find ?str :in $ ?parent-uid")) {
        expect(parentUid).toBe("review-entry-1");
        return [
          ["Completed:: 4"],
          ["Open Next Actions:: 3"],
          ["Waiting For:: 2"],
          ["Delegated:: 1"],
          ["Someday:: 5"],
          ["Active Projects:: 6"],
          ["Stale Items:: 7"],
          ["Avg Time:: 3.25"],
        ];
      }
      return [];
    });

    let state = createEmptyState();

    try {
      await runStoreRefresh({
        getState: () => state,
        notify: vi.fn(),
        scopeMask: 1 << 3,
        setState: (nextState) => {
          state = nextState;
        },
        settings: TEST_SETTINGS,
      });
    } finally {
      nowSpy.mockRestore();
    }

    expect(state.completedThisWeek).toEqual([
      expect.objectContaining({
        createdTime: 1000,
        editTime: 2500,
        uid: "done-1",
      }),
    ]);
    expect(state.lastWeekMetrics).toEqual({
      avgTime: 3.25,
      completed: 4,
      delegated: 1,
      nextActions: 3,
      projects: 6,
      someday: 5,
      stale: 7,
      waitingFor: 2,
    });
  });

  it("defaults avgTime to null when weekly review summaries do not include it", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 2, 3, 9, 0, 0).getTime());
    mocks.executeQuery.mockResolvedValue([]);
    mocks.runRoamQuery.mockImplementation((...args: Array<unknown>) => {
      const [query] = args as [string];
      if (query.includes('[?p :node/title "Weekly Reviews"]')) {
        return [["weekly-reviews"]];
      }
      if (query.includes(":find ?child-uid ?child-str ?order")) {
        return [["review-entry-1", "Weekly Review", 0]];
      }
      if (query.includes(":find ?str :in $ ?parent-uid")) {
        return [
          ["Completed:: 4"],
          ["Open Next Actions:: 3"],
          ["Waiting For:: 2"],
          ["Delegated:: 1"],
          ["Someday:: 5"],
          ["Active Projects:: 6"],
          ["Stale Items:: 7"],
        ];
      }
      return [];
    });

    let state = createEmptyState();

    try {
      await runStoreRefresh({
        getState: () => state,
        notify: vi.fn(),
        scopeMask: 1 << 3,
        setState: (nextState) => {
          state = nextState;
        },
        settings: TEST_SETTINGS,
      });
    } finally {
      nowSpy.mockRestore();
    }

    expect(state.lastWeekMetrics).toEqual({
      avgTime: null,
      completed: 4,
      delegated: 1,
      nextActions: 3,
      projects: 6,
      someday: 5,
      stale: 7,
      waitingFor: 2,
    });
  });
});
