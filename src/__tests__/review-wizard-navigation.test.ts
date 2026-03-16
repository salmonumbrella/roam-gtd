import { describe, expect, it } from "vitest";

import {
  getReviewWizardFooterLegendSegments,
  getReviewWizardFooterState,
} from "../review/wizard-navigation";

describe("review wizard navigation", () => {
  it("shows a previous-item action before step-level back on inbox history", () => {
    const footer = getReviewWizardFooterState({
      activeDetailKind: "none",
      inboxAtEnd: false,
      inboxIndex: 2,
      isInboxComplete: false,
      isInboxWithItems: true,
      isLastStep: false,
      primaryForwardLabelKey: "nextItem",
      projectsForwardState: {
        action: "advanceStep",
        intent: "primary",
        labelKey: "nextStep",
      },
      savedSummary: false,
      showPrimaryForward: true,
      stepIndex: 0,
      stepKey: "inbox",
    });

    expect(footer.leftAction).toEqual({
      action: "previousItem",
      intent: "default",
      kind: "button",
      labelKey: "previousItem",
    });
    expect(footer.rightAction).toEqual({
      action: "forward",
      intent: "default",
      kind: "button",
      labelKey: "nextItem",
    });
  });

  it("suppresses the primary forward action when a project detail surface is open", () => {
    const footer = getReviewWizardFooterState({
      activeDetailKind: "project",
      inboxAtEnd: true,
      inboxIndex: 0,
      isInboxComplete: false,
      isInboxWithItems: false,
      isLastStep: false,
      primaryForwardLabelKey: "nextStep",
      projectsForwardState: {
        action: "hidden",
        intent: "default",
        labelKey: "next",
      },
      savedSummary: false,
      showPrimaryForward: false,
      stepIndex: 1,
      stepKey: "projects",
    });

    expect(footer.leftAction?.labelKey).toBe("back");
    expect(footer.rightAction).toBeNull();
  });

  it("returns the summary save action for the dashboard step", () => {
    const footer = getReviewWizardFooterState({
      activeDetailKind: "none",
      inboxAtEnd: true,
      inboxIndex: 0,
      isInboxComplete: false,
      isInboxWithItems: false,
      isLastStep: true,
      primaryForwardLabelKey: "finish",
      projectsForwardState: {
        action: "advanceStep",
        intent: "primary",
        labelKey: "nextStep",
      },
      savedSummary: false,
      showPrimaryForward: true,
      stepIndex: 7,
      stepKey: "stats",
    });

    expect(footer.rightAction).toEqual({
      action: "saveSummaryAndClose",
      disabled: false,
      icon: "floppy-disk",
      intent: "primary",
      kind: "button",
      labelKey: "saveWeeklySummary",
    });
  });

  it("keeps the projects step forward action non-primary while projects remain", () => {
    const footer = getReviewWizardFooterState({
      activeDetailKind: "none",
      inboxAtEnd: true,
      inboxIndex: 0,
      isInboxComplete: false,
      isInboxWithItems: false,
      isLastStep: false,
      primaryForwardLabelKey: "nextStep",
      projectsForwardState: {
        action: "reviewTopProject",
        intent: "default",
        labelKey: "next",
      },
      savedSummary: false,
      showPrimaryForward: true,
      stepIndex: 1,
      stepKey: "projects",
    });

    expect(footer.rightAction).toEqual({
      action: "forward",
      intent: "default",
      kind: "button",
      labelKey: "next",
    });
  });

  it("builds the inbox hotkey legend segments from the current bindings", () => {
    expect(
      getReviewWizardFooterLegendSegments({
        delegateHotkey: "d",
        projectHotkey: "p",
        referenceHotkey: "r",
        somedayHotkey: "s",
        stepKey: "inbox",
        upHotkey: "u",
        watchHotkey: "w",
      }),
    ).toEqual([
      { color: "#a6e3a1", text: "u" },
      { color: "#A5A5A5", text: " up · " },
      { color: "#f9e2af", text: "w" },
      { color: "#A5A5A5", text: " watch · " },
      { color: "#fab387", text: "d" },
      { color: "#A5A5A5", text: " delegate · " },
      { color: "#89b4fa", text: "s" },
      { color: "#A5A5A5", text: " someday · " },
      { color: "#94e2d5", text: "p" },
      { color: "#A5A5A5", text: " project · " },
      { color: "#cba6f7", text: "r" },
      { color: "#A5A5A5", text: " reference" },
    ]);
  });
});
