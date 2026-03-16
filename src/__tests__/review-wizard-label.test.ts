import { describe, expect, it, vi } from "vitest";

import {
  getWeeklyReviewNativeBlockRenderInput,
  shouldRefreshAttributeSelectForMutations,
} from "../components/WeeklyReviewNativeBlock";
import {
  getDismissedProjectUidsAfterDismiss,
  getMountedProjectPageUids,
  getNextProjectKeyboardControl,
  getNextStatusMenuIndex,
  getProjectPagePreviewSource,
  getProjectTitlePageRefParts,
  getProjectTodoCurrentTag,
  getProjectTodoHotkeyAction,
  getProjectsReviewCounterPosition,
  getProjectsReviewState,
  getProjectsReviewVisibleRowCount,
  getStatusBadgeSelectState,
  getTopProjectKeyboardAction,
  shouldAutoExpandProjectsReviewRows,
  parseProjectTitlePreviewText,
  persistProjectStatusChange,
} from "../projects-step/support";
import { reconcileOptimisticProjectTodos } from "../review/wizard-runtime";
import {
  applyOptimisticProjectTodo,
  dropOptimisticProjectTodoByUid,
  getItemsForStep,
  getProjectsDetailChromeState,
  getProjectsStepForwardState,
  getProjectsDetailDialogTitle,
  getReviewProgressValue,
  getPrimaryForwardLabelKey,
  getSteps,
  shouldRefreshProjectsAfterDismiss,
  shouldPrefetchWorkflowForStep,
  shouldRefreshBackHalfForStep,
  shouldRefreshProjectsForStep,
  shouldPrefetchProjectsFromInbox,
  shouldShowStepFastForwardButton,
  shouldShowTicklerStep,
  shouldShowInboxZeroLoading,
} from "../review/wizard-support";
import type { GtdSettings } from "../settings";
import type { ProjectSummary, TodoItem } from "../types";

const makeProject = (pageUid: string): ProjectSummary => ({
  doneCount: 0,
  lastDoneTime: null,
  lastTodoCreatedTime: null,
  lastTodoText: null,
  lastTodoUid: null,
  pageTitle: pageUid,
  pageUid,
  statusBlockUid: null,
  statusText: null,
  todoCount: 0,
  todoListUid: null,
  totalCount: 0,
});

const makeTodo = (uid: string, ageDays: number): TodoItem => ({
  ageDays,
  createdTime: ageDays,
  deferredDate: null,
  pageTitle: `Page ${uid}`,
  text: `Task ${uid}`,
  uid,
});

const makeReviewState = (
  overrides: Partial<Parameters<typeof getItemsForStep>[0]> = {},
): Parameters<typeof getItemsForStep>[0] => ({
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
  ...overrides,
});

const projectHotkeySettings = {
  tagDelegated: "delegated",
  tagNextAction: "up",
  tagSomeday: "someday",
  tagWaitingFor: "watch",
} as GtdSettings;

