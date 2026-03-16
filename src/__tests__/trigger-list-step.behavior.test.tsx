import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TriggerListStep } from "../components/TriggerListStep";

describe("TriggerListStep behavior", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;
  let queryPageUid: ReturnType<typeof vi.fn>;
  let renderBlock: ReturnType<typeof vi.fn>;
  let refreshAttributeSelect: ReturnType<typeof vi.fn>;
  let renderedTextByUid: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    queryPageUid = vi.fn();
    refreshAttributeSelect = vi.fn();
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
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
    vi.stubGlobal("Node", dom.window.Node);

    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        data: {
          q: queryPageUid,
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
            refreshAttributeSelect,
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

  function renderTriggerListStep(pageName = "Trigger List"): void {
    act(() => {
      ReactDOM.render(React.createElement(TriggerListStep, { pageName }), root);
    });
  }

  it("shows the rendered fallback for the requested page when the trigger list page does not exist", () => {
    const pageName = "Custom Trigger List";
    queryPageUid.mockReturnValue([]);

    renderTriggerListStep(pageName);

    expect(queryPageUid).toHaveBeenCalledWith(expect.any(String), pageName);
    expect(root.textContent).toContain(
      `Page [[${pageName}]] not found. Create it in Roam to use the trigger list.`,
    );
    expect(root.querySelector(".roam-gtd-trigger-list")).toBeNull();
    expect(root.querySelector(".rm-block-main")).toBeNull();
  });

  it("shows the real trigger list step surface for the requested page when it exists", async () => {
    const pageName = "Startup Trigger List";
    queryPageUid.mockReturnValue([["page-uid"]]);
    renderedTextByUid.set("page-uid", "Mind sweep prompts");

    renderTriggerListStep(pageName);

    expect(queryPageUid).toHaveBeenCalledWith(expect.any(String), pageName);
    expect(root.querySelector(".roam-gtd-trigger-list")).not.toBeNull();
    expect(root.querySelector(".gtd-skeleton")).not.toBeNull();

    await flushScheduledWork();

    expect(root.querySelector(".roam-gtd-trigger-list .gtd-skeleton")).toBeNull();
    expect(root.querySelector(".roam-gtd-trigger-list .rm-block-main")).not.toBeNull();
    expect(root.querySelector(".roam-gtd-trigger-list .rm-block__input")?.textContent).toBe(
      "Mind sweep prompts",
    );
  });
});
