import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WeeklyReviewRoamBlock,
  type WeeklyReviewRoamBlockHandle,
} from "../components/WeeklyReviewRoamBlock";

describe("WeeklyReviewRoamBlock", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;
  let renderBlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    renderBlock = vi.fn(({ el, uid }: { el: HTMLElement; uid: string }) => {
      el.innerHTML = `
        <div class="rm-block-main" data-rendered-uid="${uid}">
          <div class="rm-block__input">${uid}</div>
        </div>
      `;
    });

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
    dom.window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0)) as typeof dom.window.requestAnimationFrame;
    dom.window.cancelAnimationFrame = ((handle: number) =>
      dom.window.clearTimeout(handle)) as typeof dom.window.cancelAnimationFrame;
    Reflect.set(globalThis.window as object, "roamAlphaAPI", {
      data: {
        pull: vi.fn(() => null),
      },
      ui: {
        components: {
          renderBlock,
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

  it("shows a skeleton until Roam renders the block content", async () => {
    act(() => {
      ReactDOM.render(React.createElement(WeeklyReviewRoamBlock, { uid: "todo-1" }), root);
    });

    expect(root.querySelector(".gtd-skeleton")).not.toBeNull();

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(renderBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "todo-1",
      }),
    );
    expect(root.querySelector(".rm-block-main")).not.toBeNull();
    expect(root.querySelector(".gtd-skeleton")).toBeNull();
  });

  it("focusEditor focuses an existing input and moves the caret to the end", async () => {
    renderBlock.mockImplementation(({ el, uid }: { el: HTMLElement; uid: string }) => {
      el.innerHTML = `
        <div class="rm-block-main" data-rendered-uid="${uid}">
          <textarea class="rm-block-input">${uid} body</textarea>
        </div>
      `;
    });

    const blockRef = React.createRef<WeeklyReviewRoamBlockHandle>();

    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewRoamBlock, { ref: blockRef, uid: "todo-2" }),
        root,
      );
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    const input = root.querySelector("textarea.rm-block-input") as HTMLTextAreaElement;
    expect(input).not.toBeNull();

    act(() => {
      expect(blockRef.current?.focusEditor()).toBe(true);
      vi.runAllTimers();
    });

    expect(dom.window.document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("calls onBlurOutside when focus leaves the rendered block", async () => {
    renderBlock.mockImplementation(({ el, uid }: { el: HTMLElement; uid: string }) => {
      el.innerHTML = `
        <div class="rm-block-main" data-rendered-uid="${uid}">
          <textarea class="rm-block-input">${uid} body</textarea>
        </div>
      `;
    });

    const onBlurOutside = vi.fn();

    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewRoamBlock, { onBlurOutside, uid: "todo-3" }),
        root,
      );
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    const input = root.querySelector("textarea.rm-block-input") as HTMLTextAreaElement;
    const outsideButton = dom.window.document.createElement("button");
    dom.window.document.body.append(outsideButton);

    act(() => {
      input.dispatchEvent(
        new dom.window.FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: outsideButton,
        }),
      );
    });

    expect(onBlurOutside).not.toHaveBeenCalled();

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(onBlurOutside).toHaveBeenCalledTimes(1);
    expect(onBlurOutside).toHaveBeenCalledWith("todo-3");
  });

  it("cancelPendingFocus stops a queued focus cycle before it mutates the rendered block", async () => {
    const focusSpy = vi.fn();
    renderBlock.mockImplementation(({ el, uid }: { el: HTMLElement; uid: string }) => {
      el.innerHTML = `
        <div class="rm-block-main" data-rendered-uid="${uid}">
          <div class="rm-block__input">${uid}</div>
        </div>
      `;
      const input = el.querySelector(".rm-block__input");
      if (input) {
        Object.defineProperty(input, "focus", {
          configurable: true,
          value: focusSpy,
        });
      }
    });

    const blockRef = React.createRef<WeeklyReviewRoamBlockHandle>();

    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewRoamBlock, { ref: blockRef, uid: "todo-4" }),
        root,
      );
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    act(() => {
      expect(blockRef.current?.focusEditor()).toBe(true);
      blockRef.current?.cancelPendingFocus();
      vi.runAllTimers();
    });

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("cleans up a pending focus cycle when the uid changes", async () => {
    const blockRef = React.createRef<WeeklyReviewRoamBlockHandle>();

    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewRoamBlock, { ref: blockRef, uid: "todo-5" }),
        root,
      );
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    const staleInput = root.querySelector(".rm-block__input") as HTMLDivElement;
    const staleFocusSpy = vi.fn();
    let staleClickCount = 0;

    Object.defineProperty(staleInput, "focus", {
      configurable: true,
      value: staleFocusSpy,
    });
    staleInput.addEventListener("click", () => {
      staleClickCount += 1;
    });

    act(() => {
      expect(blockRef.current?.focusEditor()).toBe(true);
      vi.runOnlyPendingTimers();
    });

    expect(staleFocusSpy).toHaveBeenCalledTimes(2);
    expect(staleClickCount).toBe(2);

    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewRoamBlock, { ref: blockRef, uid: "todo-6" }),
        root,
      );
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(staleFocusSpy).toHaveBeenCalledTimes(2);
    expect(staleClickCount).toBe(2);
    expect(renderBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "todo-6",
      }),
    );
  });

  it("shows a skeleton only for the first render when preserving previous content across uid changes", async () => {
    const pendingRenders = new Map<string, () => void>();
    renderBlock.mockImplementation(({ el, uid }: { el: HTMLElement; uid: string }) => {
      pendingRenders.set(uid, () => {
        el.innerHTML = `
          <div class="rm-block-main" data-rendered-uid="${uid}">
            <div class="rm-block__input">${uid}</div>
          </div>
        `;
      });
    });

    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewRoamBlock, {
          loadingPlaceholderMode: "initial-only",
          preservePreviousContentOnUidChange: true,
          uid: "todo-7",
        }),
        root,
      );
    });

    expect(root.querySelector(".gtd-skeleton")).not.toBeNull();

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    act(() => {
      pendingRenders.get("todo-7")?.();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(root.textContent).toContain("todo-7");
    expect(root.querySelector(".gtd-skeleton")).toBeNull();

    act(() => {
      ReactDOM.render(
        React.createElement(WeeklyReviewRoamBlock, {
          loadingPlaceholderMode: "initial-only",
          preservePreviousContentOnUidChange: true,
          uid: "todo-8",
        }),
        root,
      );
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(root.textContent).toContain("todo-7");
    expect(root.textContent).not.toContain("todo-8");
    expect(root.querySelector(".gtd-skeleton")).toBeNull();

    act(() => {
      pendingRenders.get("todo-8")?.();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(root.textContent).not.toContain("todo-7");
    expect(root.textContent).toContain("todo-8");
  });
});
