import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDashboardStepController } from "../review/controllers/dashboard-step-controller";
import type { GtdState } from "../store";
import type { createGtdStore } from "../store";
import type { ProjectSummary, TodoItem, TopGoalEntry } from "../types";
import { TEST_SETTINGS } from "./fixtures";

const { groupNextActionsByContext, isNoContextGroup, markDone, openInSidebar } = vi.hoisted(() => ({
  groupNextActionsByContext: vi.fn(),
  isNoContextGroup: vi.fn(),
  markDone: vi.fn(() => Promise.resolve(true)),
  openInSidebar: vi.fn(),
}));

vi.mock("@blueprintjs/core", () => ({
  Drawer: ({
    children,
    onClose,
    title,
  }: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
  }) =>
    React.createElement(
      "section",
      { "data-title": title },
      React.createElement("button", { onClick: onClose, type: "button" }, "drawer-close"),
      children,
    ),
}));

vi.mock("../planning/next-actions-grouping", () => ({
  groupNextActionsByContext,
  isNoContextGroup,
}));

vi.mock("../review/actions", () => ({
  markDone,
}));

vi.mock("../roam-ui-utils", () => ({
  openInSidebar,
}));

import { Dashboard } from "../components/Dashboard";

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "allClear":
      return "All clear";
    case "gtd":
      return "GTD";
    case "itemCount":
      return `${args[0]} items`;
    case "nextActions":
      return "Next actions";
    case "noActiveProjects":
      return "No active projects";
    case "noContext":
      return "No context";
    case "projects":
      return "Projects";
    case "refresh":
      return "Refresh";
    case "todoCount":
      return `${args[0]} todos`;
    case "weeklyReview":
      return "Weekly review";
    case "ageDays":
      return `${args[0]} days`;
    case "dueDate":
      return `Due ${args[0]}`;
    case "delegated":
      return "Delegated";
    case "deferred":
      return "Deferred";
    case "inbox":
      return "Inbox";
    case "markDone":
      return "Mark done";
    case "next":
      return "Next";
    case "someday":
      return "Someday";
    case "stale":
      return "Stale";
    case "waiting":
      return "Waiting";
    default:
      return key;
  }
}

function createTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Inbox Page",
    text: "{{[[TODO]]}} Default task",
    uid: "todo-1",
    ...overrides,
  };
}

function createProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    doneCount: 0,
    lastDoneTime: null,
    lastTodoCreatedTime: null,
    lastTodoText: null,
    lastTodoUid: null,
    pageTitle: "Project Alpha",
    pageUid: "project-1",
    statusBlockUid: null,
    statusText: null,
    todoCount: 2,
    todoListUid: null,
    totalCount: 2,
    ...overrides,
  };
}

function createTopGoal(overrides: Partial<TopGoalEntry> = {}): TopGoalEntry {
  return {
    goal: "Ship review shell",
    pageTitle: "Project Alpha",
    text: "Finish the refactor",
    uid: "goal-1",
    ...overrides,
  };
}

function createState(overrides: Partial<GtdState> = {}): GtdState {
  return {
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
  };
}

type GtdStore = ReturnType<typeof createGtdStore>;

function createStore(state: GtdState): GtdStore {
  return {
    dispose: vi.fn(),
    getSnapshot: () => state,
    refresh: vi.fn(async () => {}),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

function click(element: Element, dom: JSDOM): void {
  element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
}

function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button || button.tagName !== "BUTTON") {
    throw new Error(`Button not found: ${text}`);
  }
  return button as HTMLButtonElement;
}

describe("Dashboard", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
    groupNextActionsByContext.mockReset();
    groupNextActionsByContext.mockImplementation((items: Array<TodoItem>) =>
      items.length ? [{ items, key: "office", label: "Office" }] : [],
    );
    isNoContextGroup.mockReset();
    isNoContextGroup.mockReturnValue(false);
    markDone.mockClear();
    openInSidebar.mockClear();
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("renders inbox by default, shows loading state, and opens the review flow", () => {
    const onOpenReview = vi.fn();
    const store = createStore(
      createState({
        inbox: [createTodo({ pageTitle: "Inbox", text: "{{[[TODO]]}} Buy milk" })],
        loading: true,
      }),
    );

    act(() => {
      ReactDOM.render(
        React.createElement(Dashboard, {
          isOpen: true,
          onClose: vi.fn(),
          onOpenReview,
          settings: TEST_SETTINGS,
          store,
          t,
        }),
        root,
      );
    });

    expect(root.textContent).toContain("Buy milk");
    expect(root.querySelector(".bp3-progress-bar")).not.toBeNull();

    act(() => {
      click(findButtonByText(root, "Weekly review"), dom);
    });

    expect(onOpenReview).toHaveBeenCalledTimes(1);
    expect(store.subscribe).toHaveBeenCalledTimes(1);
  });

  it("keeps summary-save ownership inside the dashboard controller", async () => {
    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        createBlock,
        createPage,
        util: {
          generateUID: vi.fn(() => "generated-uid"),
        },
      },
    });
    const controller = createDashboardStepController({
      findSummaryPageUid: () => null,
      getState: () =>
        createState({
          completedThisWeek: [createTodo({ uid: "done-1" })],
          topGoals: [createTopGoal()],
        }),
      t,
    });

    await controller.activate("stats");
    expect(controller.getSnapshot("stats").summary.savedSummary).toBe(false);

    await controller.saveSummary();

    expect(controller.getSnapshot("stats").summary.savedSummary).toBe(true);
    expect(createPage).toHaveBeenCalledOnce();
    expect(createBlock).toHaveBeenCalled();
  });

  it("switches tabs, opens projects in the sidebar, and schedules refresh after marking a next action done", async () => {
    const store = createStore(
      createState({
        nextActions: [createTodo({ pageTitle: "Office", text: "{{[[TODO]]}} Call client" })],
        projects: [createProject()],
      }),
    );

    act(() => {
      ReactDOM.render(
        React.createElement(Dashboard, {
          isOpen: true,
          onClose: vi.fn(),
          onOpenReview: vi.fn(),
          settings: TEST_SETTINGS,
          store,
          t,
        }),
        root,
      );
    });

    act(() => {
      click(findButtonByText(root, "Projects"), dom);
    });
    act(() => {
      click(findButtonByText(root, "Project Alpha"), dom);
    });

    expect(openInSidebar).toHaveBeenCalledWith("project-1");

    act(() => {
      click(findButtonByText(root, "Next"), dom);
    });
    expect(root.textContent).toContain("#Office");
    expect(root.textContent).toContain("Call client");

    const markDoneButton = root.querySelector("button.bp3-icon-tick");
    if (!markDoneButton || markDoneButton.tagName !== "BUTTON") {
      throw new Error("Mark done button not found");
    }

    await act(async () => {
      click(markDoneButton, dom);
      await Promise.resolve();
    });

    expect(markDone).toHaveBeenCalledWith("todo-1");
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS);
  });

  it("calls onClose and onAfterClose when the drawer closes", () => {
    const onAfterClose = vi.fn();
    const onClose = vi.fn();
    const store = createStore(createState());

    act(() => {
      ReactDOM.render(
        React.createElement(Dashboard, {
          isOpen: true,
          onAfterClose,
          onClose,
          onOpenReview: vi.fn(),
          settings: TEST_SETTINGS,
          store,
          t,
        }),
        root,
      );
    });

    act(() => {
      click(findButtonByText(root, "drawer-close"), dom);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });
});
