import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatRoamDate, toRoamLogId } from "../date-utils";
import { TEST_SETTINGS } from "./fixtures";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  pullEntities: vi.fn((): Array<Record<string, unknown>> => []),
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
}));

import { buildTicklerGroups, createGtdStore } from "../store";

function isStaleQueryDef(queryDef?: { inputs?: Array<unknown>; query?: string }): boolean {
  const query = queryDef?.query ?? "";
  return (
    query.includes(":in $ ?cutoff ?today-log-id") &&
    query.includes(":log/id ?page-log-id") &&
    query.includes("[(> ?page-log-id ?today-log-id)]")
  );
}

describe("store inbox refresh filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pullEntities.mockReturnValue([]);
  });

  it("excludes triage todos tagged #up, #watch, #delegated, and #someday from inbox", async () => {
    const taggedTodoRows: Array<[string, string, string, number, string]> = [
      ["uid-1", "{{[[TODO]]}} one #up", "Page", 1000, "up"],
      ["uid-2", "{{[[TODO]]}} two #watch", "Page", 2000, "watch"],
      ["uid-3", "{{[[TODO]]}} three #someday", "Page", 3000, "someday"],
      ["uid-4", "{{[[TODO]]}} four #delegated", "Page", 4000, "delegated"],
    ];

    mocks.executeQuery.mockImplementation(
      async (queryDef?: { inputs?: Array<unknown>; query?: string }) => {
        const query = queryDef?.query ?? "";
        if (query.includes(":find ?triage-parent")) {
          return [[101]];
        }
        if (query.includes(":in $ [?tag-title ...]")) {
          return taggedTodoRows;
        }
        return [];
      },
    );
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          {
            ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "up" }],
            ":block/string": "{{[[TODO]]}} one #up",
            ":block/uid": "uid-1",
            ":create/time": 1000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "watch" }],
            ":block/string": "{{[[TODO]]}} two #watch",
            ":block/uid": "uid-2",
            ":create/time": 2000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "someday" }],
            ":block/string": "{{[[TODO]]}} three #someday",
            ":block/uid": "uid-3",
            ":create/time": 3000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "delegated" }],
            ":block/string": "{{[[TODO]]}} four #delegated",
            ":block/uid": "uid-4",
            ":create/time": 4000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} five",
            ":block/uid": "uid-5",
            ":create/time": 5000,
          },
        ],
        ":block/page": { ":node/title": "Page" },
        ":block/string": "Triage parent",
        ":block/uid": "triage-parent-1",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS);

    const inboxUids = store.getSnapshot().inbox.map((item) => item.uid);
    expect(inboxUids).toEqual(["uid-5"]);
  });

  it("supports inbox-only refresh scope for fast step-1 boot", async () => {
    mocks.executeQuery.mockResolvedValue([[101]]);
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} alpha",
            ":block/uid": "uid-a",
            ":create/time": 2000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} beta",
            ":block/uid": "uid-b",
            ":create/time": 1000,
          },
        ],
        ":block/page": { ":node/title": "Page" },
        ":block/string": "Triage parent",
        ":block/uid": "triage-parent-1",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "inboxOnly" });

    expect(mocks.executeQuery).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().inbox.map((item) => item.uid)).toEqual(["uid-a", "uid-b"]);
    expect(store.getSnapshot().nextActions).toEqual([]);
    expect(store.getSnapshot().stale).toEqual([]);
  });

  it("supports a live refresh scope for pull-watch freshness", async () => {
    const taggedTodoRows = [["uid-b", "{{[[TODO]]}} beta #[[up]]", "Page", 1000, "up"]];
    mocks.executeQuery.mockImplementation(async (queryDef?: { query?: string }) => {
      const query = queryDef?.query ?? "";
      if (query.includes(":find ?triage-parent")) {
        return [[101]];
      }
      if (query.includes(":in $ [?tag-title ...]")) {
        return taggedTodoRows;
      }
      return [];
    });
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} alpha",
            ":block/uid": "uid-a",
            ":create/time": 2000,
          },
        ],
        ":block/page": { ":node/title": "Page" },
        ":block/string": "Triage parent",
        ":block/uid": "triage-parent-1",
      },
    ]);

    vi.useFakeTimers();

    try {
      const store = createGtdStore();
      const refreshPromise = store.refresh(TEST_SETTINGS, { scope: "live" });
      await vi.runAllTimersAsync();
      await refreshPromise;

      const executedQueries = mocks.executeQuery.mock.calls
        .map(([queryDef]) => queryDef?.query ?? "")
        .filter((query): query is string => typeof query === "string");
      expect(
        executedQueries.filter((query) => query.includes(":find ?triage-parent")),
      ).toHaveLength(1);
      expect(
        executedQueries.filter(
          (query) =>
            query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title") &&
            query.includes(":in $ [?tag-title ...]"),
        ),
      ).toHaveLength(1);
      expect(executedQueries.some((query) => query.includes('starts-with? ?ps "Project::"'))).toBe(
        false,
      );
      expect(executedQueries.some((query) => query.includes(":in $ ?cutoff ?today-log-id"))).toBe(
        false,
      );
      expect(store.getSnapshot().inbox.map((item) => item.uid)).toEqual(["uid-a"]);
      expect(store.getSnapshot().nextActions.map((item) => item.uid)).toEqual(["uid-b"]);
      expect(store.getSnapshot().projects).toEqual([]);
      expect(store.getSnapshot().stale).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("excludes DONE and ARCHIVED children from pull-based inbox", async () => {
    mocks.executeQuery.mockResolvedValue([[101]]);
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} open",
            ":block/uid": "uid-open",
            ":create/time": 1000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "DONE" }],
            ":block/string": "{{[[TODO]]}} done",
            ":block/uid": "uid-done",
            ":create/time": 2000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "ARCHIVED" }],
            ":block/string": "{{[[TODO]]}} archived",
            ":block/uid": "uid-archived",
            ":create/time": 3000,
          },
        ],
        ":block/page": { ":node/title": "Page" },
        ":block/string": "Triage parent",
        ":block/uid": "triage-parent-1",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS);

    const inboxUids = store.getSnapshot().inbox.map((item) => item.uid);
    expect(inboxUids).toEqual(["uid-open"]);
  });

  it("orders inbox items newest to oldest by create time", async () => {
    mocks.executeQuery.mockResolvedValue([[101]]);
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} old",
            ":block/uid": "uid-old",
            ":create/time": 1000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} new",
            ":block/uid": "uid-new",
            ":create/time": 5000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} mid",
            ":block/uid": "uid-mid",
            ":create/time": 3000,
          },
        ],
        ":block/page": { ":node/title": "Page" },
        ":block/string": "Triage parent",
        ":block/uid": "triage-parent-1",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS);

    const inboxUids = store.getSnapshot().inbox.map((item) => item.uid);
    expect(inboxUids).toEqual(["uid-new", "uid-mid", "uid-old"]);
  });
});

