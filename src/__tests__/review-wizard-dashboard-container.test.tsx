import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

let dashboardRenderCount = 0;

vi.mock("../components/VelocityDashboard", () => ({
  VelocityDashboard: ({ completedCount }: { completedCount: number }) => {
    dashboardRenderCount += 1;
    return React.createElement(
      "div",
      { "data-testid": "velocity-dashboard" },
      `completed:${completedCount}`,
    );
  },
}));

type TestState = {
  backHalfHydrated: boolean;
  completedThisWeek: Array<unknown>;
  deferred: Array<unknown>;
  delegated: Array<unknown>;
  inbox: Array<unknown>;
  lastWeekMetrics: null;
  loading: boolean;
  nextActions: Array<unknown>;
  projects: Array<unknown>;
  projectsHydrated: boolean;
  projectsLoading: boolean;
  someday: Array<unknown>;
  stale: Array<unknown>;
  ticklerItems: Array<unknown>;
  topGoals: Array<unknown>;
  triagedThisWeekCount: number;
  waitingFor: Array<unknown>;
};

function createSnapshot(overrides: Partial<TestState> = {}): TestState {
  return {
    backHalfHydrated: true,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [{ uid: "inbox-1" }],
    lastWeekMetrics: null,
    loading: false,
    nextActions: [],
    projects: [{ uid: "project-1" }],
    projectsHydrated: true,
    projectsLoading: false,
    someday: [],
    stale: [],
    ticklerItems: [],
    topGoals: [],
    triagedThisWeekCount: 0,
    waitingFor: [],
    ...overrides,
  };
}

function createStore(initialState: TestState) {
  let currentState = initialState;
  const listeners = new Set<(state: TestState) => void>();

  return {
    emit(nextState: TestState) {
      currentState = nextState;
      for (const listener of listeners) {
        listener(nextState);
      }
    },
    store: {
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => currentState),
      refresh: vi.fn(async () => undefined),
      scheduleRefresh: vi.fn(),
      subscribe: vi.fn((listener: (state: TestState) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
    },
  };
}

function createSession() {
  const controller = {
    activate: vi.fn(async () => undefined),
    deactivate: vi.fn(),
    dispose: vi.fn(),
    domainKey: "dashboard" as const,
    getSnapshot: vi.fn(() => ({
      summary: { savedSummary: false },
    })),
    publishSnapshot: vi.fn(),
    resetSummaryState: vi.fn(),
    saveSummary: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  };

  return {
    controller,
    session: {
      activate: vi.fn(async () => undefined),
      dispose: vi.fn(),
      getControllerDomainForStep: vi.fn(() => "dashboard"),
      getControllerForStep: vi.fn(() => controller),
      getSnapshot: vi.fn(() => ({
        activeStep: {
          controllerDomain: "dashboard",
          step: { description: "Review summary", key: "stats", title: "Step 8: Summary" },
          stepKey: "stats",
          stepSnapshot: null,
        },
        activeStepKey: "stats",
        controllerStates: {
          dashboard: { error: null, snapshot: null, status: "cold", stepKey: null },
          inbox: { error: null, snapshot: null, status: "cold", stepKey: null },
          projects: { error: null, snapshot: null, status: "cold", stepKey: null },
          tickler: { error: null, snapshot: null, status: "cold", stepKey: null },
          workflow: { error: null, snapshot: null, status: "cold", stepKey: null },
        },
        mode: "weekly" as const,
        steps: [],
      })),
      subscribe: vi.fn(() => () => undefined),
    },
  };
}

function t(key: string): string {
  switch (key) {
    case "saveWeeklySummary":
      return "Save Weekly Summary";
    case "weeklyReview":
      return "Weekly Review";
    case "summarySaved":
      return "Summary Saved";
    default:
      return key;
  }
}

describe("DashboardContainer", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dashboardRenderCount = 0;
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        data: {
          pull: vi.fn(() => null),
        },
      },
    });
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(root);
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("publishes the dashboard footer state and explicit summary title", async () => {
    const { DashboardContainer } =
      await import("../components/review-wizard/containers/DashboardContainer");
    const { controller, session } = createSession();
    const { store } = createStore(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(DashboardContainer, {
          activeControlsRef: { current: null },
          isLastStep: true,

          session: session as never,
          settings: TEST_SETTINGS,
          stepCount: 8,
          stepIndex: 7,
          stepKey: "stats",
          store: store as never,
          t,
        }),
        root,
      );
    });

    expect(controller.publishSnapshot).toHaveBeenCalledWith(
      "stats",
      expect.objectContaining({
        footer: expect.objectContaining({
          rightAction: expect.objectContaining({ labelKey: "saveWeeklySummary" }),
        }),
        header: expect.objectContaining({
          title: "Weekly Review",
        }),
      }),
    );
  });

  it("does not re-render when non-dashboard loading fields change", async () => {
    const { DashboardContainer } =
      await import("../components/review-wizard/containers/DashboardContainer");
    const { session } = createSession();
    const harness = createStore(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(DashboardContainer, {
          activeControlsRef: { current: null },
          isLastStep: true,

          session: session as never,
          settings: TEST_SETTINGS,
          stepCount: 8,
          stepIndex: 7,
          stepKey: "stats",
          store: harness.store as never,
          t,
        }),
        root,
      );
    });

    const initialRenderCount = dashboardRenderCount;
    const currentSnapshot = harness.store.getSnapshot();

    await act(async () => {
      harness.emit({
        ...currentSnapshot,
        loading: true,
      });
    });

    expect(dashboardRenderCount).toBe(initialRenderCount);
  });
});
