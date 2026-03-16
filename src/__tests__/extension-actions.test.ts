import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  formatRoamDate: vi.fn(() => "February 26th, 2026"),
  rebuildPlansPriorities: vi.fn(() => Promise.resolve()),
  renderOverlay: vi.fn(),
  settings: {
    dailyPlanParent: "[[Plans, Priorities]]",
    dailyReviewNotify: true,
    dailyReviewStaleDays: 2,
    delegateTargetTags: ["people", "agents"],
    hotkeyDelegate: "d",
    hotkeyDone: "e",
    hotkeyProject: "p",
    hotkeySomeday: "s",
    hotkeyWatch: "w",
    locale: "en",
    reviewItemMode: "list",
    showTooltips: true,
    staleDays: 14,
    tagDelegated: "delegated",
    tagNextAction: "up",
    tagSomeday: "someday",
    tagWaitingFor: "watch",
    topGoalAttr: "Top Goal",
    triggerListPage: "Trigger List",
    weeklyReviewDay: 0,
    weeklyReviewNotify: true,
    weeklyReviewTime: "09:00",
  },
  spawnNextActionsIntoPage: vi.fn(() =>
    Promise.resolve({
      groupCount: 0,
      itemCount: 3,
      pageTitle: "February 26th, 2026",
      parentUid: "parent-uid",
    }),
  ),
  spawnNextActionsIntoToday: vi.fn(() =>
    Promise.resolve({
      groupCount: 0,
      itemCount: 2,
      pageTitle: "February 25th, 2026",
      parentUid: "parent-uid",
    }),
  ),
}));

vi.mock("roamjs-components/util/renderOverlay", () => ({
  default: mocks.renderOverlay,
}));

vi.mock("../components/Dashboard", () => ({
  Dashboard: { displayName: "DashboardMock" },
}));

vi.mock("../components/NextActionsModal", () => ({
  NextActionsModal: { displayName: "NextActionsModalMock" },
}));

vi.mock("../planning/daily-note-next-actions", () => ({
  spawnNextActionsIntoPage: mocks.spawnNextActionsIntoPage,
  spawnNextActionsIntoToday: mocks.spawnNextActionsIntoToday,
}));

vi.mock("../date-utils", () => ({
  formatRoamDate: mocks.formatRoamDate,
}));

vi.mock("../planning/plans-priorities", () => ({
  rebuildPlansPriorities: mocks.rebuildPlansPriorities,
}));

vi.mock("../settings", async () => {
  const actual = await vi.importActual("../settings");
  return {
    ...actual,
    getSettings: vi.fn(() => mocks.settings),
  };
});

import { createExtensionActions, resetExtensionActionToaster } from "../extension/actions";

function createStore() {
  return {
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => ({
      backHalfHydrated: false,
      backHalfLoadedAt: null,
      completedThisWeek: [],
      deferred: [],
      delegated: [],
      inbox: [{ uid: "cached-uid" }],
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
    })),
    refresh: vi.fn(() => Promise.resolve()),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

function createRuntime() {
  return {
    dispose: vi.fn(),
    getCachedSettings: vi.fn(() => mocks.settings),
    getCachedTranslator: vi.fn(() => (key: string) => key),
    notifyGtdOverlayClosed: vi.fn(),
    notifyGtdOverlayOpened: vi.fn(),
    notifyReviewModalClosed: vi.fn(),
    notifyReviewModalOpened: vi.fn(),
    scheduleCachedSettingsRefresh: vi.fn(),
    start: vi.fn(),
  };
}

describe("extension actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExtensionActionToaster();
    vi.stubGlobal("window", {
      Blueprint: {
        Core: {
          OverlayToaster: {
            create: () => ({ show: vi.fn() }),
          },
          Position: { TOP: "top" },
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the weekly review without directly refreshing inbox data in extension actions", () => {
    const runtime = createRuntime();
    const store = createStore();
    const reviewOverlay = {
      dispose: vi.fn(),
      open: vi.fn(),
      scheduleMount: vi.fn(),
    };
    const actions = createExtensionActions({
      api: {} as never,
      reviewOverlay: reviewOverlay as never,
      runtime: runtime as never,
      store: store as never,
    });

    actions.openWeeklyReview();

    expect(runtime.notifyGtdOverlayOpened).toHaveBeenCalledTimes(1);
    expect(runtime.notifyReviewModalOpened).toHaveBeenCalledTimes(1);
    expect(reviewOverlay.open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "weekly",
      }),
    );
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it("opens the dashboard through renderOverlay and wires the weekly review action into it", () => {
    const runtime = createRuntime();
    const store = createStore();
    const reviewOverlay = {
      dispose: vi.fn(),
      open: vi.fn(),
      scheduleMount: vi.fn(),
    };
    const actions = createExtensionActions({
      api: {} as never,
      reviewOverlay: reviewOverlay as never,
      runtime: runtime as never,
      store: store as never,
    });

    actions.openDashboard();

    expect(mocks.renderOverlay).toHaveBeenCalledTimes(1);
    expect(store.scheduleRefresh).toHaveBeenCalledWith(mocks.settings, 0);
    const overlayArg = mocks.renderOverlay.mock.calls[0]?.[0] as {
      props: { onOpenReview: () => void };
    };
    overlayArg.props.onOpenReview();
    expect(reviewOverlay.open).toHaveBeenCalledWith(expect.objectContaining({ mode: "weekly" }));
  });

  it("shows toast feedback and refreshes after spawning tomorrow next actions", async () => {
    const toasterShow = vi.fn();
    vi.stubGlobal("window", {
      Blueprint: {
        Core: {
          OverlayToaster: {
            create: () => ({ show: toasterShow }),
          },
          Position: { TOP: "top" },
        },
      },
    });

    const runtime = createRuntime();
    const store = createStore();
    const actions = createExtensionActions({
      api: {} as never,
      reviewOverlay: {
        dispose: vi.fn(),
        open: vi.fn(),
        scheduleMount: vi.fn(),
      } as never,
      runtime: runtime as never,
      store: store as never,
    });

    actions.spawnTomorrowNextActions();
    await Promise.resolve();

    expect(mocks.spawnNextActionsIntoPage).toHaveBeenCalledWith(
      mocks.settings,
      "February 26th, 2026",
    );
    expect(store.scheduleRefresh).toHaveBeenCalledWith(mocks.settings, 0);
    expect(toasterShow).toHaveBeenCalledWith(expect.objectContaining({ intent: "warning" }));
    expect(toasterShow).toHaveBeenCalledWith(expect.objectContaining({ intent: "success" }));
  });
});