describe("review wizard footer labels", () => {
  it("uses the Step 1 label key on inbox even when using the primary forward branch", () => {
    expect(getPrimaryForwardLabelKey("inbox", false)).toBe("nextItem");
  });

  it("uses nextStep on non-inbox steps", () => {
    expect(getPrimaryForwardLabelKey("upcoming", false)).toBe("nextStep");
    expect(getPrimaryForwardLabelKey("projects", false)).toBe("nextStep");
  });

  it("uses finish on the last step", () => {
    expect(getPrimaryForwardLabelKey("stats", true)).toBe("finish");
  });

  it("switches the Step 2 footer chrome off in project detail mode", () => {
    expect(getProjectsDetailChromeState(true)).toEqual({
      backAction: "closeDetail",
      showPrimaryForward: false,
      showProjectHotkeys: false,
      showStepFastForward: false,
    });
    expect(getProjectsDetailChromeState(false)).toEqual({
      backAction: "wizard",
      showPrimaryForward: true,
      showProjectHotkeys: true,
      showStepFastForward: true,
    });
  });

  it("shows the step fast-forward icon only when the step can still advance", () => {
    expect(shouldShowStepFastForwardButton(false, true)).toBe(true);
    expect(shouldShowStepFastForwardButton(true, true)).toBe(false);
    expect(shouldShowStepFastForwardButton(false, false)).toBe(false);
  });

  it("keeps the Step 2 primary button black until all projects are reviewed", () => {
    expect(getProjectsStepForwardState({ isDetailOpen: false, remainingProjects: 24 })).toEqual({
      action: "reviewTopProject",
      intent: "default",
      labelKey: "next",
    });
    expect(getProjectsStepForwardState({ isDetailOpen: false, remainingProjects: 0 })).toEqual({
      action: "advanceStep",
      intent: "primary",
      labelKey: "nextStep",
    });
    expect(getProjectsStepForwardState({ isDetailOpen: true, remainingProjects: 5 })).toEqual({
      action: "hidden",
      intent: "default",
      labelKey: "next",
    });
  });

  it("adds the active project title to the dialog header in detail mode", () => {
    expect(getProjectsDetailDialogTitle("Projects", "Project:: Sleep API")).toBe(
      "Project: Sleep API",
    );
    expect(getProjectsDetailDialogTitle("Projects", "Project:: [[Eight Sleep API]]")).toBe(
      "Project: Eight Sleep API",
    );
    expect(
      getProjectsDetailDialogTitle(
        "Projects",
        "Project:: [[2021]] [[work/Expenses]] from [[ExampleCorp]]",
      ),
    ).toBe("Project: 2021 Expenses from ExampleCorp");
    expect(getProjectsDetailDialogTitle("Projects", null)).toBe("Projects");
  });
});

describe("weekly review native block render config", () => {
  it("forces project detail blocks open when requested", () => {
    const el = {} as HTMLElement;

    expect(getWeeklyReviewNativeBlockRenderInput({ el, open: true, uid: "project-uid" })).toEqual({
      el,
      open: true,
      "open?": true,
      uid: "project-uid",
      "zoom-path?": false,
      zoomPath: false,
    });
  });

  it("can force native blocks closed when requested", () => {
    const el = {} as HTMLElement;

    expect(getWeeklyReviewNativeBlockRenderInput({ el, open: false, uid: "project-uid" })).toEqual({
      el,
      open: false,
      "open?": false,
      uid: "project-uid",
      "zoom-path?": false,
      zoomPath: false,
    });
  });

  it("leaves block open state untouched when no override is passed", () => {
    const el = {} as HTMLElement;
    const input = getWeeklyReviewNativeBlockRenderInput({ el, uid: "project-uid" });

    expect(input).toEqual({
      el,
      uid: "project-uid",
      "zoom-path?": false,
      zoomPath: false,
    });
    expect("open" in input).toBe(false);
    expect("open?" in input).toBe(false);
  });

  it("refreshes attribute-select when attribute refs are added or redrawn", () => {
    const attrRef = {
      matches: (selector: string) => selector === "span.rm-attr-ref",
      nodeType: 1,
      querySelector: () => null,
    } as unknown as Element;
    const wrappedAttrRef = {
      matches: () => false,
      nodeType: 1,
      querySelector: (selector: string) => (selector === "span.rm-attr-ref" ? attrRef : null),
    } as unknown as Element;
    const plainTarget = {
      matches: () => false,
      nodeType: 1,
      querySelector: () => null,
    } as unknown as Element;
    const plainNode = {
      nodeType: 1,
    } as Node;

    expect(
      shouldRefreshAttributeSelectForMutations([
        {
          addedNodes: [wrappedAttrRef] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: plainTarget,
        },
      ]),
    ).toBe(true);

    expect(
      shouldRefreshAttributeSelectForMutations([
        {
          addedNodes: [] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: attrRef,
        },
      ]),
    ).toBe(true);

    expect(
      shouldRefreshAttributeSelectForMutations([
        {
          addedNodes: [plainNode] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: plainTarget,
        },
      ]),
    ).toBe(false);
  });
});

