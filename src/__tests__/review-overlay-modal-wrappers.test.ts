import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import { TEST_SETTINGS } from "./fixtures";

const mocks = vi.hoisted(() => {
  const DailyReviewModal = vi.fn(() => null);
  const ReviewWizard = vi.fn(() => null);
  const WeeklyReviewModal = vi.fn(() => null);
  return { DailyReviewModal, ReviewWizard, WeeklyReviewModal };
});

vi.mock("../components/DailyReviewModal", () => ({
  DailyReviewModal: mocks.DailyReviewModal,
}));

vi.mock("../components/ReviewWizard", () => ({
  ReviewWizard: mocks.ReviewWizard,
}));

vi.mock("../components/WeeklyReviewModal", () => ({
  WeeklyReviewModal: mocks.WeeklyReviewModal,
}));

import { createReviewOverlayController } from "../review/overlay";

type GtdStore = ReturnType<typeof createGtdStore>;

function makeStore(): GtdStore {
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
      workflowHydrated: false,
    })),
    refresh: vi.fn(async () => {}),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

function makeT() {
  return (key: string) => key;
}

describe("review overlay modal wrappers", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><body></body>");
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    mocks.DailyReviewModal.mockClear();
    mocks.ReviewWizard.mockClear();
    mocks.WeeklyReviewModal.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("renders WeeklyReviewModal for weekly mode", () => {
    const controller = createReviewOverlayController();
    controller.scheduleMount();
    controller.open({
      mode: "weekly",
      onAfterClose: vi.fn(),
      settings: TEST_SETTINGS as GtdSettings,
      store: makeStore(),
      t: makeT(),
    });

    expect(mocks.WeeklyReviewModal).toHaveBeenCalled();
    expect(mocks.DailyReviewModal).not.toHaveBeenCalled();
    expect(mocks.ReviewWizard).not.toHaveBeenCalled();

    controller.dispose();
  });

  it("renders DailyReviewModal for daily mode", () => {
    const controller = createReviewOverlayController();
    controller.scheduleMount();
    controller.open({
      mode: "daily",
      onAfterClose: vi.fn(),
      settings: TEST_SETTINGS as GtdSettings,
      store: makeStore(),
      t: makeT(),
    });

    expect(mocks.DailyReviewModal).toHaveBeenCalled();
    expect(mocks.WeeklyReviewModal).not.toHaveBeenCalled();
    expect(mocks.ReviewWizard).not.toHaveBeenCalled();

    controller.dispose();
  });
});
