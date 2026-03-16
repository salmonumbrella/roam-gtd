import type { GtdSettings } from "../../settings";
import { hasWorkflowTag } from "../../tag-utils";
import type { ProjectSummary } from "../../types";

export type ProjectKeyboardControl = "dismiss" | "status";
export type ProjectTodoHotkeyAction = "delegate" | "reference" | "someday" | "up" | "watch";

export interface ProjectTodoHotkeyBindings {
  delegate: string;
  reference: string | null;
  someday: string;
  up: string | null;
  watch: string;
}

function getNormalizedKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function getNextProjectKeyboardControl(
  current: ProjectKeyboardControl | null,
  direction: "backward" | "forward",
): ProjectKeyboardControl {
  if (current == null) {
    return direction === "backward" ? "dismiss" : "status";
  }
  return current === "status" ? "dismiss" : "status";
}

export function getTopProjectKeyboardAction(
  visibleProjects: Array<ProjectSummary>,
): { projectUid: string; type: "createTodo" } | { todoUid: string; type: "focusTodo" } | null {
  const topProject = visibleProjects[0];
  if (!topProject) {
    return null;
  }
  if (!topProject.lastTodoUid) {
    return { projectUid: topProject.pageUid, type: "createTodo" };
  }
  return { todoUid: topProject.lastTodoUid, type: "focusTodo" };
}

export function getProjectTodoCurrentTag(blockString: string, settings: GtdSettings): string {
  if (hasWorkflowTag(blockString, settings.tagNextAction)) {
    return settings.tagNextAction;
  }
  if (hasWorkflowTag(blockString, settings.tagWaitingFor)) {
    return settings.tagWaitingFor;
  }
  if (hasWorkflowTag(blockString, settings.tagDelegated)) {
    return settings.tagDelegated;
  }
  if (hasWorkflowTag(blockString, settings.tagSomeday)) {
    return settings.tagSomeday;
  }
  return "";
}

export function getProjectTodoHotkeyAction(
  key: string,
  bindings: ProjectTodoHotkeyBindings,
): ProjectTodoHotkeyAction | null {
  const normalizedKey = getNormalizedKey(key);
  if (normalizedKey === bindings.watch) {
    return "watch";
  }
  if (normalizedKey === bindings.delegate) {
    return "delegate";
  }
  if (normalizedKey === bindings.someday) {
    return "someday";
  }
  if (bindings.up && normalizedKey === bindings.up) {
    return "up";
  }
  if (bindings.reference && normalizedKey === bindings.reference) {
    return "reference";
  }
  return null;
}