describe("weekly review project title preview", () => {
  it("keeps project title refs intact for lightweight preview rendering", () => {
    expect(
      getProjectPagePreviewSource({
        pageTitle: "Project:: [[2021]] [[work/Expenses]] from [[ExampleCorp]]",
      }),
    ).toBe("[[2021]] [[work/Expenses]] from [[ExampleCorp]]");
  });

  it("splits namespaced page refs into namespace and title segments", () => {
    expect(getProjectTitlePageRefParts("Acme/Hello")).toEqual({
      namespace: "Acme",
      title: "Hello",
    });
    expect(getProjectTitlePageRefParts("ExampleCorp")).toEqual({
      namespace: null,
      title: "ExampleCorp",
    });
  });

  it("parses page refs and hashtags for display-only title formatting", () => {
    expect(
      parseProjectTitlePreviewText(
        "[[2021]] [[work/Expenses]] from [[ExampleCorp]] #up",
      ),
    ).toEqual([
      { text: "2021", type: "pageRef" },
      { text: " ", type: "text" },
      { text: "work/Expenses", type: "pageRef" },
      { text: " from ", type: "text" },
      { text: "ExampleCorp", type: "pageRef" },
      { text: " ", type: "text" },
      { text: "up", type: "tagRef" },
    ]);
  });
});

describe("review wizard inbox triage loading gate", () => {
  it("builds the daily-review step list from the support module", () => {
    expect(getSteps((key) => key, "daily")).toEqual([
      {
        description: "step1Desc",
        key: "inbox",
        title: "dailyReviewTitle",
      },
    ]);
  });

  it("routes step items through the shared selector helpers", () => {
    const state = makeReviewState({
      delegated: [makeTodo("delegated", 2)],
      inbox: [makeTodo("inbox", 1)],
      nextActions: [makeTodo("oldest", 1), makeTodo("newest", 5)],
      someday: [makeTodo("someday", 3)],
      waitingFor: [makeTodo("waiting", 4)],
    });

    expect(getItemsForStep(state, "inbox").map((item) => item.uid)).toEqual(["inbox"]);
    expect(getItemsForStep(state, "upcoming").map((item) => item.uid)).toEqual([
      "newest",
      "oldest",
    ]);
    expect(getItemsForStep(state, "waitingDelegated").map((item) => item.uid)).toEqual([
      "delegated",
      "waiting",
    ]);
    expect(getItemsForStep(state, "projects")).toEqual([]);
  });

  it("shows loading only while bootstrapping and inbox is empty", () => {
    expect(shouldShowInboxZeroLoading(true, 0)).toBe(true);
    expect(shouldShowInboxZeroLoading(true, 3)).toBe(false);
    expect(shouldShowInboxZeroLoading(false, 0)).toBe(false);
  });

  it("prefetches projects once only one inbox item remains", () => {
    expect(shouldPrefetchProjectsFromInbox(true, 0, 1)).toBe(false);
    expect(shouldPrefetchProjectsFromInbox(false, 0, 0)).toBe(false);
    expect(shouldPrefetchProjectsFromInbox(false, 0, 3)).toBe(false);
    expect(shouldPrefetchProjectsFromInbox(false, 1, 3)).toBe(true);
    expect(shouldPrefetchProjectsFromInbox(false, 2, 3)).toBe(true);
    expect(shouldPrefetchProjectsFromInbox(false, 0, 1)).toBe(true);
  });

  it("prefetches workflow before and during the workflow review steps", () => {
    expect(shouldPrefetchWorkflowForStep("projects", 0, 10)).toBe(true);
    expect(shouldPrefetchWorkflowForStep("upcoming", 0, 10)).toBe(true);
    expect(shouldPrefetchWorkflowForStep("waitingDelegated", 0, 10)).toBe(true);
    expect(shouldPrefetchWorkflowForStep("inbox", 0, 10)).toBe(false);
    expect(shouldPrefetchWorkflowForStep("inbox", 8, 10)).toBe(true);
  });

  it("shows tickler during the first 7 days of the month", () => {
    expect(shouldShowTicklerStep(new Date(2026, 2, 1))).toBe(true);
    expect(shouldShowTicklerStep(new Date(2026, 2, 7))).toBe(true);
    expect(shouldShowTicklerStep(new Date(2026, 2, 8))).toBe(false);
  });

  it("skips projects refresh when the projects slice was loaded recently", () => {
    const now = 100_000;
    expect(shouldRefreshProjectsForStep("projects", false, null, now)).toBe(true);
    expect(shouldRefreshProjectsForStep("projects", true, null, now)).toBe(true);
    expect(shouldRefreshProjectsForStep("projects", true, now - 5000, now)).toBe(false);
    expect(shouldRefreshProjectsForStep("projects", true, now - 40_000, now)).toBe(true);
    expect(shouldRefreshProjectsForStep("inbox", true, now - 40_000, now)).toBe(false);
  });

  it("skips back-half refresh when tickler data was loaded recently", () => {
    const now = 100_000;
    expect(shouldRefreshBackHalfForStep("upcoming", false, null, now)).toBe(true);
    expect(shouldRefreshBackHalfForStep("tickler", false, null, now)).toBe(true);
    expect(shouldRefreshBackHalfForStep("waitingDelegated", false, null, now)).toBe(false);
    expect(shouldRefreshBackHalfForStep("tickler", true, null, now)).toBe(true);
    expect(shouldRefreshBackHalfForStep("tickler", true, now - 5000, now)).toBe(false);
    expect(shouldRefreshBackHalfForStep("tickler", true, now - 40_000, now)).toBe(true);
    expect(shouldRefreshBackHalfForStep("inbox", true, now - 40_000, now)).toBe(false);
  });
});

