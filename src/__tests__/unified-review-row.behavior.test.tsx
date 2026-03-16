import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnifiedReviewRow } from "../components/UnifiedReviewRow";
import type { GtdSettings } from "../settings";
import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";
import {
  createWeeklyReviewRoamBlockHarness,
  type WeeklyReviewRoamBlockHarness,
} from "./helpers/weekly-review-roam-block-harness";

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

function createSettings(overrides: Partial<GtdSettings> = {}): GtdSettings {
  return {
    ...TEST_SETTINGS,
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

function flushScheduledWork(): void {
  act(() => {
    vi.runAllTimers();
  });
}

function getHarness(harness: WeeklyReviewRoamBlockHarness | null): WeeklyReviewRoamBlockHarness {
  if (!harness) {
    throw new Error("WeeklyReviewRoamBlockHarness was not initialized");
  }
  return harness;
}

describe("UnifiedReviewRow behavior", () => {
  let harness: WeeklyReviewRoamBlockHarness | null = null;
  let root: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      const mountedRoot = root;
      act(() => {
        ReactDOM.unmountComponentAtNode(mountedRoot);
      });
      mountedRoot.remove();
      root = null;
    }

    harness?.cleanup();
    harness = null;
  });

  function renderUnifiedReviewRow({
    item = createTodo(),
    settings = createSettings(),
  }: {
    item?: TodoItem;
    settings?: GtdSettings;
  } = {}) {
    harness = createWeeklyReviewRoamBlockHarness();
    const container = document.createElement("div");
    root = container;
    document.body.append(container);

    const onItemProcessed = vi.fn();
    const onOpenInSidebar = vi.fn();
    const onOpenTriage = vi.fn();

    act(() => {
      ReactDOM.render(
        React.createElement(UnifiedReviewRow, {
          clockTargetTag: settings.tagSomeday,
          currentTag: settings.tagWaitingFor,
          item,
          onItemProcessed,
          onOpenInSidebar,
          onOpenTriage,
          settings,
          t,
        }),
        container,
      );
    });

    flushScheduledWork();

    return {
      container,
      item,
      onItemProcessed,
      onOpenInSidebar,
      onOpenTriage,
      settings,
    };
  }

  it("shows the loading skeleton and hides stale metadata until the block is ready", () => {
    const { container } = renderUnifiedReviewRow({
      item: createTodo({ ageDays: 9 }),
    });

    expect(container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(container.querySelector(".roam-gtd-unified-row__stale")).toBeNull();
    expect(container.querySelector(".roam-gtd-tooltip")).toBeNull();
  });

  it("reveals age metadata only after the embedded block reports ready", async () => {
    const item = createTodo({ ageDays: 9 });
    const { container } = renderUnifiedReviewRow({ item });

    await getHarness(harness).publishReady(item.uid);

    expect(container.querySelector(".gtd-skeleton")).toBeNull();
    expect(findButton(container, ".roam-gtd-unified-row__stale").textContent).toBe("9 days");
    expect(container.querySelector(".roam-gtd-tooltip")?.textContent).toBe(item.pageTitle);
  });

  it("marks the age badge overdue when the item age meets the stale-day threshold", async () => {
    const item = createTodo({ ageDays: 9 });
    const { container } = renderUnifiedReviewRow({
      item,
      settings: createSettings({ staleDays: 9 }),
    });

    await getHarness(harness).publishReady(item.uid);

    expect(findButton(container, ".roam-gtd-unified-row__stale").className).toContain(
      "roam-gtd-unified-row__stale--overdue",
    );
  });

  it("keeps the age badge non-overdue when the item age stays below the stale-day threshold", async () => {
    const item = createTodo({ ageDays: 8 });
    const { container } = renderUnifiedReviewRow({
      item,
      settings: createSettings({ staleDays: 9 }),
    });

    await getHarness(harness).publishReady(item.uid);

    expect(findButton(container, ".roam-gtd-unified-row__stale").className).not.toContain(
      "roam-gtd-unified-row__stale--overdue",
    );
  });

  it("opens the sidebar from the stale metadata button after the row is ready", async () => {
    const item = createTodo({ uid: "todo-sidebar" });
    const { container, onOpenInSidebar } = renderUnifiedReviewRow({ item });

    await getHarness(harness).publishReady(item.uid);

    act(() => {
      findButton(container, ".roam-gtd-unified-row__stale").click();
    });

    expect(onOpenInSidebar).toHaveBeenCalledWith(item.uid);
  });
});
