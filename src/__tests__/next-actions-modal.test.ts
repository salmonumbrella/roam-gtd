import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GtdState } from "../store";
import type { createGtdStore } from "../store";
import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

const {
  groupNextActionsByContext,
  hideTagReferenceInEmbed,
  isNoContextGroup,
  markDone,
  openInSidebar,
  replaceTag,
} = vi.hoisted(() => ({
  groupNextActionsByContext: vi.fn(),
  hideTagReferenceInEmbed: vi.fn(),
  isNoContextGroup: vi.fn(),
  markDone: vi.fn(() => Promise.resolve(true)),
  openInSidebar: vi.fn(),
  replaceTag: vi.fn(() => Promise.resolve()),
}));

vi.mock("@blueprintjs/core", () => ({
  Dialog: ({
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
      React.createElement("button", { onClick: onClose, type: "button" }, "dialog-close"),
      children,
    ),
}));

vi.mock("../embed-utils", () => ({
  hideTagReferenceInEmbed,
}));

vi.mock("../planning/next-actions-grouping", () => ({
  groupNextActionsByContext,
  isNoContextGroup,
}));

vi.mock("../review/actions", () => ({
  markDone,
  replaceTag,
}));

vi.mock("../roam-ui-utils", () => ({
  openInSidebar,
}));

import { NextActionsModal } from "../components/NextActionsModal";

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "actionDelegated":
      return "Delegated";
    case "actionDone":
      return "Done";
    case "actionSomeday":
      return "Someday";
    case "actionWaiting":
      return "Waiting";
    case "ageDays":
      return `${args[0]} days`;
    case "allClear":
      return "All clear";
    case "itemCount":
      return `${args[0]} items`;
    case "nextActions":
      return "Next actions";
    case "noContext":
      return "No context";
    case "refresh":
      return "Refresh";
    default:
      return key;
  }
}

function createTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 2,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Office",
    text: "{{[[TODO]]}} Call client",
    uid: "todo-1",
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

describe("NextActionsModal", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;
  let renderBlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    renderBlock = vi.fn(({ el, uid }: { el: HTMLElement; uid: string }) => {
      el.innerHTML = `<div data-rendered='${uid}'>${uid}</div>`;
    });

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
    Reflect.set(
      globalThis.window as object,
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    );
    Reflect.set(globalThis.window as object, "cancelAnimationFrame", vi.fn());
    Reflect.set(globalThis.window as object, "roamAlphaAPI", {
      ui: {
        components: {
          renderBlock,
        },
      },
    });

    groupNextActionsByContext.mockReset();
    groupNextActionsByContext.mockImplementation((items: Array<TodoItem>) =>
      items.length ? [{ items, key: "office", label: "Office" }] : [],
    );
    isNoContextGroup.mockReset();
    isNoContextGroup.mockReturnValue(false);
    hideTagReferenceInEmbed.mockClear();
    markDone.mockClear();
    openInSidebar.mockClear();
    replaceTag.mockClear();
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("renders previews for the grouped list and selected item, and refreshes on demand", () => {
    const store = createStore(
      createState({
        nextActions: [createTodo(), createTodo({ pageTitle: "Home", uid: "todo-2" })],
      }),
    );

    act(() => {
      ReactDOM.render(
        React.createElement(NextActionsModal, {
          isOpen: true,
          onClose: vi.fn(),
          settings: TEST_SETTINGS,
          store,
          t,
        }),
        root,
      );
    });

    expect(root.textContent).toContain("2 items");
    expect(renderBlock).toHaveBeenCalledWith(expect.objectContaining({ uid: "todo-1" }));
    expect(renderBlock).toHaveBeenCalledWith(expect.objectContaining({ uid: "todo-2" }));
    expect(hideTagReferenceInEmbed.mock.calls[0]?.[0]).toBeInstanceOf(dom.window.HTMLElement);
    expect(hideTagReferenceInEmbed).toHaveBeenCalledWith(
      expect.any(dom.window.HTMLElement),
      TEST_SETTINGS.tagNextAction,
    );
    expect(hideTagReferenceInEmbed).toHaveBeenCalledWith(
      expect.any(dom.window.HTMLElement),
      "Office",
    );

    act(() => {
      click(findButtonByText(root, "Refresh"), dom);
    });

    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0);
  });

  it("moves the selected item to waiting and hides it optimistically", async () => {
    const store = createStore(
      createState({
        nextActions: [createTodo()],
      }),
    );

    act(() => {
      ReactDOM.render(
        React.createElement(NextActionsModal, {
          isOpen: true,
          onClose: vi.fn(),
          settings: TEST_SETTINGS,
          store,
          t,
        }),
        root,
      );
    });

    await act(async () => {
      click(findButtonByText(root, "Waiting"), dom);
      await Promise.resolve();
    });

    expect(replaceTag).toHaveBeenCalledWith(
      "todo-1",
      TEST_SETTINGS.tagNextAction,
      TEST_SETTINGS.tagWaitingFor,
      "{{[[TODO]]}} Call client",
    );
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 300);
    expect(root.textContent).toContain("0 items");
    expect(root.textContent).toContain("All clear");
  });

  it("marks the selected item done, allows opening it in the sidebar, and closes cleanly", async () => {
    const onAfterClose = vi.fn();
    const onClose = vi.fn();
    const store = createStore(
      createState({
        nextActions: [
          createTodo(),
          createTodo({ pageTitle: "Home", text: "{{[[TODO]]}} File taxes", uid: "todo-2" }),
        ],
      }),
    );

    act(() => {
      ReactDOM.render(
        React.createElement(NextActionsModal, {
          isOpen: true,
          onAfterClose,
          onClose,
          settings: TEST_SETTINGS,
          store,
          t,
        }),
        root,
      );
    });

    const listItems = Array.from(root.querySelectorAll("div[role='button']"));
    if (!listItems[1] || listItems[1].tagName !== "DIV") {
      throw new Error("Expected second list item");
    }

    act(() => {
      click(listItems[1], dom);
    });

    act(() => {
      click(findButtonByText(root, "Home"), dom);
    });
    expect(openInSidebar).toHaveBeenCalledWith("todo-2");

    await act(async () => {
      click(findButtonByText(root, "Done"), dom);
      await Promise.resolve();
    });

    expect(markDone).toHaveBeenCalledWith("todo-2", "{{[[TODO]]}} File taxes");
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 300);

    act(() => {
      click(findButtonByText(root, "dialog-close"), dom);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAfterClose).toHaveBeenCalledTimes(1);
  });
});