describe("review wizard progress meter", () => {
  it("starts at zero on the first step regardless of item counts", () => {
    expect(
      getReviewProgressValue({
        inboxCurrent: 24,
        inboxTotal: 354,
        projectsReviewed: 0,
        projectsTotal: 0,
        stepCount: 8,
        stepIndex: 0,
        stepKey: "inbox",
      }),
    ).toBe(0);
  });

  it("advances by step position instead of project query progress", () => {
    expect(
      getReviewProgressValue({
        inboxCurrent: 0,
        inboxTotal: 0,
        projectsReviewed: 10,
        projectsTotal: 36,
        stepCount: 8,
        stepIndex: 1,
        stepKey: "projects",
      }),
    ).toBeCloseTo(1 / 7);
  });

  it("keeps the same step position before projects load", () => {
    expect(
      getReviewProgressValue({
        inboxCurrent: 0,
        inboxTotal: 0,
        projectsReviewed: 0,
        projectsTotal: 36,
        stepCount: 8,
        stepIndex: 1,
        stepKey: "projects",
      }),
    ).toBeCloseTo(1 / 7);
  });

  it("does not depend on project review completion once Step 2 is active", () => {
    expect(
      getReviewProgressValue({
        inboxCurrent: 0,
        inboxTotal: 0,
        projectsReviewed: 36,
        projectsTotal: 36,
        stepCount: 8,
        stepIndex: 1,
        stepKey: "projects",
      }),
    ).toBeCloseTo(1 / 7);
  });

  it("uses step navigation progress for later steps", () => {
    expect(
      getReviewProgressValue({
        inboxCurrent: 0,
        inboxTotal: 0,
        projectsReviewed: 0,
        projectsTotal: 0,
        stepCount: 8,
        stepIndex: 3,
        stepKey: "waitingDelegated",
      }),
    ).toBeCloseTo(3 / 7);
  });

  it("tracks inbox item progress in daily review (single step)", () => {
    const base = {
      projectsReviewed: 0,
      projectsTotal: 0,
      stepCount: 1,
      stepIndex: 0,
      stepKey: "inbox" as const,
    };
    expect(getReviewProgressValue({ ...base, inboxCurrent: 0, inboxTotal: 10 })).toBe(0);
    expect(getReviewProgressValue({ ...base, inboxCurrent: 3, inboxTotal: 10 })).toBeCloseTo(0.3);
    expect(getReviewProgressValue({ ...base, inboxCurrent: 10, inboxTotal: 10 })).toBe(1);
  });

  it("returns zero for daily review when inbox is empty", () => {
    expect(
      getReviewProgressValue({
        inboxCurrent: 0,
        inboxTotal: 0,
        projectsReviewed: 0,
        projectsTotal: 0,
        stepCount: 1,
        stepIndex: 0,
        stepKey: "inbox",
      }),
    ).toBe(0);
  });
});

