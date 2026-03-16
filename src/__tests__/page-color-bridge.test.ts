import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { removePageColorBridge, syncPageColorBridge } from "../components/PageColorBridge";

const PAGE_COLOR_BRIDGE_STYLE_ID = "gtd-page-color-bridge";

describe("PageColorBridge", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    removePageColorBridge();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("bridges scoped Roam selectors and keeps repeated syncs stable", () => {
    Reflect.set(
      globalThis.window as object,
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    );
    Reflect.set(globalThis.window as object, "cancelAnimationFrame", vi.fn());

    const sourceStyle = document.createElement("style");
    sourceStyle.textContent = `
      .roam-body-main .rm-page-ref[data-link-title="Foo"] .rm-page-ref--link { color: red; }
      .roam-body-main .rm-alias { font-weight: 700; }
      .unrelated-selector { color: blue; }
    `;
    document.head.append(sourceStyle);

    syncPageColorBridge();

    const bridgeStyle = document.getElementById(PAGE_COLOR_BRIDGE_STYLE_ID);
    if (!bridgeStyle || bridgeStyle.tagName !== "STYLE") {
      throw new Error("Bridge style not created");
    }

    const firstContent = bridgeStyle.textContent ?? "";
    expect(firstContent).toContain('.rm-page-ref[data-link-title="Foo"] .rm-page-ref--link');
    expect(firstContent).toContain(".rm-alias");
    expect(firstContent).not.toContain(".roam-body-main");
    expect(firstContent).not.toContain(".unrelated-selector");

    syncPageColorBridge();

    expect(document.querySelectorAll(`#${PAGE_COLOR_BRIDGE_STYLE_ID}`)).toHaveLength(1);
    expect(bridgeStyle.textContent).toBe(firstContent);
  });

  it("cancels a pending sync and removes the bridge style", () => {
    const cancelAnimationFrame = vi.fn();
    Reflect.set(
      globalThis.window as object,
      "requestAnimationFrame",
      vi.fn(() => 42),
    );
    Reflect.set(globalThis.window as object, "cancelAnimationFrame", cancelAnimationFrame);

    const bridgeStyle = document.createElement("style");
    bridgeStyle.id = PAGE_COLOR_BRIDGE_STYLE_ID;
    document.head.append(bridgeStyle);

    syncPageColorBridge();
    removePageColorBridge();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(document.getElementById(PAGE_COLOR_BRIDGE_STYLE_ID)).toBeNull();
  });
});
