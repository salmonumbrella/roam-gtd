import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDailyReviewNotifier: vi.fn(),
  createReviewNotifier: vi.fn(),
  createT: vi.fn(() => (key: string) => key),
  getSettings: vi.fn(() => ({
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
  })),
  settingsEqual: vi.fn((a, b) => JSON.stringify(a) === JSON.stringify(b)),
}));

vi.mock("../extension/notifiers", () => ({
  createDailyReviewNotifier: mocks.createDailyReviewNotifier,
  createReviewNotifier: mocks.createReviewNotifier,
}));

vi.mock("../i18n", () => ({
  createT: mocks.createT,
}));

vi.mock("../settings", () => ({
  getSettings: mocks.getSettings,
}));

vi.mock("../store", () => ({
  settingsEqual: mocks.settingsEqual,
}));

import { createExtensionRuntime } from "../extension/runtime";

function createStore() {
  return {
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => ({
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
    })),
    refresh: vi.fn(() => Promise.resolve()),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

describe("extension runtime", () => {
  const addEventListener = vi.fn();
  const addPullWatch = vi.fn();
  const removeEventListener = vi.fn();
  const removePullWatch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.createReviewNotifier.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
    });
    mocks.createDailyReviewNotifier.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
    });

    vi.stubGlobal("window", {
      __roamGtdHandleInboxShortcut: null,
      __roamGtdPendingInboxShortcut: null,
      addEventListener,
      clearTimeout: globalThis.clearTimeout,
      removeEventListener,
      roamAlphaAPI: {
        data: {
          addPullWatch,
          removePullWatch,
        },
      },
      setTimeout: globalThis.setTimeout,
    });
    vi.stubGlobal("document", {
      activeElement: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts notifiers and global shortcut handling on start, then tears them down on dispose", () => {
    const reviewNotifier = {
      start: vi.fn(),
      stop: vi.fn(),
    };
    const dailyNotifier = {
      start: vi.fn(),
      stop: vi.fn(),
    };
    mocks.createReviewNotifier.mockReturnValue(reviewNotifier);
    mocks.createDailyReviewNotifier.mockReturnValue(dailyNotifier);

    const runtime = createExtensionRuntime({
      api: {} as never,
      store: createStore() as never,
    });

    runtime.start({
      openDailyReview: vi.fn(),
      openWeeklyReview: vi.fn(),
    });

    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(reviewNotifier.start).toHaveBeenCalledTimes(1);
    expect(dailyNotifier.start).toHaveBeenCalledTimes(1);

    runtime.dispose();

    expect(reviewNotifier.stop).toHaveBeenCalledTimes(1);
    expect(dailyNotifier.stop).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
