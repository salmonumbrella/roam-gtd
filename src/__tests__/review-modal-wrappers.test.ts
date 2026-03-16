import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { createGtdStore } from "../store";
import { TEST_SETTINGS } from "./fixtures";

const mocks = vi.hoisted(() => {
  const ReviewWizard = vi.fn(() => null);
  return { ReviewWizard };
});

vi.mock("../components/ReviewWizard", () => ({
  ReviewWizard: mocks.ReviewWizard,
}));

import { DailyReviewModal } from "../components/DailyReviewModal";
import { WeeklyReviewModal } from "../components/WeeklyReviewModal";

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

function makeProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    settings: TEST_SETTINGS,
    store: makeStore(),
    t: (key: string) => key,
  };
}

describe("review mode wrappers", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
    mocks.ReviewWizard.mockClear();
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("renders WeeklyReviewModal with weekly mode", () => {
    act(() => {
      ReactDOM.render(React.createElement(WeeklyReviewModal, makeProps()), root);
    });

    expect(mocks.ReviewWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "weekly",
      }),
      expect.anything(),
    );
  });

  it("renders DailyReviewModal with daily mode", () => {
    act(() => {
      ReactDOM.render(React.createElement(DailyReviewModal, makeProps()), root);
    });

    expect(mocks.ReviewWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "daily",
      }),
      expect.anything(),
    );
  });
});