describe("review wizard projects status select", () => {
  it("renders the empty label for blank status without exposing it as a selectable option", () => {
    const state = getStatusBadgeSelectState({
      options: ["On track", "Blocked"],
      status: "   ",
      unknownLabel: "NONE",
    });

    expect(state.badgeLabel).toBe("NONE");
    expect(state.selectValue).toBe("");
    expect(state.selectOptions).toEqual([
      { label: "On track", value: "On track" },
      { label: "Blocked", value: "Blocked" },
    ]);
  });

  it("wraps status menu keyboard movement in both directions", () => {
    expect(getNextStatusMenuIndex(0, 3, "forward")).toBe(1);
    expect(getNextStatusMenuIndex(2, 3, "forward")).toBe(0);
    expect(getNextStatusMenuIndex(0, 3, "backward")).toBe(2);
    expect(getNextStatusMenuIndex(-1, 3, "backward")).toBe(2);
  });
});

describe("review wizard projects status persistence", () => {
  it("composes Status:: value and schedules projects refresh", async () => {
    const createBlock = vi.fn().mockResolvedValue(undefined);
    const updateBlock = vi.fn().mockResolvedValue(undefined);
    const scheduleRefresh = vi.fn();

    const result = await persistProjectStatusChange({
      createBlock,
      newStatus: "  blocked  ",
      pageUid: "project-uid",
      refreshDelayMs: 800,
      scheduleRefresh,
      statusBlockUid: "status-uid",
      updateBlock,
    });

    expect(result).toBe(true);
    expect(updateBlock).toHaveBeenCalledWith({
      block: {
        string: "Status:: blocked",
        uid: "status-uid",
      },
    });
    expect(createBlock).not.toHaveBeenCalled();
    expect(scheduleRefresh).toHaveBeenCalledWith(800, { scope: "projects" });
  });

  it("creates a missing Status:: block when selecting a value for a blank project", async () => {
    const createBlock = vi.fn().mockResolvedValue(undefined);
    const updateBlock = vi.fn().mockResolvedValue(undefined);
    const scheduleRefresh = vi.fn();
    const globalWithRoam = globalThis as typeof globalThis & {
      roamAlphaAPI?: { util?: { generateUID?: () => string } };
    };
    const previousRoamAlphaAPI = globalWithRoam.roamAlphaAPI;
    globalWithRoam.roamAlphaAPI = {
      ...globalWithRoam.roamAlphaAPI,
      util: {
        ...(globalWithRoam.roamAlphaAPI?.util ?? {}),
        generateUID: () => "generated-status-uid",
      },
    };

    try {
      const result = await persistProjectStatusChange({
        createBlock,
        newStatus: "#ON_TRACK",
        pageUid: "project-uid",
        refreshDelayMs: 800,
        scheduleRefresh,
        statusBlockUid: null,
        updateBlock,
      });

      expect(result).toBe(true);
      expect(updateBlock).not.toHaveBeenCalled();
      expect(createBlock).toHaveBeenCalledWith({
        block: expect.objectContaining({
          string: "Status:: #ON_TRACK",
          uid: "generated-status-uid",
        }),
        location: { order: "last", "parent-uid": "project-uid" },
      });
    } finally {
      globalWithRoam.roamAlphaAPI = previousRoamAlphaAPI;
    }
  });
});

