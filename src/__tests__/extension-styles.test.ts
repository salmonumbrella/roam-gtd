// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { GTD_STYLES, mountExtensionStyles } from "../extension/styles";

describe("extension styles", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("mounts the shared GTD styles into document.head", () => {
    const styleElement = mountExtensionStyles();

    expect(styleElement.tagName).toBe("STYLE");
    expect(styleElement.id).toBe("roam-gtd-styles");
    expect(styleElement.textContent).toBe(GTD_STYLES);
    expect(document.head.lastElementChild).toBe(styleElement);
  });

  it("defines GTD theme bridge tokens with Mocharydecker-friendly fallbacks", () => {
    expect(GTD_STYLES).toContain(":root {");
    expect(GTD_STYLES).toContain(
      "--roam-gtd-surface: var(--color-right-sidebar-background, #2e2e2e);",
    );
    expect(GTD_STYLES).toContain("--roam-gtd-text: var(--ctp-text, #cdd6f4);");
    expect(GTD_STYLES).toContain("--roam-gtd-shadow-medium: var(--shadow-medium,");
    expect(GTD_STYLES).toContain(
      "--roam-gtd-review-dialog-height: var(--roam-gtd-theme-review-dialog-height, 520px);",
    );
    expect(GTD_STYLES).toContain("--roam-gtd-skeleton-duration: 1.35s;");
  });

  it("uses GTD tokens instead of hardcoded dialog and popover literals", () => {
    expect(GTD_STYLES).toContain("background: var(--roam-gtd-surface);");
    expect(GTD_STYLES).toContain("color: var(--roam-gtd-text);");
    expect(GTD_STYLES).toContain("height: var(--roam-gtd-review-dialog-height);");
    expect(GTD_STYLES).toContain("padding: var(--roam-gtd-space-10) var(--roam-gtd-space-12);");
    expect(GTD_STYLES).toContain("border-radius: var(--roam-gtd-radius-md);");
    expect(GTD_STYLES).toContain("box-shadow: var(--roam-gtd-shadow-medium);");
    expect(GTD_STYLES).toContain("transition: opacity var(--roam-gtd-transition-fast);");
  });
});
