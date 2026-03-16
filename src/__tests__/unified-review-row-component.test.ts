import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

const { archiveBlock, getWorkflowTags, renderWeeklyReviewRoamBlock, replaceTags } = vi.hoisted(
  () => ({
    archiveBlock: vi.fn(() => Promise.resolve()),
    getWorkflowTags: vi.fn(() => ["up", "watch", "delegated", "someday"]),
    renderWeeklyReviewRoamBlock: vi.fn(
      ({
        onContentReady,
        suppressChildControlNavigation,
        uid,
      }: {
        onContentReady?: () => void;
        suppressChildControlNavigation?: boolean;
        uid: string;
      }) => {
        // eslint-disable-next-line react-hooks/exhaustive-deps -- test mock, fire once on mount
        React.useEffect(() => {
          onContentReady?.();
        }, [onContentReady]);
        return React.createElement(
          "div",
          {
            "data-rendered-uid": uid,
            "data-suppress-child-control-navigation":
              suppressChildControlNavigation == null
                ? "unset"
                : String(suppressChildControlNavigation),
          },
          uid,
        );
      },
    ),
    replaceTags: vi.fn(() => Promise.resolve(true)),
  }),
);

vi.mock("../review/actions", () => ({
  archiveBlock,
  removeTagFormsBatch: (text: string) => text,
  replaceTags,
  stripTodoStatusMarkers: (text: string) => text.replace("{{[[TODO]]}} ", ""),
}));

vi.mock("../unified-triage-flow", () => ({
  getWorkflowTags,
}));

vi.mock("../components/WeeklyReviewRoamBlock", () => ({
  WeeklyReviewRoamBlock: renderWeeklyReviewRoamBlock,
}));

import { UnifiedReviewRow } from "../components/UnifiedReviewRow";

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "actionArchive":
      return "Archive";
    case "actionKeep":
      return "Keep";
    case "actionSomeday":
      return "Someday";
    case "actionTakeAction":
      return "Take action";
    case "ageDays":
      return `${args[0]} days`;
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

function findButton(root: HTMLElement, selector: string): HTMLButtonElement {
  const button = root.querySelector(selector);
  if (!button || button.tagName !== "BUTTON") {
    throw new Error(`Button not found for selector: ${selector}`);
  }
  return button as HTMLButtonElement;
}

describe("UnifiedReviewRow", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
    archiveBlock.mockClear();
    getWorkflowTags.mockClear();
    replaceTags.mockClear();
    replaceTags.mockResolvedValue(true);
    renderWeeklyReviewRoamBlock.mockClear();
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  function renderRow(overrides: Partial<React.ComponentProps<typeof UnifiedReviewRow>> = {}) {
    const onItemProcessed = vi.fn();
    const onOpenInSidebar = vi.fn();
    const onOpenTriage = vi.fn();
    const item = createTodo();

    act(() => {
      ReactDOM.render(
        React.createElement(UnifiedReviewRow, {
          clockTargetTag: TEST_SETTINGS.tagSomeday,
          currentTag: TEST_SETTINGS.tagWaitingFor,
          item,
          onItemProcessed,
          onOpenInSidebar,
          onOpenTriage,
          settings: TEST_SETTINGS,
          t,
          ...overrides,
        }),
        root,
      );
    });

    return { item, onItemProcessed, onOpenInSidebar, onOpenTriage };
  }

  it("opens triage and the sidebar from the row controls", () => {
    const { item, onOpenInSidebar, onOpenTriage } = renderRow();

    act(() => {
      findButton(root, ".bp3-icon-arrow-up").click();
    });

    expect(onOpenTriage).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTag: TEST_SETTINGS.tagWaitingFor,
        item,
      }),
    );
    const triageRequest = onOpenTriage.mock.calls[0]?.[0];
    expect(triageRequest.anchorElement.tagName).toBe("BUTTON");

    act(() => {
      findButton(root, ".roam-gtd-unified-row__stale").click();
    });

    expect(onOpenInSidebar).toHaveBeenCalledWith(item.uid);
    expect(root.textContent).toContain(item.pageTitle);
  });

  it("disables child-control suppression for workflow rows", () => {
    renderRow();

    expect(renderWeeklyReviewRoamBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        suppressChildControlNavigation: false,
      }),
      expect.anything(),
    );
    expect(root.querySelector('[data-suppress-child-control-navigation="false"]')).not.toBeNull();
  });

  it("runs the primary action instead of opening triage when provided", async () => {
    const onPrimaryAction = vi.fn(() => Promise.resolve());
    const { item, onOpenTriage } = renderRow({ onPrimaryAction, primaryActionLabel: "Promote" });

    await act(async () => {
      findButton(root, ".bp3-icon-arrow-up").click();
      await Promise.resolve();
    });

    expect(onPrimaryAction).toHaveBeenCalledWith(item);
    expect(onOpenTriage).not.toHaveBeenCalled();
  });

  it("moves items to the clock target immediately", () => {
    const { onItemProcessed } = renderRow();

    act(() => {
      findButton(root, ".bp3-icon-time").click();
    });

    expect(getWorkflowTags).toHaveBeenCalledWith(TEST_SETTINGS);
    expect(replaceTags).toHaveBeenCalledWith(
      "todo-1",
      ["up", "watch", "delegated", "someday"],
      TEST_SETTINGS.tagSomeday,
    );
    expect(onItemProcessed).toHaveBeenCalledWith("todo-1", "someday");
    expect(root.innerHTML).toBe("");
  });

  it("warns when moving an item to someday fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    replaceTags.mockRejectedValueOnce(new Error("tag write failed"));

    renderRow();

    act(() => {
      findButton(root, ".bp3-icon-time").click();
    });

    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith("[RoamGTD] Tag replace failed:", expect.any(Error));
    warn.mockRestore();
  });

  it("supports keep and archive actions", async () => {
    const keep = renderRow({ clockIsKeep: true });

    act(() => {
      findButton(root, ".bp3-icon-time").click();
    });

    expect(keep.onItemProcessed).toHaveBeenCalledWith("todo-1", "keep");
    expect(replaceTags).not.toHaveBeenCalled();

    const archive = renderRow({ showArchiveAction: true });

    act(() => {
      findButton(root, ".bp3-icon-box").click();
    });

    expect(archiveBlock).toHaveBeenCalledWith("todo-1", ["up", "watch", "delegated", "someday"]);
    expect(archive.onItemProcessed).toHaveBeenCalledWith("todo-1", "done");
    expect(root.innerHTML).toBe("");
  });

  it("warns when archiving fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    archiveBlock.mockRejectedValueOnce(new Error("archive failed"));

    renderRow({ showArchiveAction: true });

    act(() => {
      findButton(root, ".bp3-icon-box").click();
    });

    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith("[RoamGTD] Archive write failed:", expect.any(Error));
    warn.mockRestore();
  });
});
