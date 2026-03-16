import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

let inboxRenderCount = 0;

vi.mock("../components/InboxZeroStep", () => ({
  InboxZeroStep: ({
    items,
    onAtEndChange,
    onProgressChange,
  }: {
    items: Array<{ uid: string }>;
    onAtEndChange?: (atEnd: boolean) => void;
    onProgressChange?: (current: number, total: number) => void;
  }) => {
    inboxRenderCount += 1;
    React.useEffect(() => {
      const total = items.length;
      onAtEndChange?.(total > 0);
      onProgressChange?.(total, total);
    }, [items, onAtEndChange, onProgressChange]);

    return React.createElement(
      "div",
      { "data-testid": "inbox-zero-step" },
      items.map((item) => item.uid).join(","),
    );
  },
}));

type TestState = {
  backHalfHydrated: boolean;
  completedThisWeek: Array<unknown>;
  deferred: Array<unknown>;
  delegated: Array<unknown>;
  inbox: Array<{ uid: string }>;
  lastWeekMetrics: null;
  loading: boolean;
  nextActions: Array<{ uid: string }>;
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
    backHalfHydrated: false,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [{ uid: "inbox-1" }],
    lastWeekMetrics: null,
    loading: false,
    nextActions: [],
    projects: [],
    projectsHydrated: false,
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
    domainKey: "inbox" as const,
    getSnapshot: vi.fn(() => null),
    publishSnapshot: vi.fn(),
    reportInboxProgress: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };

  return {
    controller,
    session: {
      activate: vi.fn(async () => undefined),
      dispose: vi.fn(),
      getControllerDomainForStep: vi.fn(() => "inbox"),
      getControllerForStep: vi.fn(() => controller),
      getSnapshot: vi.fn(() => ({
        activeStep: {
          controllerDomain: "inbox",
          step: { description: "Process inbox", key: "inbox", title: "Step 1: Inbox Zero" },
          stepKey: "inbox",
          stepSnapshot: null,
        },
        activeStepKey: "inbox",
        controllerStates: {
          dashboard: { error: null, snapshot: null, status: "cold", stepKey: null },
          inbox: { error: null, snapshot: null, status: "cold", stepKey: null },
          projects: { error: null, snapshot: null, status: "cold", stepKey: null },
          tickler: { error: null, snapshot: null, status: "cold", stepKey: null },
          workflow: { error: null, snapshot: null, status: "cold", stepKey: null },
        },
        mode: "weekly" as const,
        steps: [
          { description: "Process inbox", key: "inbox", title: "Step 1: Inbox Zero" },
          { description: "Review projects", key: "projects", title: "Step 2: Projects" },
        ],
      })),
      subscribe: vi.fn(() => () => undefined),
    },
  };
}

function t(key: string): string {
  switch (key) {
    case "dailyReviewTitle":
      return "Daily Review";
    case "nextItem":
      return "Next";
    case "nextStep":
      return "Next Step";
    case "previousItem":
      return "Previous Item";
    case "step1Title":
      return "Step 1: Inbox Zero";
    default:
      return key;
  }
}

describe("InboxZeroStepContainer", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    inboxRenderCount = 0;
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(root);
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("subscribes only to inbox/loading and reports shell progress through the inbox controller", async () => {
    const { InboxZeroStepContainer } =
      await import("../components/review-wizard/containers/InboxZeroStepContainer");
    const { controller, session } = createSession();
    const { store } = createStore(createSnapshot());
    const activeControlsRef = { current: null };

    await act(async () => {
      ReactDOM.render(
        React.createElement(InboxZeroStepContainer, {
          activeControlsRef,
          isLastStep: false,
          session: session as never,
          settings: TEST_SETTINGS,
          stepCount: 8,
          stepIndex: 0,
          stepKey: "inbox",
          store: store as never,
          t,
        }),
        root,
      );
    });

    expect(controller.reportInboxProgress).toHaveBeenCalledWith({
      atEnd: true,
      current: 1,
      total: 1,
    });
    expect(controller.publishSnapshot).toHaveBeenCalledWith(
      "inbox",
      expect.objectContaining({
        footer: expect.objectContaining({
          rightAction: expect.objectContaining({ labelKey: "nextStep" }),
        }),
        header: expect.objectContaining({
          title: "Step 1: Inbox Zero",
        }),
      }),
    );
  });

  it("does not re-render when workflow slices change", async () => {
    const { InboxZeroStepContainer } =
      await import("../components/review-wizard/containers/InboxZeroStepContainer");
    const { session } = createSession();
    const harness = createStore(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(InboxZeroStepContainer, {
          activeControlsRef: { current: null },
          isLastStep: false,
          session: session as never,
          settings: TEST_SETTINGS,
          stepCount: 8,
          stepIndex: 0,
          stepKey: "inbox",
          store: harness.store as never,
          t,
        }),
        root,
      );
    });

    const initialRenderCount = inboxRenderCount;
    const currentSnapshot = harness.store.getSnapshot();

    await act(async () => {
      harness.emit({
        ...currentSnapshot,
        nextActions: [{ uid: "next-1" }],
      });
    });

    expect(inboxRenderCount).toBe(initialRenderCount);
  });
});