describe("review wizard projects reviewed counter", () => {
  it("reaches all-reviewed when dismissing down to zero visible projects", () => {
    const projects = [makeProject("alpha"), makeProject("beta")];

    let dismissed = new Set<string>();
    let state = getProjectsReviewState(projects, dismissed);
    expect(state.reviewedCount).toBe(0);
    expect(state.visibleProjects).toHaveLength(2);
    expect(state.allDismissed).toBe(false);

    dismissed = getDismissedProjectUidsAfterDismiss(dismissed, "alpha");
    state = getProjectsReviewState(projects, dismissed);
    expect(state.reviewedCount).toBe(1);
    expect(state.visibleProjects).toHaveLength(1);
    expect(state.allDismissed).toBe(false);

    dismissed = getDismissedProjectUidsAfterDismiss(dismissed, "beta");
    state = getProjectsReviewState(projects, dismissed);
    expect(state.reviewedCount).toBe(2);
    expect(state.visibleProjects).toHaveLength(0);
    expect(state.allDismissed).toBe(true);
  });
});

describe("review wizard Step 2 keyboard flow", () => {
  it("cycles between the top project status and dismiss controls", () => {
    expect(getNextProjectKeyboardControl(null, "forward")).toBe("status");
    expect(getNextProjectKeyboardControl(null, "backward")).toBe("dismiss");
    expect(getNextProjectKeyboardControl("status", "forward")).toBe("dismiss");
    expect(getNextProjectKeyboardControl("dismiss", "forward")).toBe("status");
    expect(getNextProjectKeyboardControl("status", "backward")).toBe("dismiss");
  });

  it("targets the top project for cmd+enter", () => {
    expect(getTopProjectKeyboardAction([])).toBeNull();
    expect(getTopProjectKeyboardAction([makeProject("alpha")])).toEqual({
      projectUid: "alpha",
      type: "createTodo",
    });
    expect(
      getTopProjectKeyboardAction([
        {
          ...makeProject("alpha"),
          lastTodoUid: "todo-1",
        },
        {
          ...makeProject("beta"),
          lastTodoUid: "todo-2",
        },
      ]),
    ).toEqual({
      todoUid: "todo-1",
      type: "focusTodo",
    });
  });

  it("detects the current project todo workflow tag", () => {
    expect(getProjectTodoCurrentTag("{{[[TODO]]}} ship it #[[up]]", projectHotkeySettings)).toBe(
      "up",
    );
    expect(
      getProjectTodoCurrentTag("{{[[TODO]]}} waiting on reply #[[watch]]", projectHotkeySettings),
    ).toBe("watch");
    expect(
      getProjectTodoCurrentTag(
        "{{[[TODO]]}} ask [[Jane Cooper]] #[[delegated]]",
        projectHotkeySettings,
      ),
    ).toBe("delegated");
    expect(
      getProjectTodoCurrentTag("{{[[TODO]]}} maybe later #[[someday]]", projectHotkeySettings),
    ).toBe("someday");
    expect(getProjectTodoCurrentTag("{{[[TODO]]}} just text", projectHotkeySettings)).toBe("");
  });

  it("maps Step 2 todo hotkeys without exposing a project binding", () => {
    const bindings = {
      delegate: "d",
      reference: "r",
      someday: "s",
      up: "u",
      watch: "w",
    };

    expect(getProjectTodoHotkeyAction("u", bindings)).toBe("up");
    expect(getProjectTodoHotkeyAction("w", bindings)).toBe("watch");
    expect(getProjectTodoHotkeyAction("d", bindings)).toBe("delegate");
    expect(getProjectTodoHotkeyAction("s", bindings)).toBe("someday");
    expect(getProjectTodoHotkeyAction("r", bindings)).toBe("reference");
    expect(getProjectTodoHotkeyAction("p", bindings)).toBeNull();
  });

  it("shows the current project position like Step 1 instead of the reviewed count", () => {
    expect(getProjectsReviewCounterPosition(0, 28)).toBe(1);
    expect(getProjectsReviewCounterPosition(1, 28)).toBe(2);
    expect(getProjectsReviewCounterPosition(27, 28)).toBe(28);
    expect(getProjectsReviewCounterPosition(0, 0)).toBe(0);
  });

  it("mounts every visible project row", () => {
    const visibleProjects = Array.from({ length: 6 }, (_, index) =>
      makeProject(`project-${index + 1}`),
    );

    expect([...getMountedProjectPageUids({ visibleProjects })]).toEqual([
      "project-1",
      "project-2",
      "project-3",
      "project-4",
      "project-5",
      "project-6",
    ]);
  });

  it("keeps every remaining visible row mounted after a project is dismissed", () => {
    const visibleProjects = Array.from({ length: 6 }, (_, index) =>
      makeProject(`project-${index + 1}`),
    );

    expect([...getMountedProjectPageUids({ visibleProjects: visibleProjects.slice(1) })]).toEqual([
      "project-2",
      "project-3",
      "project-4",
      "project-5",
      "project-6",
    ]);
  });

  it("grows the visible project window without exceeding the total rows", () => {
    expect(getProjectsReviewVisibleRowCount(12, 44, 8)).toBe(20);
    expect(getProjectsReviewVisibleRowCount(40, 44, 8)).toBe(44);
    expect(getProjectsReviewVisibleRowCount(0, 0, 8)).toBe(0);
  });

  it("auto-expands projects only when the rendered slice still fits in the viewport", () => {
    expect(
      shouldAutoExpandProjectsReviewRows({
        clientHeight: 720,
        renderedProjectCount: 12,
        scrollHeight: 680,
        scrollThresholdPx: 240,
        totalVisibleProjects: 44,
      }),
    ).toBe(true);
    expect(
      shouldAutoExpandProjectsReviewRows({
        clientHeight: 720,
        renderedProjectCount: 36,
        scrollHeight: 1200,
        scrollThresholdPx: 240,
        totalVisibleProjects: 44,
      }),
    ).toBe(false);
    expect(
      shouldAutoExpandProjectsReviewRows({
        clientHeight: 0,
        renderedProjectCount: 12,
        scrollHeight: 680,
        scrollThresholdPx: 240,
        totalVisibleProjects: 44,
      }),
    ).toBe(false);
  });
});