describe("store refresh scope isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pullEntities.mockReturnValue([]);
  });

  it("does not re-run inbox query when inboxOnly follows a full refresh", async () => {
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date(2026, 2, 3, 9, 0, 0, 0).getTime());
    let executeQueryCallCount = 0;
    mocks.executeQuery.mockImplementation(async () => {
      executeQueryCallCount += 1;
      return [];
    });

    try {
      const store = createGtdStore();

      // 1. Initial full refresh (inbox + workflow + backHalf).
      await store.refresh(TEST_SETTINGS);
      const callsAfterFull = executeQueryCallCount;
      // Full scope runs: inbox(1) + workflow(1) + projects(entity IDs)(1)
      // + Promise.all([stale, deferred, goals, completed, triaged, tickler scheduled page refs,
      //   tickler scheduled text])(7) = 10.
      expect(callsAfterFull).toBe(10);

      // 2. Narrow inboxOnly refresh (simulates pressing 'u' during triage).
      executeQueryCallCount = 0;
      await store.refresh(TEST_SETTINGS, { scope: "inboxOnly" });

      // Should run exactly 1 query (the inbox query), NOT re-run workflow/backHalf.
      // Before the fix, latestRefreshRequest retained the full scope from step 1,
      // causing the loop to re-queue a full refresh after the inboxOnly completed,
      // resulting in 1 + 7 = 8 queries instead of 1.
      expect(executeQueryCallCount).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("does run extra queries when a new request arrives during refresh", async () => {
    let executeQueryCallCount = 0;
    mocks.executeQuery.mockImplementation(async () => {
      executeQueryCallCount += 1;
      return [];
    });

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS);
    executeQueryCallCount = 0;

    // Start an inboxOnly refresh, but schedule a workflow refresh concurrently.
    // The workflow request arrives during the inbox refresh and should be picked up.
    const inboxPromise = store.refresh(TEST_SETTINGS, { scope: "inboxOnly" });
    store.scheduleRefresh(TEST_SETTINGS, 0, { scope: "workflow" });
    await inboxPromise;
    // Allow the scheduled timer to fire and its refresh to complete.
    await vi.waitFor(() => expect(executeQueryCallCount).toBeGreaterThanOrEqual(2));

    // Should have run inbox(1) + workflow(1) = at least 2 queries.
    expect(executeQueryCallCount).toBeGreaterThanOrEqual(2);
  });

  it("supports a projects-only refresh scope for Step 2", async () => {
    let executeQueryCallCount = 0;
    mocks.executeQuery.mockImplementation(async () => {
      executeQueryCallCount += 1;
      return [];
    });

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "projects" });

    // Projects scope runs: entity IDs query(1) only (pull_many is not an executeQuery call).
    expect(executeQueryCallCount).toBe(1);
    expect(store.getSnapshot().inbox).toEqual([]);
    expect(store.getSnapshot().projects).toEqual([]);
    expect(store.getSnapshot().stale).toEqual([]);
  });

  it("does not publish a workflow snapshot when workflow results are unchanged", async () => {
    const taggedTodoRows = [
      ["uid-up", "{{[[TODO]]}} next", "Page", 1000, TEST_SETTINGS.tagNextAction],
    ];
    mocks.executeQuery.mockImplementation(async (queryDef?: { query?: string }) => {
      const query = queryDef?.query ?? "";
      if (query.includes(":in $ [?tag-title ...]")) {
        return taggedTodoRows;
      }
      return [];
    });

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "workflow" });

    const notifications: Array<Array<string>> = [];
    const unsubscribe = store.subscribe((state) => {
      notifications.push(state.nextActions.map((item) => item.uid));
    });

    try {
      await store.refresh(TEST_SETTINGS, { scope: "workflow" });
    } finally {
      unsubscribe();
    }

    expect(notifications).toEqual([["uid-up"]]);
  });

  it("logs refresh timings when debug timings are enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const taggedTodoRows = [
      ["uid-up", "{{[[TODO]]}} next", "Page", 1000, TEST_SETTINGS.tagNextAction],
    ];
    mocks.executeQuery.mockImplementation(async (queryDef?: { query?: string }) => {
      const query = queryDef?.query ?? "";
      if (query.includes(":in $ [?tag-title ...]")) {
        return taggedTodoRows;
      }
      return [];
    });
    const globalWithTimingWindow = globalThis as unknown as {
      window?: { __ROAM_GTD_DEBUG_TIMINGS?: boolean };
    };
    const timingWindow = globalWithTimingWindow.window ?? {};
    globalWithTimingWindow.window = timingWindow;
    timingWindow.__ROAM_GTD_DEBUG_TIMINGS = true;

    try {
      const store = createGtdStore();
      await store.refresh(TEST_SETTINGS, { scope: "workflow" });
      expect(debugSpy).toHaveBeenCalledWith(
        "[RoamGTD][timing]",
        expect.objectContaining({ label: "refresh:workflow" }),
      );
      expect(debugSpy).toHaveBeenCalledWith(
        "[RoamGTD][timing]",
        expect.objectContaining({ label: "refresh:total" }),
      );
    } finally {
      delete timingWindow.__ROAM_GTD_DEBUG_TIMINGS;
      debugSpy.mockRestore();
    }
  });

  it("does not publish a projects-loading-only snapshot during projects refresh", async () => {
    mocks.executeQuery.mockResolvedValue([]);

    const store = createGtdStore();
    const notifications: Array<{
      projectsHydrated: boolean;
      projectsLoading: boolean;
    }> = [];
    const unsubscribe = store.subscribe((state) => {
      notifications.push({
        projectsHydrated: state.projectsHydrated,
        projectsLoading: state.projectsLoading,
      });
    });

    try {
      await store.refresh(TEST_SETTINGS, { scope: "projects" });
    } finally {
      unsubscribe();
    }

    expect(notifications).toEqual([
      { projectsHydrated: false, projectsLoading: false },
      { projectsHydrated: true, projectsLoading: false },
    ]);
  });

  it("collapses cold-start secondary hydration into a single publish after inbox boot", async () => {
    const taggedTodoRows: Array<[string, string, string, number, string]> = [
      ["uid-up", "{{[[TODO]]}} next action", "Workflow", 1000, TEST_SETTINGS.tagNextAction],
    ];
    const projectPullData = [
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "status-alpha" },
          {
            ":block/children": [
              {
                ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "up" }],
                ":block/string": "{{[[TODO]]}} Alpha task",
                ":block/uid": "todo-alpha",
                ":create/time": 900,
              },
            ],
            ":block/string": "Todo List::",
            ":block/uid": "todo-list-alpha",
          },
        ],
        ":block/string": "Project:: Alpha",
        ":block/uid": "project-alpha",
      },
    ];
    const inboxPullData = [
      {
        ":block/children": [
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} inbox task",
            ":block/uid": "uid-inbox",
            ":create/time": 1100,
          },
        ],
        ":block/page": { ":node/title": "Inbox" },
        ":block/string": "Triage parent",
        ":block/uid": "triage-parent-1",
      },
    ];
    let pullCallIndex = 0;
    mocks.pullEntities.mockImplementation(() => {
      pullCallIndex += 1;
      // First pull is inbox, second is projects
      return pullCallIndex === 1 ? inboxPullData : projectPullData;
    });
    mocks.executeQuery.mockImplementation(
      async (queryDef?: { inputs?: Array<unknown>; query?: string }) => {
        const query = queryDef?.query ?? "";
        if (query.includes(":find ?triage-parent")) {
          return [[201]];
        }
        if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
          return taggedTodoRows;
        }
        if (query.includes('starts-with? ?ps "Project::"')) {
          return [[101]];
        }
        return [];
      },
    );

    const store = createGtdStore();
    const notifications: Array<{
      backHalfHydrated: boolean;
      inbox: Array<string>;
      loading: boolean;
      nextActions: Array<string>;
      projects: Array<string>;
    }> = [];
    const unsubscribe = store.subscribe((state) => {
      notifications.push({
        backHalfHydrated: state.backHalfHydrated,
        inbox: state.inbox.map((item) => item.uid),
        loading: state.loading,
        nextActions: state.nextActions.map((item) => item.uid),
        projects: state.projects.map((project) => project.pageUid),
      });
    });

    try {
      await store.refresh(TEST_SETTINGS);
    } finally {
      unsubscribe();
    }

    expect(notifications).toEqual([
      {
        backHalfHydrated: false,
        inbox: [],
        loading: false,
        nextActions: [],
        projects: [],
      },
      {
        backHalfHydrated: false,
        inbox: [],
        loading: true,
        nextActions: [],
        projects: [],
      },
      {
        backHalfHydrated: false,
        inbox: ["uid-inbox"],
        loading: false,
        nextActions: [],
        projects: [],
      },
      {
        backHalfHydrated: true,
        inbox: ["uid-inbox"],
        loading: false,
        nextActions: ["uid-up"],
        projects: ["project-alpha"],
      },
    ]);
  });
});

