import type { TranslatorFn } from "../i18n";
import type { GtdState } from "../store";
import { formatNamespacedPageDisplayTitle } from "../triage/support";
import type { ProjectSummary, TodoItem } from "../types";

const WORKFLOW_TRIAGE_POPOVER_WIDTH_PX = 220;
const WORKFLOW_TRIAGE_POPOVER_OFFSET_PX = 4;
const WORKFLOW_PREFETCH_REMAINING_ITEMS = 2;
const PROJECTS_REFRESH_COOLDOWN_MS = 30_000;
const BACK_HALF_REFRESH_COOLDOWN_MS = 30_000;

export type ReviewWizardMode = "daily" | "weekly";

export type WizardStepKey =
  | "inbox"
  | "projects"
  | "upcoming"
  | "waitingDelegated"
  | "someday"
  | "triggerList"
  | "tickler"
  | "stats";

export interface WizardStep {
  description: string;
  key: WizardStepKey;
  title: string;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function isWorkflowReviewStepKey(stepKey: WizardStepKey): boolean {
  return stepKey === "upcoming" || stepKey === "waitingDelegated" || stepKey === "someday";
}

export function getWorkflowTriagePopoverPosition(args: {
  anchorRect: Pick<DOMRect, "bottom" | "right">;
  containerRect: Pick<DOMRect, "left" | "top">;
  containerWidth: number;
}): { left: number; top: number } {
  const { anchorRect, containerRect, containerWidth } = args;
  const maxLeft = Math.max(containerWidth - WORKFLOW_TRIAGE_POPOVER_WIDTH_PX, 0);
  return {
    left: Math.max(
      0,
      Math.min(
        maxLeft,
        anchorRect.right - containerRect.left - WORKFLOW_TRIAGE_POPOVER_WIDTH_PX + 4,
      ),
    ),
    top: Math.max(0, anchorRect.bottom - containerRect.top + WORKFLOW_TRIAGE_POPOVER_OFFSET_PX),
  };
}

export function getPrimaryForwardLabelKey(
  stepKey: WizardStepKey,
  isLastStep: boolean,
): "finish" | "nextItem" | "nextStep" {
  if (isLastStep) {
    return "finish";
  }
  if (stepKey === "inbox") {
    return "nextItem";
  }
  return "nextStep";
}

export function getProjectsDetailChromeState(isDetailOpen: boolean): {
  backAction: "closeDetail" | "wizard";
  showPrimaryForward: boolean;
  showProjectHotkeys: boolean;
  showStepFastForward: boolean;
} {
  if (isDetailOpen) {
    return {
      backAction: "closeDetail",
      showPrimaryForward: false,
      showProjectHotkeys: false,
      showStepFastForward: false,
    };
  }
  return {
    backAction: "wizard",
    showPrimaryForward: true,
    showProjectHotkeys: true,
    showStepFastForward: true,
  };
}

export function getProjectsStepForwardState(args: {
  isDetailOpen: boolean;
  remainingProjects: number;
}): {
  action: "advanceStep" | "hidden" | "reviewTopProject";
  intent: "default" | "primary";
  labelKey: "next" | "nextStep";
} {
  if (args.isDetailOpen) {
    return {
      action: "hidden",
      intent: "default",
      labelKey: "next",
    };
  }
  if (args.remainingProjects > 0) {
    return {
      action: "reviewTopProject",
      intent: "default",
      labelKey: "next",
    };
  }
  return {
    action: "advanceStep",
    intent: "primary",
    labelKey: "nextStep",
  };
}

export function shouldShowStepFastForwardButton(
  isLastStep: boolean,
  canFastForwardStep: boolean,
): boolean {
  return canFastForwardStep && !isLastStep;
}

export function getProjectsDetailDialogTitle(
  baseTitle: string,
  projectPageTitle: string | null | undefined,
): string {
  const trimmedTitle = projectPageTitle?.trim() ?? "";
  const displayTitle = formatNamespacedPageDisplayTitle(trimmedTitle) || trimmedTitle;
  return displayTitle ? `Project: ${displayTitle}` : baseTitle;
}

export function shouldShowInboxZeroLoading(
  inboxBootstrapping: boolean,
  visibleInboxCount: number,
): boolean {
  return inboxBootstrapping && visibleInboxCount === 0;
}

export function shouldPrefetchProjectsFromInbox(
  inboxBootstrapping: boolean,
  inboxIndex: number,
  visibleInboxCount: number,
): boolean {
  if (inboxBootstrapping || visibleInboxCount <= 0) {
    return false;
  }
  const remainingItems = visibleInboxCount - (inboxIndex + 1);
  return remainingItems <= 1;
}

export function shouldPrefetchWorkflowForStep(
  stepKey: WizardStepKey,
  inboxIndex: number,
  visibleInboxCount: number,
): boolean {
  if (stepKey === "inbox") {
    const remainingItems = visibleInboxCount - (inboxIndex + 1);
    return remainingItems <= WORKFLOW_PREFETCH_REMAINING_ITEMS;
  }

  return (
    stepKey === "projects" ||
    stepKey === "upcoming" ||
    stepKey === "waitingDelegated" ||
    stepKey === "someday" ||
    stepKey === "triggerList" ||
    stepKey === "tickler" ||
    stepKey === "stats"
  );
}

export function shouldShowTicklerStep(date = new Date()): boolean {
  return date.getDate() <= 7;
}

export function shouldRefreshProjectsForStep(
  stepKey: WizardStepKey,
  projectsHydrated: boolean,
  projectsLoadedAt: number | null | undefined,
  now = Date.now(),
  cooldownMs = PROJECTS_REFRESH_COOLDOWN_MS,
): boolean {
  if (
    stepKey !== "projects" &&
    stepKey !== "waitingDelegated" &&
    stepKey !== "someday" &&
    stepKey !== "triggerList" &&
    stepKey !== "tickler" &&
    stepKey !== "stats"
  ) {
    return false;
  }

  if (!projectsHydrated || projectsLoadedAt == null) {
    return true;
  }

  return now - projectsLoadedAt >= cooldownMs;
}

export function shouldRefreshBackHalfForStep(
  stepKey: WizardStepKey,
  backHalfHydrated: boolean,
  backHalfLoadedAt: number | null | undefined,
  now = Date.now(),
  cooldownMs = BACK_HALF_REFRESH_COOLDOWN_MS,
): boolean {
  if (
    stepKey !== "upcoming" &&
    stepKey !== "someday" &&
    stepKey !== "triggerList" &&
    stepKey !== "tickler" &&
    stepKey !== "stats"
  ) {
    return false;
  }

  if (!backHalfHydrated || backHalfLoadedAt == null) {
    return true;
  }

  return now - backHalfLoadedAt >= cooldownMs;
}

export function applyOptimisticProjectTodo(
  project: ProjectSummary,
  todoUid: string,
  createdAt = Date.now(),
  todoListUid = project.todoListUid,
): ProjectSummary {
  const nextTodoCount = Math.max(1, project.todoCount + 1);
  return {
    ...project,
    lastTodoCreatedTime: createdAt,
    lastTodoText: "{{[[TODO]]}} ",
    lastTodoUid: todoUid,
    todoCount: nextTodoCount,
    todoListUid,
    totalCount: Math.max(project.totalCount ?? 0, project.todoCount) + 1,
  };
}

export function dropOptimisticProjectTodoByUid(
  optimisticProjectTodos: Record<string, ProjectSummary>,
  todoUid: string,
): {
  changed: boolean;
  nextOptimisticProjectTodos: Record<string, ProjectSummary>;
} {
  const currentEntries = Object.entries(optimisticProjectTodos);
  if (currentEntries.length === 0) {
    return { changed: false, nextOptimisticProjectTodos: optimisticProjectTodos };
  }

  const nextOptimisticProjectTodos: Record<string, ProjectSummary> = {};
  let changed = false;

  for (const [pageUid, project] of currentEntries) {
    if (project.lastTodoUid === todoUid) {
      changed = true;
      continue;
    }
    nextOptimisticProjectTodos[pageUid] = project;
  }

  if (!changed) {
    return { changed: false, nextOptimisticProjectTodos: optimisticProjectTodos };
  }

  return { changed: true, nextOptimisticProjectTodos };
}

export function shouldRefreshProjectsAfterDismiss(
  optimisticProjectTodos: Record<string, ProjectSummary>,
  projectUid: string,
): boolean {
  return Boolean(optimisticProjectTodos[projectUid]);
}

export function getReviewProgressValue({
  inboxCurrent,
  inboxTotal,
  projectsReviewed,
  projectsTotal,
  stepCount,
  stepIndex,
  stepKey,
}: {
  inboxCurrent: number;
  inboxTotal: number;
  projectsReviewed: number;
  projectsTotal: number;
  stepCount: number;
  stepIndex: number;
  stepKey: WizardStepKey;
}): number {
  void projectsReviewed;
  void projectsTotal;
  void stepKey;
  if (stepCount <= 0) {
    return 0;
  }
  if (stepCount === 1) {
    return inboxTotal > 0 ? clampProgress(inboxCurrent / inboxTotal) : 0;
  }
  return clampProgress(stepIndex / (stepCount - 1));
}

export function getSteps(
  t: TranslatorFn,
  mode: ReviewWizardMode = "weekly",
  now = new Date(),
): Array<WizardStep> {
  if (mode === "daily") {
    return [{ description: t("step1Desc"), key: "inbox", title: t("dailyReviewTitle") }];
  }

  const allSteps: Array<WizardStep> = [
    { description: t("step1Desc"), key: "inbox", title: t("step1Title") },
    { description: t("step2Desc"), key: "projects", title: t("step2Title") },
    { description: t("step3Desc"), key: "upcoming", title: t("step3Title") },
    { description: t("step4Desc"), key: "waitingDelegated", title: t("step4Title") },
    { description: t("step5Desc"), key: "someday", title: t("step5Title") },
    { description: t("step6Desc"), key: "triggerList", title: t("step6Title") },
    { description: t("step7Desc"), key: "tickler", title: t("step7Title") },
    { description: t("step8Desc"), key: "stats", title: t("step8Title") },
  ];

  if (!shouldShowTicklerStep(now)) {
    return allSteps.filter((step) => step.key !== "tickler");
  }

  return allSteps;
}

export function getItemsForStep(state: GtdState, stepKey: WizardStepKey): Array<TodoItem> {
  switch (stepKey) {
    case "inbox":
      return state.inbox;
    case "upcoming":
      return [...state.nextActions].sort((a, b) => b.ageDays - a.ageDays);
    case "someday":
      return state.someday;
    case "waitingDelegated":
      return [...state.delegated, ...state.waitingFor];
    case "projects":
    case "triggerList":
    case "tickler":
    case "stats":
      return [];
  }
}
