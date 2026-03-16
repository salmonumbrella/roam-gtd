import type { WizardStepKey } from "./wizard-support";

export type ReviewWizardFooterLabelKey =
  | "back"
  | "finish"
  | "next"
  | "nextItem"
  | "nextStep"
  | "previousItem"
  | "saveWeeklySummary"
  | "summarySaved";

export type ReviewWizardFooterActionId =
  | "back"
  | "forward"
  | "previousItem"
  | "saveSummaryAndClose";

export interface ReviewWizardFooterButton {
  action: ReviewWizardFooterActionId;
  disabled?: boolean;
  icon?: string;
  intent: "default" | "primary";
  kind: "button";
  labelKey: ReviewWizardFooterLabelKey;
}

export interface ReviewWizardFooterLegendSegment {
  color: string;
  text: string;
}

export interface ReviewWizardFooterState {
  leftAction: ReviewWizardFooterButton | null;
  rightAction: ReviewWizardFooterButton | null;
}

interface ProjectsForwardState {
  action: "advanceStep" | "hidden" | "reviewTopProject";
  intent: "default" | "primary";
  labelKey: "next" | "nextStep";
}

interface GetReviewWizardFooterStateArgs {
  activeDetailKind: "none" | "person" | "project" | "tickler";
  inboxAtEnd: boolean;
  inboxIndex: number;
  isInboxComplete: boolean;
  isInboxWithItems: boolean;
  isLastStep: boolean;
  primaryForwardLabelKey: "finish" | "nextItem" | "nextStep";
  projectsForwardState: ProjectsForwardState;
  savedSummary: boolean;
  showPrimaryForward: boolean;
  stepIndex: number;
  stepKey: WizardStepKey;
}

interface GetReviewWizardFooterLegendSegmentsArgs {
  delegateHotkey: string;
  projectHotkey: string;
  referenceHotkey: string | null;
  somedayHotkey: string;
  stepKey: WizardStepKey;
  upHotkey: string | null;
  watchHotkey: string;
}

export function getReviewWizardFooterState(
  args: GetReviewWizardFooterStateArgs,
): ReviewWizardFooterState {
  const leftAction: ReviewWizardFooterButton | null =
    args.activeDetailKind !== "none"
      ? {
          action: "back",
          intent: "default",
          kind: "button",
          labelKey: "back",
        }
      : args.stepIndex > 0
        ? {
            action: "back",
            intent: "default",
            kind: "button",
            labelKey: "back",
          }
        : args.isInboxWithItems && args.inboxIndex > 0
          ? {
              action: "previousItem",
              intent: "default",
              kind: "button",
              labelKey: "previousItem",
            }
          : null;

  if (
    (args.stepKey === "projects" && args.projectsForwardState.action === "hidden") ||
    !args.showPrimaryForward
  ) {
    return {
      leftAction,
      rightAction: null,
    };
  }

  if (args.stepKey === "stats") {
    return {
      leftAction,
      rightAction: {
        action: "saveSummaryAndClose",
        disabled: args.savedSummary,
        icon: "floppy-disk",
        intent: "primary",
        kind: "button",
        labelKey: args.savedSummary ? "summarySaved" : "saveWeeklySummary",
      },
    };
  }

  if (args.isInboxWithItems && !args.inboxAtEnd) {
    return {
      leftAction,
      rightAction: {
        action: "forward",
        intent: "default",
        kind: "button",
        labelKey: "nextItem",
      },
    };
  }

  const labelKey =
    args.stepKey === "projects"
      ? args.projectsForwardState.labelKey
      : args.inboxAtEnd && !args.isInboxComplete
        ? args.isLastStep
          ? "finish"
          : "nextStep"
        : args.primaryForwardLabelKey;

  return {
    leftAction,
    rightAction: {
      action: "forward",
      intent:
        args.stepKey === "projects" && args.projectsForwardState.intent === "default"
          ? "default"
          : "primary",
      kind: "button",
      labelKey,
    },
  };
}

export function getReviewWizardFooterLegendSegments(
  args: GetReviewWizardFooterLegendSegmentsArgs,
): Array<ReviewWizardFooterLegendSegment> | null {
  if (args.stepKey !== "inbox") {
    return null;
  }

  const segments: Array<ReviewWizardFooterLegendSegment> = [];
  if (args.upHotkey != null) {
    segments.push({ color: "#a6e3a1", text: args.upHotkey }, { color: "#A5A5A5", text: " up · " });
  }
  segments.push(
    { color: "#f9e2af", text: args.watchHotkey },
    { color: "#A5A5A5", text: " watch · " },
    { color: "#fab387", text: args.delegateHotkey },
    { color: "#A5A5A5", text: " delegate · " },
    { color: "#89b4fa", text: args.somedayHotkey },
    { color: "#A5A5A5", text: " someday · " },
    { color: "#94e2d5", text: args.projectHotkey },
    {
      color: "#A5A5A5",
      text: args.referenceHotkey != null ? " project · " : " project",
    },
  );
  if (args.referenceHotkey != null) {
    segments.push(
      { color: "#cba6f7", text: args.referenceHotkey },
      { color: "#A5A5A5", text: " reference" },
    );
  }
  return segments;
}
