import type { ProjectSummary } from "../types";
import {
  getNextProjectKeyboardControl,
  getProjectTodoHotkeyAction,
  getTopProjectKeyboardAction,
  type ProjectKeyboardControl,
  type ProjectTodoHotkeyBindings,
} from "./support";

export type ProjectsStepKeyboardCommand =
  | { type: "noop" }
  | { nextControl: ProjectKeyboardControl; type: "moveTopControl" }
  | { project: ProjectSummary; type: "createTodo" }
  | { todoUid: string; type: "focusTodo" }
  | {
      action: ReturnType<typeof getProjectTodoHotkeyAction> extends infer T
        ? Exclude<T, null>
        : never;
      project: ProjectSummary;
      type: "todoHotkey";
    }
  | { focusAfter: ProjectKeyboardControl; project: ProjectSummary; type: "dismissTopProject" };

interface ProjectsStepKeyboardArgs {
  activeTopProjectControl: ProjectKeyboardControl | null;
  altKey: boolean;
  ctrlKey: boolean;
  detailOpen: boolean;
  hotkeyBindings: ProjectTodoHotkeyBindings;
  isEditableTarget: boolean;
  isInsideRoot: boolean;
  isInsideStatusMenu: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  topProject: ProjectSummary | null;
  visibleProjects: Array<ProjectSummary>;
}

interface ProjectsStepTopControlKeyArgs {
  activeControl: ProjectKeyboardControl;
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  project: ProjectSummary | null;
  shiftKey: boolean;
}

export function getProjectsStepKeyboardCommand({
  activeTopProjectControl,
  altKey,
  ctrlKey,
  detailOpen,
  hotkeyBindings,
  isEditableTarget,
  isInsideRoot,
  isInsideStatusMenu,
  key,
  metaKey,
  shiftKey,
  topProject,
  visibleProjects,
}: ProjectsStepKeyboardArgs): ProjectsStepKeyboardCommand {
  if (detailOpen) {
    return { type: "noop" };
  }

  if ((metaKey || ctrlKey) && !altKey && !shiftKey && (key === "Enter" || key === "NumpadEnter")) {
    if (isEditableTarget) {
      return { type: "noop" };
    }
    const commandAction = getTopProjectKeyboardAction(visibleProjects);
    if (!commandAction) {
      return { type: "noop" };
    }
    if (commandAction.type === "createTodo") {
      return {
        project: visibleProjects[0],
        type: "createTodo",
      };
    }
    return {
      todoUid: commandAction.todoUid,
      type: "focusTodo",
    };
  }

  const hotkeyAction =
    !metaKey && !ctrlKey && !altKey ? getProjectTodoHotkeyAction(key, hotkeyBindings) : null;
  if (hotkeyAction) {
    if (isEditableTarget || isInsideStatusMenu || !topProject) {
      return { type: "noop" };
    }
    return {
      action: hotkeyAction,
      project: topProject,
      type: "todoHotkey",
    };
  }

  if (key === "Tab" && !metaKey && !ctrlKey && !altKey) {
    if (isEditableTarget || isInsideStatusMenu) {
      return { type: "noop" };
    }
    if (!isInsideRoot && activeTopProjectControl == null) {
      return { type: "noop" };
    }
    return {
      nextControl: getNextProjectKeyboardControl(
        activeTopProjectControl,
        shiftKey ? "backward" : "forward",
      ),
      type: "moveTopControl",
    };
  }

  if (
    key === "e" &&
    !metaKey &&
    !ctrlKey &&
    !altKey &&
    !isEditableTarget &&
    !isInsideStatusMenu &&
    topProject
  ) {
    return {
      focusAfter: "status",
      project: topProject,
      type: "dismissTopProject",
    };
  }

  return { type: "noop" };
}

export function getProjectsStepTopControlKeyCommand({
  activeControl,
  altKey,
  ctrlKey,
  key,
  metaKey,
  project,
  shiftKey,
}: ProjectsStepTopControlKeyArgs): ProjectsStepKeyboardCommand {
  if (key === "Tab" && !metaKey && !ctrlKey && !altKey) {
    return {
      nextControl: getNextProjectKeyboardControl(activeControl, shiftKey ? "backward" : "forward"),
      type: "moveTopControl",
    };
  }

  if (
    activeControl === "dismiss" &&
    (key === "Enter" || key === " ") &&
    !metaKey &&
    !ctrlKey &&
    !altKey &&
    project
  ) {
    return {
      focusAfter: "status",
      project,
      type: "dismissTopProject",
    };
  }

  return { type: "noop" };
}
