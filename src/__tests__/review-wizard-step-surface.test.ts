import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

vi.mock("@blueprintjs/core", () => {
  return {
    Dialog: ({
      children,
      isOpen,
      title,
    }: {
      children: React.ReactNode;
      isOpen: boolean;
      title?: React.ReactNode;
    }) =>
      isOpen
        ? React.createElement(
            "section",
            { "data-title": typeof title === "string" ? title : undefined },
            typeof title === "string" ? React.createElement("h1", null, title) : title,
            children,
          )
        : null,
    ProgressBar: ({ value }: { value?: number }) =>
      React.createElement("div", { "data-progress": value ?? 0 }),
  };
});

const mocks = vi.hoisted(() => ({
  executeRawQuery: vi.fn(() => []),
  getDismissedProjectUidsAfterDismiss: vi.fn((uids: Set<string>, uid: string) => {
    const next = new Set(uids);
    next.add(uid);
    return next;
  }),
  getProjectTodoCurrentTag: vi.fn(() => "watch"),
  isWeeklyReviewEditableElement: vi.fn(() => false),
  loadTriageProjects: vi.fn(async () => []),
  openInSidebar: vi.fn(),
  persistProjectStatusChange: vi.fn(async () => undefined),
  replaceTag: vi.fn(async () => true),
  replaceTags: vi.fn(async () => true),
  runRoamQuery: vi.fn(() => []),
  scheduleIdleTask: vi.fn((callback: () => void) => {
    callback();
    return () => undefined;
  }),
  showTriageToast: vi.fn(),
}));

vi.mock("../browser-idle", () => ({
  scheduleIdleTask: mocks.scheduleIdleTask,
}));

vi.mock("../data", () => ({
  executeRawQuery: mocks.executeRawQuery,
  runRoamQuery: mocks.runRoamQuery,
}));

vi.mock("../review/actions", () => ({
  removeTagForms: (value: string) => value,
  removeTodoMarker: (value: string) => value,
  replaceTag: mocks.replaceTag,
  replaceTags: mocks.replaceTags,
  stripTodoStatusMarkers: (value: string) => value,
}));

vi.mock("../roam-ui-utils", () => ({
  openInSidebar: mocks.openInSidebar,
}));

vi.mock("../review/schedule", () => ({
  applyScheduleIntentToBlock: vi.fn(async () => true),
  checkScheduleConflict: vi.fn(async () => null),
  clearDueDateChild: vi.fn(async () => undefined),
  getCurrentDueDateValue: vi.fn(() => ""),
}));

vi.mock("../triage/support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../triage/support")>();
  return {
    ...actual,
    formatNamespacedPageDisplayTitle: (value: string) => value,
    loadTriageProjects: mocks.loadTriageProjects,
  };
});

vi.mock("../triage/step-logic", () => ({
  showTriageToast: mocks.showTriageToast,
}));

vi.mock("../components/TriggerListStep", () => ({
  TriggerListStep: () => React.createElement("div", null, "old triggers step"),
}));

vi.mock("../components/WorkflowReviewStep", () => ({
  WorkflowReviewStep: () => React.createElement("div", null, "old workflow step"),
}));

vi.mock("../components/InboxZeroStep", () => ({
  InboxZeroStep: ({ onAtEndChange }: { onAtEndChange?: (value: boolean) => void }) => {
    React.useEffect(() => {
      onAtEndChange?.(true);
    }, [onAtEndChange]);
    return React.createElement("div", null, "InboxZeroStep");
  },
}));

vi.mock("../components/ProjectsStep", () => ({
  ProjectsStep: () => React.createElement("div", null, "ProjectsStep"),
}));

vi.mock("../components/TriggersStep", () => ({
  TriggersStep: () => React.createElement("div", null, "TriggersStep"),
}));

vi.mock("../components/NextActionsStep", () => ({
  NextActionsStep: () => React.createElement("div", null, "NextActionsStep"),
}));

vi.mock("../components/WaitingForStep", () => ({
  WaitingForStep: () => React.createElement("div", null, "WaitingForStep"),
}));

vi.mock("../components/SomedayMaybeStep", () => ({
  SomedayMaybeStep: () => React.createElement("div", null, "SomedayMaybeStep"),
}));

vi.mock("../components/SchedulePopover", () => ({
  SchedulePopover: () => React.createElement("div", null, "schedule"),
}));

