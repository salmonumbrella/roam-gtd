import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WeeklyReviewNativeBlock } from "../components/WeeklyReviewNativeBlock";

describe("WeeklyReviewNativeBlock behavior", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;
  let renderBlock: ReturnType<typeof vi.fn>;
  let refreshAttributeSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    renderBlock = vi.fn(({ el, uid }: { el: HTMLElement; uid: string }) => {
      el.innerHTML = `<div class="rendered-block" data-uid="${uid}"></div>`;
    });
    refreshAttributeSelect = vi.fn();

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);

    Object.assign(globalThis.window, {
      roamAlphaAPI: {
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

  it("renders the block, refreshes attribute selects, and clears the container on unmount", async () => {
    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewNativeBlock, { open: true, uid: "todo-1" }),
        root,
      );
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(renderBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        el: expect.any(HTMLElement),
        open: true,
        uid: "todo-1",
      }),
    );
    expect(refreshAttributeSelect).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".rendered-block")).not.toBeNull();

    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });

    expect(root.innerHTML).toBe("");
  });

  it("re-inserts unprocessed attribute refs when relevant mutations appear", async () => {
    act(() => {
      ReactDOM.render(React.createElement(WeeklyReviewNativeBlock, { uid: "todo-2" }), root);
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    // The rendered block content goes in the inner container div (not the outer wrapper)
    const container = root.querySelector(".rendered-block")?.parentElement as HTMLDivElement | null;
    if (!container) {
      throw new Error("Missing native block container");
    }

    const wrapper = dom.window.document.createElement("div");
    const attrRef = dom.window.document.createElement("span");
    attrRef.className = "rm-attr-ref";
    container.append(wrapper);

    const removeChildSpy = vi.spyOn(wrapper, "removeChild");
    const insertBeforeSpy = vi.spyOn(wrapper, "insertBefore");

    await act(async () => {
      wrapper.append(attrRef);
      await Promise.resolve();
    });

    expect(removeChildSpy).toHaveBeenCalledWith(attrRef);
    expect(insertBeforeSpy).toHaveBeenCalled();
  });
});
