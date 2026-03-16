import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonEntry } from "../people";
import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

vi.mock("../components/UnifiedReviewRow", () => ({
  UnifiedReviewRow: ({
    item,
    onMouseEnter,
    onMouseLeave,
  }: {
    item: TodoItem;
    onMouseEnter?: (uid: string) => void;
    onMouseLeave?: (uid: string) => void;
  }) =>
    React.createElement(
      "div",
      {
        "data-row-uid": item.uid,
        onMouseEnter: () => onMouseEnter?.(item.uid),
        onMouseLeave: () => onMouseLeave?.(item.uid),
      },
      item.text,
      React.createElement(
        "button",
        {
          id: `gtd-unified-row-triage-${item.uid}`,
          type: "button",
        },
        "triage",
      ),
    ),
}));

import { WorkflowReviewStep } from "../components/WorkflowReviewStep";

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "allClearTitle":
      return `${args[0]}: All clear`;
    case "watching":
      return "Watching";
    default:
      return key;
  }
}

function createTodo(uid: string, text = `{{[[TODO]]}} ${uid}`): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Inbox",
    text,
    uid,
  };
}

describe("WorkflowReviewStep", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  function renderStep(
    overrides: Partial<React.ComponentProps<typeof WorkflowReviewStep>> = {},
  ): React.ComponentProps<typeof WorkflowReviewStep> {
    const props: React.ComponentProps<typeof WorkflowReviewStep> = {
      activeTriageUid: null,
      emptyStepTitle: "Waiting",
      onItemProcessed: vi.fn(),
      onOpenInSidebar: vi.fn(),
      onOpenTriage: vi.fn(),
      sections: [
        {
          clockTargetTag: TEST_SETTINGS.tagSomeday,
          currentTag: TEST_SETTINGS.tagWaitingFor,
          items: [],
          key: "waiting",
        },
      ],
      settings: TEST_SETTINGS,
      t,
      ...overrides,
    };

    act(() => {
      ReactDOM.render(React.createElement(WorkflowReviewStep, props), root);
    });

    return props;
  }

  it("renders the complete empty state when there are no workflow items", () => {
    renderStep({ emptyStepDescription: "Nothing waiting for follow-up." });

    expect(root.textContent).toContain("Waiting: All clear");
    expect(root.textContent).toContain("Nothing waiting for follow-up.");
  });

  it("reveals incremental rows as the user scrolls near the bottom", () => {
    renderStep({
      initialVisibleRows: 1,
      rowBatchSize: 1,
      sections: [
        {
          clockTargetTag: TEST_SETTINGS.tagSomeday,
          currentTag: TEST_SETTINGS.tagWaitingFor,
          items: [createTodo("todo-1"), createTodo("todo-2"), createTodo("todo-3")],
          key: "waiting",
          title: "Waiting",
        },
      ],
      useIncrementalRows: true,
    });

    expect(root.querySelectorAll("[data-row-uid]")).toHaveLength(1);
    expect(root.textContent).toContain("Waiting");

    const scrollContainer = root.querySelector("[data-roam-gtd-workflow-scroll='true']");
    if (!scrollContainer || scrollContainer.tagName !== "DIV") {
      throw new Error("Scroll container not found");
    }

    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 400, writable: true },
    });

    act(() => {
      scrollContainer.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
    });
    expect(root.querySelectorAll("[data-row-uid]")).toHaveLength(2);

    act(() => {
      scrollContainer.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
    });
    expect(root.querySelectorAll("[data-row-uid]")).toHaveLength(3);
  });

  it("routes hover hotkeys to the triage anchor for the matching section", () => {
    const onHotkeyTriage = vi.fn();
    renderStep({
      hotkeyBindings: {
        delegate: "d",
        reference: null,
        someday: "s",
        up: null,
        watch: "w",
      },
      onHotkeyTriage,
      sections: [
        {
          clockTargetTag: TEST_SETTINGS.tagSomeday,
          currentTag: TEST_SETTINGS.tagWaitingFor,
          items: [createTodo("todo-1")],
          key: "waiting",
        },
      ],
    });

    const row = root.querySelector("[data-row-uid='todo-1']");
    if (!row || row.tagName !== "DIV") {
      throw new Error("Row not found");
    }

    act(() => {
      row.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
    });

    act(() => {
      document.body.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "d" }),
      );
    });

    expect(onHotkeyTriage).toHaveBeenCalledWith(
      "todo-1",
      expect.objectContaining({ id: "gtd-unified-row-triage-todo-1" }),
      TEST_SETTINGS.tagWaitingFor,
    );
  });

  it("groups person-linked items separately from unassigned items", () => {
    const people: Array<PersonEntry> = [{ title: "Alice", uid: "person-1" }];
    renderStep({
      sections: [
        {
          clockTargetTag: TEST_SETTINGS.tagSomeday,
          currentTag: TEST_SETTINGS.tagWaitingFor,
          items: [createTodo("todo-1", "Unassigned"), createTodo("todo-2", "Assigned")],
          key: "waiting",
          personGrouping: {
            childPersonRefs: new Map([["todo-2", ["Alice"]]]),
            people,
          },
        },
      ],
    });

    expect(root.textContent).toContain("Alice");
    expect(root.textContent).toContain("Unassigned");
    expect(root.textContent).toContain("Assigned");
    expect(root.textContent).not.toContain("Watching");
  });
});
