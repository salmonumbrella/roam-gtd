import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

let projectsRenderCount = 0;

vi.mock("../components/ProjectsStep", () => ({
  ProjectsStep: ({ projects }: { projects: Array<{ pageUid: string }> }) => {
    projectsRenderCount += 1;
    return React.createElement(
      "div",
      { "data-testid": "projects-step" },
      projects.map((project) => project.pageUid).join(","),
    );
  },
}));

type TestProject = {
  lastTodoCreatedTime: number | null;
  lastTodoText: string | null;
  lastTodoUid: string | null;
  pageTitle: string;
  pageUid: string;
  statusBlockUid: string | null;
  statusText: string | null;
  todoCount: number;
  todoListUid: string | null;
};

type TestState = {
  backHalfHydrated: boolean;
  completedThisWeek: Array<unknown>;
  deferred: Array<unknown>;
  delegated: Array<unknown>;
  inbox: Array<unknown>;
  lastWeekMetrics: null;
  loading: boolean;
  nextActions: Array<unknown>;
  projects: Array<TestProject>;
  projectsHydrated: boolean;
  projectsLoading: boolean;
  someday: Array<unknown>;
  stale: Array<unknown>;
  ticklerItems: Array<unknown>;
  topGoals: Array<unknown>;
  triagedThisWeekCount: number;
  waitingFor: Array<unknown>;
};

function createProject(pageUid: string): TestProject {
  return {
    lastTodoCreatedTime: null,
    lastTodoText: null,
    lastTodoUid: null,
    pageTitle: `Project ${pageUid}`,
    pageUid,
    statusBlockUid: null,
    statusText: null,
    todoCount: 0,
    todoListUid: null,
  };
}

function createSnapshot(overrides: Partial<TestState> = {}): TestState {
  return {
    backHalfHydrated: false,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [],
    lastWeekMetrics: null,
    loading: false,
    nextActions: [],
    projects: [createProject("project-1")],
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
    closeProjectDetail: vi.fn(),
    deactivate: vi.fn(),
    dispose: vi.fn(),
    domainKey: "projects" as const,
    getSnapshot: vi.fn(() => null),
    openProjectDetail: vi.fn(),
    publishSnapshot: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };

  return {
    controller,
    session: {
      activate: vi.fn(async () => undefined),
      dispose: vi.fn(),
      getControllerDomainForStep: vi.fn(() => "projects"),
      getControllerForStep: vi.fn(() => controller),
      getSnapshot: vi.fn(() => ({
        activeStep: {
          controllerDomain: "projects",
          step: { description: "Review projects", key: "projects", title: "Step 2: Projects" },
          stepKey: "projects",
          stepSnapshot: null,
        },
        activeStepKey: "projects",
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
    case "next":
      return "Next";
    case "nextStep":
      return "Next Step";
    case "step2Title":
      return "Step 2: Projects";
    default:
      return key;
  }
}

describe("ProjectsStepContainer", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    projectsRenderCount = 0;
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        createBlock: vi.fn(async () => undefined),
        data: { pull: vi.fn(() => ({ ":block/string": "" })) },
        updateBlock: vi.fn(async () => undefined),
        util: { generateUID: vi.fn(() => "uid") },
      },
    });
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(root);
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("reports reviewed count and forward action through the projects controller", async () => {
    const { ProjectsStepContainer } =
      await import("../components/review-wizard/containers/ProjectsStepContainer");
    const { controller, session } = createSession();
    const { store } = createStore(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(ProjectsStepContainer, {
          activeControlsRef: { current: null },
          isLastStep: false,
          session: session as never,
          settings: TEST_SETTINGS,
          stepCount: 8,
          stepIndex: 1,
          stepKey: "projects",
          store: store as never,
          t,
        }),
        root,
      );
    });

    expect(controller.publishSnapshot).toHaveBeenCalledWith(
      "projects",
      expect.objectContaining({
        footer: expect.objectContaining({
          rightAction: expect.objectContaining({ labelKey: "next" }),
        }),
        header: expect.objectContaining({
          title: "Step 2: Projects",
        }),
      }),
    );
  });

  it("does not re-render when workflow slices change", async () => {
    const { ProjectsStepContainer } =
      await import("../components/review-wizard/containers/ProjectsStepContainer");
    const { session } = createSession();
    const harness = createStore(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(ProjectsStepContainer, {
          activeControlsRef: { current: null },
          isLastStep: false,
          session: session as never,
          settings: TEST_SETTINGS,
          stepCount: 8,
          stepIndex: 1,
          stepKey: "projects",
          store: harness.store as never,
          t,
        }),
        root,
      );
    });

    const initialRenderCount = projectsRenderCount;
    const currentSnapshot = harness.store.getSnapshot();

    await act(async () => {
      harness.emit({
        ...currentSnapshot,
        waitingFor: [{ uid: "waiting-1" }],
      });
    });

    expect(projectsRenderCount).toBe(initialRenderCount);
  });
});