// Helper: build a TODO block child for pull-based entity data
function todoChild(uid: string, text: string, createdTime: number, tagRefs: Array<string> = []) {
  return {
    ":block/refs": [{ ":node/title": "TODO" }, ...tagRefs.map((t) => ({ ":node/title": t }))],
    ":block/string": text,
    ":block/uid": uid,
    ":create/time": createdTime,
  };
}

describe("store project details mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pullEntities.mockReturnValue([]);
  });

  it("keeps active zero-todo projects and prefers #up TODOs under Todo List", async () => {
    // Entity IDs for the 4 projects (Gamma excluded by someday marker)
    mocks.executeQuery.mockResolvedValue([[1], [2], [3], [4]]);
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "status-alpha" },
          {
            ":block/children": [
              todoChild("todo-a1", "alpha-older", 400, ["watch"]),
              todoChild("todo-a2", "alpha-up-newest", 500, ["up"]),
              todoChild("todo-a3", "alpha-up-old", 450, ["up"]),
            ],
            ":block/string": "Todo List::",
            ":block/uid": "todo-list-alpha",
          },
        ],
        ":block/string": "Project:: Alpha Project",
        ":block/uid": "block-alpha",
      },
      {
        ":block/string": "Project:: Beta Project",
        ":block/uid": "block-beta",
      },
      {
        ":block/children": [{ ":block/string": "Status:: #POOR", ":block/uid": "status-gamma" }],
        ":block/string": "Project:: Gamma Project [[someday]]",
        ":block/uid": "block-gamma",
      },
      {
        ":block/children": [
          { ":block/string": "Status:: #LAGGING", ":block/uid": "status-delta" },
          {
            ":block/children": [todoChild("todo-d1", "delta-only", 100)],
            ":block/string": "Todo List::",
            ":block/uid": "todo-list-delta",
          },
        ],
        ":block/string": "Project:: Delta Project",
        ":block/uid": "block-delta",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "projects" });

    const projects = store.getSnapshot().projects;
    expect(projects).toHaveLength(3);
    expect(projects.map((p) => p.pageUid)).toEqual(["block-alpha", "block-beta", "block-delta"]);

    const alpha = projects.find((p) => p.pageUid === "block-alpha");
    const beta = projects.find((p) => p.pageUid === "block-beta");

    expect(alpha).toEqual({
      doneCount: 0,
      lastDoneTime: null,
      lastTodoCreatedTime: 500,
      lastTodoText: "alpha-up-newest",
      lastTodoUid: "todo-a2",
      pageTitle: "Alpha Project",
      pageUid: "block-alpha",
      statusBlockUid: "status-alpha",
      statusText: "#ON_TRACK",
      todoCount: 3,
      todoListUid: "todo-list-alpha",
      totalCount: 3,
    });
    expect(beta).toEqual({
      doneCount: 0,
      lastDoneTime: null,
      lastTodoCreatedTime: null,
      lastTodoText: null,
      lastTodoUid: null,
      pageTitle: "Beta Project",
      pageUid: "block-beta",
      statusBlockUid: null,
      statusText: null,
      todoCount: 0,
      todoListUid: null,
      totalCount: 0,
    });
  });

  it("5-tier priority waterfall: #up > #delegated > #watch > untagged > #someday", async () => {
    mocks.executeQuery.mockResolvedValue([[1], [2], [3], [4]]);
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "sa" },
          {
            ":block/children": [
              // ProjA: #up (4) beats #delegated (3)
              todoChild("a1", "delegated-task", 100, ["delegated"]),
              todoChild("a2", "up-task", 100, ["up"]),
            ],
            ":block/string": "Todo List::",
            ":block/uid": "tl-a",
          },
        ],
        ":block/string": "Project:: ProjA",
        ":block/uid": "proj-a",
      },
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "sb" },
          {
            ":block/children": [
              // ProjB: #delegated (3) beats #watch (2)
              todoChild("b1", "watch-task", 200, ["watch"]),
              todoChild("b2", "delegated-task", 200, ["delegated"]),
            ],
            ":block/string": "Todo List::",
            ":block/uid": "tl-b",
          },
        ],
        ":block/string": "Project:: ProjB",
        ":block/uid": "proj-b",
      },
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "sc" },
          {
            ":block/children": [
              // ProjC: untagged (1) beats #someday (0)
              todoChild("c1", "someday-task", 300, ["someday"]),
              todoChild("c2", "untagged-task", 300),
            ],
            ":block/string": "Todo List::",
            ":block/uid": "tl-c",
          },
        ],
        ":block/string": "Project:: ProjC",
        ":block/uid": "proj-c",
      },
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "sd" },
          {
            ":block/children": [
              // ProjD: within same priority, most recently edited wins
              todoChild("d1", "old-up", 100, ["up"]),
              todoChild("d2", "new-up", 500, ["up"]),
            ],
            ":block/string": "Todo List::",
            ":block/uid": "tl-d",
          },
        ],
        ":block/string": "Project:: ProjD",
        ":block/uid": "proj-d",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "projects" });
    const projects = store.getSnapshot().projects;

    expect(projects.find((p) => p.pageUid === "proj-a")?.lastTodoText).toBe("up-task");
    expect(projects.find((p) => p.pageUid === "proj-b")?.lastTodoText).toBe("delegated-task");
    expect(projects.find((p) => p.pageUid === "proj-c")?.lastTodoText).toBe("untagged-task");
    expect(projects.find((p) => p.pageUid === "proj-d")?.lastTodoText).toBe("new-up");
  });

  it("multi-tag todo in pull data counts as 1 todo", async () => {
    mocks.executeQuery.mockResolvedValue([[1]]);
    // In pull-based data, a single block child has both refs — no duplicate rows
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "smt" },
          {
            ":block/children": [todoChild("mt1", "dual-tag-todo", 100, ["up", "someday"])],
            ":block/string": "Todo List::",
            ":block/uid": "tl-mt",
          },
        ],
        ":block/string": "Project:: MultiTag",
        ":block/uid": "proj-mt",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "projects" });
    const projects = store.getSnapshot().projects;

    const proj = projects.find((p) => p.pageUid === "proj-mt");
    expect(proj?.lastTodoText).toBe("dual-tag-todo");
    expect(proj?.todoCount).toBe(1);
  });

  it("skips block-reference-only TODOs and picks a real todo instead", async () => {
    mocks.executeQuery.mockResolvedValue([[1]]);
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "sref" },
          {
            ":block/children": [
              todoChild("ref1", "{{[[TODO]]}} ((aBcDeFgHi))", 500),
              todoChild("ref2", "{{[[TODO]]}} Write the proposal", 400),
            ],
            ":block/string": "Todo List::",
            ":block/uid": "tl-ref",
          },
        ],
        ":block/string": "Project:: RefTest",
        ":block/uid": "proj-ref",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "projects" });
    const projects = store.getSnapshot().projects;

    const proj = projects.find((p) => p.pageUid === "proj-ref");
    expect(proj?.lastTodoText).toBe("{{[[TODO]]}} Write the proposal");
    expect(proj?.lastTodoUid).toBe("ref2");
    expect(proj?.todoCount).toBe(2);
  });

  it("falls back to null when all TODOs are block-reference-only", async () => {
    mocks.executeQuery.mockResolvedValue([[1]]);
    mocks.pullEntities.mockReturnValue([
      {
        ":block/children": [
          { ":block/string": "Status:: #ON_TRACK", ":block/uid": "sar" },
          {
            ":block/children": [todoChild("ar1", "{{[[TODO]]}} ((xYzAbCdEf))", 500)],
            ":block/string": "Todo List::",
            ":block/uid": "tl-ar",
          },
        ],
        ":block/string": "Project:: AllRefs",
        ":block/uid": "proj-allref",
      },
    ]);

    const store = createGtdStore();
    await store.refresh(TEST_SETTINGS, { scope: "projects" });
    const projects = store.getSnapshot().projects;

    const proj = projects.find((p) => p.pageUid === "proj-allref");
    expect(proj?.lastTodoUid).toBeNull();
    expect(proj?.todoCount).toBe(1);
  });
});

