import { describe, expect, it } from "vitest";

import {
  getProjectsStepKeyboardCommand,
  getProjectsStepTopControlKeyCommand,
} from "../projects-step/keyboard";
import type { ProjectSummary } from "../types";

const HOTKEY_BINDINGS = {
  delegate: "d",
  reference: "r",
  someday: "s",
  up: "u",
  watch: "w",
} as const;

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    doneCount: 0,
    lastDoneTime: null,
    lastTodoCreatedTime: 1,
    lastTodoText: "{{[[TODO]]}} Project todo",
    lastTodoUid: "todo-1",
    pageTitle: "Project:: Launch release",
    pageUid: "project-1",
    statusBlockUid: null,
    statusText: null,
    todoCount: 1,
    todoListUid: "list-1",
    totalCount: 1,
    ...overrides,
  };
}

describe("projects-step keyboard routing", () => {
  it("routes Tab between the top status and dismiss controls", () => {
    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: "status",
        altKey: false,
        ctrlKey: false,
        detailOpen: false,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: false,
        isInsideRoot: true,
        isInsideStatusMenu: false,
        key: "Tab",
        metaKey: false,
        shiftKey: false,
        topProject: makeProject(),
        visibleProjects: [makeProject()],
      }),
    ).toEqual({
      nextControl: "dismiss",
      type: "moveTopControl",
    });

    expect(
      getProjectsStepTopControlKeyCommand({
        activeControl: "dismiss",
        altKey: false,
        ctrlKey: false,
        key: "Tab",
        metaKey: false,
        project: makeProject(),
        shiftKey: true,
      }),
    ).toEqual({
      nextControl: "status",
      type: "moveTopControl",
    });
  });

  it("routes Cmd/Ctrl+Enter to focus the top todo or create a missing one", () => {
    const projectWithTodo = makeProject();
    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: null,
        altKey: false,
        ctrlKey: false,
        detailOpen: false,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: false,
        isInsideRoot: true,
        isInsideStatusMenu: false,
        key: "Enter",
        metaKey: true,
        shiftKey: false,
        topProject: projectWithTodo,
        visibleProjects: [projectWithTodo],
      }),
    ).toEqual({
      todoUid: "todo-1",
      type: "focusTodo",
    });

    const projectWithoutTodo = makeProject({
      lastTodoCreatedTime: null,
      lastTodoText: null,
      lastTodoUid: null,
      todoCount: 0,
    });
    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: null,
        altKey: false,
        ctrlKey: true,
        detailOpen: false,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: false,
        isInsideRoot: true,
        isInsideStatusMenu: false,
        key: "Enter",
        metaKey: false,
        shiftKey: false,
        topProject: projectWithoutTodo,
        visibleProjects: [projectWithoutTodo],
      }),
    ).toEqual({
      project: projectWithoutTodo,
      type: "createTodo",
    });
  });

  it("routes workflow hotkeys for the top project", () => {
    const project = makeProject();

    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: null,
        altKey: false,
        ctrlKey: false,
        detailOpen: false,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: false,
        isInsideRoot: true,
        isInsideStatusMenu: false,
        key: "w",
        metaKey: false,
        shiftKey: false,
        topProject: project,
        visibleProjects: [project],
      }),
    ).toEqual({
      action: "watch",
      project,
      type: "todoHotkey",
    });
  });

  it("routes dismiss shortcuts and dismiss-button selection", () => {
    const project = makeProject();

    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: null,
        altKey: false,
        ctrlKey: false,
        detailOpen: false,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: false,
        isInsideRoot: true,
        isInsideStatusMenu: false,
        key: "e",
        metaKey: false,
        shiftKey: false,
        topProject: project,
        visibleProjects: [project],
      }),
    ).toEqual({
      focusAfter: "status",
      project,
      type: "dismissTopProject",
    });

    expect(
      getProjectsStepTopControlKeyCommand({
        activeControl: "dismiss",
        altKey: false,
        ctrlKey: false,
        key: "Enter",
        metaKey: false,
        project,
        shiftKey: false,
      }),
    ).toEqual({
      focusAfter: "status",
      project,
      type: "dismissTopProject",
    });
  });

  it("stays inert in detail mode, editable targets, and missing-target states", () => {
    const project = makeProject();

    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: null,
        altKey: false,
        ctrlKey: false,
        detailOpen: true,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: false,
        isInsideRoot: true,
        isInsideStatusMenu: false,
        key: "w",
        metaKey: false,
        shiftKey: false,
        topProject: project,
        visibleProjects: [project],
      }),
    ).toEqual({ type: "noop" });

    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: null,
        altKey: false,
        ctrlKey: false,
        detailOpen: false,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: true,
        isInsideRoot: true,
        isInsideStatusMenu: false,
        key: "Tab",
        metaKey: false,
        shiftKey: false,
        topProject: project,
        visibleProjects: [project],
      }),
    ).toEqual({ type: "noop" });

    expect(
      getProjectsStepKeyboardCommand({
        activeTopProjectControl: null,
        altKey: false,
        ctrlKey: false,
        detailOpen: false,
        hotkeyBindings: HOTKEY_BINDINGS,
        isEditableTarget: false,
        isInsideRoot: false,
        isInsideStatusMenu: false,
        key: "Tab",
        metaKey: false,
        shiftKey: false,
        topProject: null,
        visibleProjects: [],
      }),
    ).toEqual({ type: "noop" });
  });
});