vi.mock("../components/TicklerStep", () => ({
  TicklerStep: () => React.createElement("div", null, "tickler"),
}));

vi.mock("../components/WorkflowProcessPopover", () => ({
  WorkflowProcessPopover: () => React.createElement("div", null, "triage"),
}));

vi.mock("../components/WeeklyReviewRoamBlock", () => ({
  isWeeklyReviewEditableElement: mocks.isWeeklyReviewEditableElement,
}));

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "back":
      return "Back";
    case "nextStep":
      return "Next Step";
    case "step1Desc":
      return "Process inbox";
    case "step1Title":
      return "Inbox";
    case "step2Desc":
      return "Review projects";
    case "step2Title":
      return "Projects";
    case "step3Desc":
      return "Review upcoming";
    case "step3Title":
      return "Upcoming";
    case "step4Desc":
      return "Review waiting";
    case "step4Title":
      return "Waiting";
    case "step5Desc":
      return "Review someday";
    case "step5Title":
      return "Someday";
    case "step6Desc":
      return "Review triggers";
    case "step6Title":
      return "Triggers";
    case "step7Desc":
      return "Review tickler";
    case "step7Title":
      return "Tickler";
    case "step8Desc":
      return "Review stats";
    case "step8Title":
      return "Stats";
    case "weekLabel":
      return `Week ${args[0]}`;
    default:
      return key;
  }
}

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    backHalfHydrated: false,
    backHalfLoadedAt: null,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [
      {
        ageDays: 0,
        createdTime: 0,
        deferredDate: null,
        pageTitle: "Inbox",
        text: "Initial inbox item",
        uid: "inbox-1",
      },
    ],
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
    workflowHydrated: false,
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ReviewWizard step surface", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("localStorage", dom.window.localStorage);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));

    Object.assign(globalThis.window, {
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      roamAlphaAPI: {
        data: {
          pull: vi.fn(() => ({ ":block/string": "Task", ":block/uid": "task-uid" })),
        },
        ui: {},
      },
    });
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  async function renderWizard(snapshot = createSnapshot()): Promise<void> {
    const store = {
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => snapshot),
      refresh: vi.fn(async () => undefined),
      scheduleRefresh: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };

    const module = await import("../components/ReviewWizard");

    act(() => {
      ReactDOM.render(
        React.createElement(module.ReviewWizard, {
          isOpen: true,
          onClose: vi.fn(),
          settings: { ...TEST_SETTINGS, delegateTargetTags: ["people"] },
          store,
          t,
        }),
        root,
      );
    });

    await flush();
  }

  async function clickPrimaryForward(): Promise<void> {
    const primary = root.querySelector("button.bp3-intent-primary") as HTMLButtonElement | null;
    if (!primary) {
      throw new Error("Missing primary forward button");
    }
    await act(async () => {
      primary.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flush();
  }

  async function expectStepBody(text: string): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (root.textContent?.includes(text)) {
        break;
      }
      await flush();
    }

    expect(root.textContent).toContain(text);
  }

  it("uses the renamed step wrappers for weekly navigation", async () => {
    await renderWizard(
      createSnapshot({
        nextActions: [
          {
            ageDays: 0,
            createdTime: 0,
            deferredDate: null,
            pageTitle: "Inbox",
            text: "Next",
            uid: "next-1",
          },
        ],
        projectsHydrated: true,
        someday: [
          {
            ageDays: 0,
            createdTime: 0,
            deferredDate: null,
            pageTitle: "Inbox",
            text: "Someday",
            uid: "someday-1",
          },
        ],
        waitingFor: [
          {
            ageDays: 0,
            createdTime: 0,
            deferredDate: null,
            pageTitle: "Inbox",
            text: "Waiting",
            uid: "wait-1",
          },
        ],
      }),
    );

    await expectStepBody("InboxZeroStep");

    await clickPrimaryForward();
    await expectStepBody("ProjectsStep");

    await clickPrimaryForward();
    await expectStepBody("NextActionsStep");

    await clickPrimaryForward();
    await expectStepBody("WaitingForStep");

    await clickPrimaryForward();
    await expectStepBody("SomedayMaybeStep");

    await clickPrimaryForward();
    await expectStepBody("TriggersStep");
  });
});