describe("store stale filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pullEntities.mockReturnValue([]);
  });

  it("excludes stale TODOs on future daily note pages", async () => {
    const fixedNow = new Date(2026, 0, 15, 9, 0, 0, 0).getTime();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const futureDailyNoteTitle = formatRoamDate(new Date(2026, 1, 14));
    const pastDailyNoteTitle = formatRoamDate(new Date(2026, 0, 5));
    const todayDailyNoteTitle = formatRoamDate(new Date(2026, 0, 15));
    const dateLikeNormalPageTitle = "March 10th, 2026";
    const expectedTodayLogId = toRoamLogId(new Date(2026, 0, 15));
    const expectedCutoff = fixedNow - TEST_SETTINGS.staleDays * 86_400_000;
    let staleQuerySeen = false;
    const pageLogIdByTitle = new Map<string, number>([
      [futureDailyNoteTitle, toRoamLogId(new Date(2026, 1, 14))],
      [pastDailyNoteTitle, toRoamLogId(new Date(2026, 0, 5))],
      [todayDailyNoteTitle, expectedTodayLogId],
    ]);

    mocks.executeQuery.mockImplementation(
      async (queryDef?: { inputs?: Array<unknown>; query?: string }) => {
        if (isStaleQueryDef(queryDef)) {
          staleQuerySeen = true;
          expect(queryDef?.inputs).toEqual([expectedCutoff, expectedTodayLogId]);
          const rows: Array<[string, string, string, number]> = [
            [
              "uid-future",
              "{{[[TODO]]}} eat pizza",
              futureDailyNoteTitle,
              fixedNow - 21 * 86_400_000,
            ],
            ["uid-past", "{{[[TODO]]}} ship docs", pastDailyNoteTitle, fixedNow - 21 * 86_400_000],
            [
              "uid-today",
              "{{[[TODO]]}} check today",
              todayDailyNoteTitle,
              fixedNow - 21 * 86_400_000,
            ],
            [
              "uid-date-like-normal",
              "{{[[TODO]]}} special title",
              dateLikeNormalPageTitle,
              fixedNow - 21 * 86_400_000,
            ],
            [
              "uid-normal",
              "{{[[TODO]]}} normal page item",
              "Project Notes",
              fixedNow - 21 * 86_400_000,
            ],
          ];
          return rows.filter((row) => {
            const pageLogId = pageLogIdByTitle.get(row[2]);
            return pageLogId == null || pageLogId <= expectedTodayLogId;
          });
        }
        return [];
      },
    );

    try {
      const store = createGtdStore();
      await store.refresh(TEST_SETTINGS);
      const staleUids = store.getSnapshot().stale.map((item) => item.uid);
      expect(staleUids).toEqual(["uid-past", "uid-today", "uid-date-like-normal", "uid-normal"]);
      expect(staleQuerySeen).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("recomputes todayLogId when the day changes", async () => {
    const firstNow = new Date(2026, 2, 1, 9, 0, 0, 0).getTime();
    const secondNow = new Date(2026, 2, 2, 9, 0, 0, 0).getTime();
    const nowSpy = vi.spyOn(Date, "now");
    const observedLogIds: Array<number> = [];

    mocks.executeQuery.mockImplementation(
      async (queryDef?: { inputs?: Array<unknown>; query?: string }) => {
        if (isStaleQueryDef(queryDef)) {
          const maybeLogId = queryDef?.inputs?.[1];
          if (typeof maybeLogId === "number") {
            observedLogIds.push(maybeLogId);
          }
        }
        return [];
      },
    );

    try {
      const store = createGtdStore();
      nowSpy.mockReturnValue(firstNow);
      await store.refresh(TEST_SETTINGS);
      nowSpy.mockReturnValue(secondNow);
      await store.refresh(TEST_SETTINGS);
      expect(observedLogIds).toEqual([
        toRoamLogId(new Date(2026, 2, 1)),
        toRoamLogId(new Date(2026, 2, 2)),
      ]);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("tickler group building", () => {
  it("merges scheduled page refs and scheduled parents, including non-TODO reminders, dedupes per day, and sorts newest first", () => {
    const march10 = formatRoamDate(new Date(2026, 2, 10));
    const march16 = formatRoamDate(new Date(2026, 2, 16));
    const march15 = formatRoamDate(new Date(2026, 2, 15));
    const march20 = formatRoamDate(new Date(2026, 2, 20));
    const groups = buildTicklerGroups({
      monthEndLogId: toRoamLogId(new Date(2026, 2, 31)),
      monthStartLogId: toRoamLogId(new Date(2026, 2, 1)),
      resolveDailyPageUid: (dailyLogId) => `daily-page-${dailyLogId}`,
      scheduledPageRefRows: [
        [
          "uid-shared",
          "{{[[TODO]]}} shared older",
          1000,
          march15,
          toRoamLogId(new Date(2026, 2, 15)),
        ],
        [
          "uid-linked-note",
          "Call back about contract",
          3200,
          march16,
          toRoamLogId(new Date(2026, 2, 16)),
        ],
        [
          "uid-linked-attr",
          `Due:: [[${march16}]]`,
          3300,
          march16,
          toRoamLogId(new Date(2026, 2, 16)),
        ],
      ],
      scheduledRows: [
        ["uid-scheduled", "[[TODO]] scheduled child", 4000, `Due:: [[${march20}]]`],
        ["uid-plain", "TODO plain reminder", 3500, `Reminder:: ${march10} #Home`],
        ["uid-shared", "TODO shared newer", 5000, `Due:: [[${march15}]]`],
        ["uid-non-todo", "This is a tickler reminder", 4500, `Due:: [[${march16}]]`],
        ["uid-next-month", "{{[[TODO]]}} next month", 6000, "Due:: [[April 1st, 2026]]"],
        ["uid-closed", "[[DONE]] already done", 7000, `Due:: [[${march20}]]`],
      ],
    });

    expect(groups.map((group) => group.dailyTitle)).toEqual([march20, march16, march15, march10]);
    expect(groups.map((group) => group.dailyPageUid)).toEqual([
      `daily-page-${toRoamLogId(new Date(2026, 2, 20))}`,
      `daily-page-${toRoamLogId(new Date(2026, 2, 16))}`,
      `daily-page-${toRoamLogId(new Date(2026, 2, 15))}`,
      `daily-page-${toRoamLogId(new Date(2026, 2, 10))}`,
    ]);
    expect(
      groups.find((group) => group.dailyTitle === march20)?.items.map((item) => item.uid),
    ).toEqual(["uid-scheduled"]);
    expect(groups.find((group) => group.dailyTitle === march16)?.items).toEqual([
      {
        ageDays: 0,
        createdTime: 4500,
        deferredDate: null,
        pageTitle: march16,
        text: "This is a tickler reminder",
        uid: "uid-non-todo",
      },
      {
        ageDays: 0,
        createdTime: 3200,
        deferredDate: null,
        pageTitle: march16,
        text: "Call back about contract",
        uid: "uid-linked-note",
      },
    ]);
    expect(groups.find((group) => group.dailyTitle === march15)?.items).toEqual([
      {
        ageDays: 0,
        createdTime: 5000,
        deferredDate: null,
        pageTitle: march15,
        text: "TODO shared newer",
        uid: "uid-shared",
      },
    ]);
    expect(
      groups.find((group) => group.dailyTitle === march10)?.items.map((item) => item.uid),
    ).toEqual(["uid-plain"]);
  });
});
