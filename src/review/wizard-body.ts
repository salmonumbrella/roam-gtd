import type { PersonEntry } from "../people";
import type { ProjectOption } from "../triage/support";
import type { TicklerGroup, TodoItem } from "../types";
import { isWorkflowReviewStepKey, type WizardStepKey } from "./wizard-support";
import type { ActiveWorkflowTriageState } from "./wizard-workflow-triage";

function filterOptimisticallyHiddenItems<T extends { uid: string }>(
  items: Array<T>,
  hiddenUids: Set<string>,
): Array<T> {
  if (hiddenUids.size === 0) {
    return items;
  }
  return items.filter((item) => !hiddenUids.has(item.uid));
}

export interface ReviewWizardVisibleCollections {
  bodyVisibleDelegatedItems: Array<TodoItem>;
  bodyVisibleItems: Array<TodoItem>;
  bodyVisibleWaitingItems: Array<TodoItem>;
  visibleDelegatedItems: Array<TodoItem>;
  visibleItems: Array<TodoItem>;
}

export function getReviewWizardVisibleCollections(args: {
  bodyDelegatedItems: Array<TodoItem>;
  bodyItems: Array<TodoItem>;
  bodyWaitingItems: Array<TodoItem>;
  delegatedItems: Array<TodoItem>;
  hiddenUids: Set<string>;
  items: Array<TodoItem>;
}): ReviewWizardVisibleCollections {
  const { bodyDelegatedItems, bodyItems, bodyWaitingItems, delegatedItems, hiddenUids, items } =
    args;

  return {
    bodyVisibleDelegatedItems: filterOptimisticallyHiddenItems(bodyDelegatedItems, hiddenUids),
    bodyVisibleItems: filterOptimisticallyHiddenItems(bodyItems, hiddenUids),
    bodyVisibleWaitingItems: filterOptimisticallyHiddenItems(bodyWaitingItems, hiddenUids),
    visibleDelegatedItems: filterOptimisticallyHiddenItems(delegatedItems, hiddenUids),
    visibleItems: filterOptimisticallyHiddenItems(items, hiddenUids),
  };
}

export interface ReviewWizardWorkflowPopoverState {
  initialPeople: Array<PersonEntry>;
  initialProjects: Array<ProjectOption>;
  triage: ActiveWorkflowTriageState;
  triageUid: string;
  x: number;
  y: number;
}

export function getReviewWizardWorkflowPopoverState(args: {
  activeWorkflowTriage: ActiveWorkflowTriageState | null;
  bodyStepKey: WizardStepKey;
  triagePeople: Array<PersonEntry>;
  triageProjects: Array<ProjectOption>;
  workflowTriagePosition: { left: number; top: number };
}): ReviewWizardWorkflowPopoverState | null {
  const {
    activeWorkflowTriage,
    bodyStepKey,
    triagePeople,
    triageProjects,
    workflowTriagePosition,
  } = args;
  if (!isWorkflowReviewStepKey(bodyStepKey) || activeWorkflowTriage == null) {
    return null;
  }

  return {
    initialPeople: triagePeople,
    initialProjects: triageProjects,
    triage: activeWorkflowTriage,
    triageUid: activeWorkflowTriage.item.uid,
    x: workflowTriagePosition.left,
    y: workflowTriagePosition.top,
  };
}

export function getTicklerGroupItemCount(groups: Array<TicklerGroup>): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}
