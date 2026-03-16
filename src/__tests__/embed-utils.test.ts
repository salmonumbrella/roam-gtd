import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hideTagReferenceInEmbed, normalizeTagReference } from "../embed-utils";

describe("embed tag helpers", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM("<div></div>");
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("normalizes hashes, brackets, casing, and non-breaking spaces", () => {
    expect(normalizeTagReference("  #[[Wa\u00a0tch]]  ")).toBe("wa tch");
  });

  it("hides matching tag references and removes the preceding hash marker", () => {
    const container = dom.window.document.createElement("div");
    container.innerHTML = 'Follow up #<span class="rm-page-ref rm-page-ref--tag">Watch</span> soon';

    hideTagReferenceInEmbed(container, "watch");

    const tag = container.querySelector("span");
    expect(tag?.getAttribute("style")).toContain("display: none");
    expect(container.textContent).toBe("Follow up Watch soon");
    expect(tag?.previousSibling?.textContent).toBe("Follow up ");
  });

  it("hides hash-prefixed page refs even without a dedicated tag class", () => {
    const container = dom.window.document.createElement("div");
    container.innerHTML = 'Queue #<a class="rm-page-ref">Up</a> next';

    hideTagReferenceInEmbed(container, "up");

    const tag = container.querySelector("a");
    expect(tag?.getAttribute("style")).toContain("display: none");
    expect(tag?.previousSibling?.textContent).toBe("Queue ");
  });

  it("leaves non-tag references alone when they are not hash-prefixed", () => {
    const container = dom.window.document.createElement("div");
    container.innerHTML = '<span class="rm-page-ref">Watch</span> list';

    hideTagReferenceInEmbed(container, "watch");

    const tag = container.querySelector("span");
    expect(tag?.getAttribute("style") ?? "").not.toContain("display: none");
    expect(container.textContent).toBe("Watch list");
  });
});
