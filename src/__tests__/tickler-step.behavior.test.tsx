import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TicklerStep } from "../components/TicklerStep";
import type { TicklerGroup, TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "actionActivate":
      return "Activate";
    case "actionSomeday":
      return "Someday";
    case "actionTakeAction":
      return "Take action";
    case "ageDays":
      return `${args[0]} days`;
    case "step7Title":
      return "Tickler";
    default:
      return key;
  }
}

function createTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Tickler",
    text: "{{[[TODO]]}} Follow up",
    uid: "todo-1",
    ...overrides,
  };
}

describe("TicklerStep behavior", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;
  let renderBlock: ReturnType<typeof vi.fn>;
  let renderedTextByUid: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    renderedTextByUid = new Map<string, string>();
    renderBlock = vi.fn(({ el, uid }: { el: HTMLElement; uid: string }) => {
      const text = renderedTextByUid.get(uid) ?? `Rendered ${uid}`;
      el.innerHTML = `
        <div class="rm-block-main" data-rendered-uid="${uid}">
          <div class="rm-block__input">${text}</div>
        </div>
      `;
    });

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("FocusEvent", dom.window.FocusEvent);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
    vi.stubGlobal("Node", dom.window.Node);

    dom.window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0)) as typeof dom.window.requestAnimationFrame;
    dom.window.cancelAnimationFrame = ((handle: number) =>
      dom.window.clearTimeout(handle)) as typeof dom.window.cancelAnimationFrame;

    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        data: {
          pull: vi.fn(() => null),
        },
        ui: {
          components: {
            renderBlock,
          },
        },
      },
      roamjs: {
        extension: {
          workbench: {
            refreshAttributeSelect: vi.fn(),
          },
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  async function flushScheduledWork(): Promise<void> {
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });
  }

  async function renderTicklerStep(
    props: Partial<React.ComponentProps<typeof TicklerStep>> = {},
  ): Promise<void> {
    const allProps: React.ComponentProps<typeof TicklerStep> = {
      activeDetailPageUid: null,
      groups: [],
      onItemProcessed: vi.fn(),
      onOpenDetail: vi.fn(),
      onOpenInSidebar: vi.fn(),
      onPromoteToNext: vi.fn(),
      settings: TEST_SETTINGS,
      t,
      ...props,
    };

    act(() => {
      ReactDOM.render(React.createElement(TicklerStep, allProps), root);
    });

    await flushScheduledWork();
  }

  it("renders grouped tickler output through the step DOM once row content is ready", async () => {
    const groups: Array<TicklerGroup> = [
      {
        dailyPageUid: "page-1",
        dailyTitle: "March 10th, 2026",
        items: [createTodo({ ageDays: 3, uid: "todo-1" })],
      },
      {
        dailyPageUid: "page-2",
        dailyTitle: "March 11th, 2026",
        items: [createTodo({ ageDays: 5, uid: "todo-2" })],
      },
    ];

    renderedTextByUid.set("todo-1", "Renew passport");
    renderedTextByUid.set("todo-2", "Book flights");

    await renderTicklerStep({ groups });

    const headings = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".roam-gtd-person-header-button"),
    ).map((button) => button.textContent?.trim());

    expect(root.querySelector('[data-roam-gtd-workflow-scroll="true"]')).not.toBeNull();
    expect(headings).toEqual(["March 10th, 2026", "March 11th, 2026"]);
    expect(root.textContent).toContain("Renew passport");
    expect(root.textContent).toContain("Book flights");
    expect(root.textContent).toContain("3 days");
    expect(root.textContent).toContain("5 days");
    expect(root.querySelectorAll(".roam-gtd-unified-row")).toHaveLength(2);
  });

  it("requests the clicked detail page uid and switches into the active detail page surface", async () => {
    const groups: Array<TicklerGroup> = [
      {
        dailyPageUid: "page-1",
        dailyTitle: "March 10th, 2026",
        items: [createTodo({ ageDays: 3, uid: "todo-1" })],
      },
      {
        dailyPageUid: "page-2",
        dailyTitle: "March 11th, 2026",
        items: [createTodo({ ageDays: 5, uid: "todo-2" })],
      },
    ];

    renderedTextByUid.set("todo-1", "Renew passport");
    renderedTextByUid.set("todo-2", "Book flights");
    renderedTextByUid.set("page-2", "Detail page for March 11th, 2026");
    const onOpenDetail = vi.fn();

    await renderTicklerStep({ groups, onOpenDetail });

    expect(root.querySelector(".gtd-project-detail-panel")).toBeNull();
    expect(root.textContent).toContain("Renew passport");
    expect(root.textContent).toContain("March 10th, 2026");
    expect(onOpenDetail).not.toHaveBeenCalled();

    const detailButtons = root.querySelectorAll<HTMLButtonElement>(
      ".roam-gtd-person-header-button",
    );

    act(() => {
      detailButtons[1]?.click();
    });

    expect(onOpenDetail).toHaveBeenCalledWith("page-2");

    await renderTicklerStep({
      activeDetailPageUid: "page-2",
      groups,
      onOpenDetail,
    });

    expect(root.querySelector('[data-roam-gtd-workflow-scroll="true"]')).toBeNull();
    expect(root.querySelector(".roam-gtd-unified-row")).toBeNull();
    expect(root.querySelector(".gtd-project-detail-panel")).not.toBeNull();
    expect(root.querySelector(".gtd-project-detail-page .rm-block__input")?.textContent).toBe(
      "Detail page for March 11th, 2026",
    );
    expect(root.textContent).not.toContain("Renew passport");
    expect(root.textContent).not.toContain("March 10th, 2026");
  });
});