describe("review wizard optimistic project todo insertion", () => {
  it("applies a local todo immediately without waiting for store refresh", () => {
    const project = makeProject("alpha");
    const next = applyOptimisticProjectTodo(project, "todo-1", 1234);

    expect(next).toEqual({
      ...project,
      lastTodoCreatedTime: 1234,
      lastTodoText: "{{[[TODO]]}} ",
      lastTodoUid: "todo-1",
      todoCount: 1,
      todoListUid: null,
      totalCount: 1,
    });
  });

  it("keeps the optimistic todo while the store is still stale and the block exists", () => {
    const project = makeProject("alpha");
    const optimisticProject = applyOptimisticProjectTodo(project, "todo-1", 1234);

    const result = reconcileOptimisticProjectTodos({
      blockExistsFn: () => true,
      focusRequestUid: "todo-1",
      optimisticProjectTodos: { alpha: optimisticProject },
      projects: [project],
    });

    expect(result.changed).toBe(false);
    expect(result.nextFocusRequestUid).toBe("todo-1");
    expect(result.nextOptimisticProjectTodos).toEqual({ alpha: optimisticProject });
  });

  it("drops the optimistic todo once the store catches up", () => {
    const project = makeProject("alpha");
    const optimisticProject = applyOptimisticProjectTodo(project, "todo-1", 1234);
    const refreshedProject = {
      ...project,
      lastTodoCreatedTime: 1234,
      lastTodoText: "{{[[TODO]]}} follow up",
      lastTodoUid: "todo-1",
      todoCount: 1,
    };

    const result = reconcileOptimisticProjectTodos({
      blockExistsFn: () => true,
      focusRequestUid: "todo-1",
      optimisticProjectTodos: { alpha: optimisticProject },
      projects: [refreshedProject],
    });

    expect(result.changed).toBe(true);
    expect(result.nextFocusRequestUid).toBeNull();
    expect(result.nextOptimisticProjectTodos).toEqual({});
  });

  it("keeps optimistic edits for an existing todo until the store text catches up", () => {
    const project = makeProject("alpha");
    const optimisticProject = {
      ...project,
      lastTodoCreatedTime: 5678,
      lastTodoText: "{{[[TODO]]}} follow up #[[watch]]",
      lastTodoUid: "todo-1",
    };

    const staleResult = reconcileOptimisticProjectTodos({
      blockExistsFn: () => true,
      focusRequestUid: "todo-1",
      optimisticProjectTodos: { alpha: optimisticProject },
      projects: [project],
    });

    expect(staleResult.changed).toBe(false);
    expect(staleResult.nextFocusRequestUid).toBe("todo-1");
    expect(staleResult.nextOptimisticProjectTodos).toEqual({ alpha: optimisticProject });

    const refreshedProject = {
      ...project,
      lastTodoText: "{{[[TODO]]}} follow up #[[watch]]",
      lastTodoUid: "todo-1",
    };
    const syncedResult = reconcileOptimisticProjectTodos({
      blockExistsFn: () => true,
      focusRequestUid: "todo-1",
      optimisticProjectTodos: { alpha: optimisticProject },
      projects: [refreshedProject],
    });

    expect(syncedResult.changed).toBe(true);
    expect(syncedResult.nextFocusRequestUid).toBeNull();
    expect(syncedResult.nextOptimisticProjectTodos).toEqual({});
  });

  it("drops a deleted optimistic todo before the refresh lands", () => {
    const project = makeProject("alpha");
    const optimisticProject = applyOptimisticProjectTodo(project, "todo-1", 1234);

    const result = reconcileOptimisticProjectTodos({
      blockExistsFn: () => false,
      focusRequestUid: "todo-1",
      optimisticProjectTodos: { alpha: optimisticProject },
      projects: [project],
    });

    expect(result.changed).toBe(true);
    expect(result.nextFocusRequestUid).toBeNull();
    expect(result.nextOptimisticProjectTodos).toEqual({});
  });

  it("drops a deleted optimistic todo directly from its uid", () => {
    const alpha = applyOptimisticProjectTodo(makeProject("alpha"), "todo-1", 1234);
    const beta = applyOptimisticProjectTodo(makeProject("beta"), "todo-2", 5678);

    const result = dropOptimisticProjectTodoByUid({ alpha, beta }, "todo-1");

    expect(result.changed).toBe(true);
    expect(result.nextOptimisticProjectTodos).toEqual({ beta });
  });

  it("refreshes projects only when dismissing a project with optimistic local edits", () => {
    const alpha = applyOptimisticProjectTodo(makeProject("alpha"), "todo-1", 1234);

    expect(shouldRefreshProjectsAfterDismiss({ alpha }, "alpha")).toBe(true);
    expect(shouldRefreshProjectsAfterDismiss({ alpha }, "beta")).toBe(false);
    expect(shouldRefreshProjectsAfterDismiss({}, "alpha")).toBe(false);
  });
});
