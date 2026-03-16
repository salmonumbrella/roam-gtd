import { describe, expect, it } from "vitest";

import {
  clearProjectsStepPendingFocus,
  clearProjectsStepReturnFocus,
  getProjectsStepDetailProject,
  getProjectsStepRequestedFocusUid,
  getProjectsStepReturnFocusPageUid,
  openProjectsStepDetail,
  requestProjectsStepTodoFocus,
  resolveProjectsStepFocusResolution,
} from "../projects-step/list-detail";
import type { ProjectSummary } from "../types";

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

describe("projects-step list detail helpers", () => {
  it("opens detail from the preview click path and remembers the return-focus target", () => {
    const nextState = openProjectsStepDetail(
      { pendingFocusUid: null, returnFocusPageUid: null },
      makeProject({ pageUid: "project-42" }),
    );

    expect(nextState).toEqual({
      pendingFocusUid: null,
      returnFocusPageUid: "project-42",
    });
  });

  it("resolves the current detail project from visible projects and falls back during transient refresh", () => {
    const visibleProject = makeProject({ pageUid: "project-visible" });
    const hiddenDuringRefresh = makeProject({ pageUid: "project-hidden" });

    expect(
      getProjectsStepDetailProject({
        detailProjectPageUid: visibleProject.pageUid,
        projects: [visibleProject, hiddenDuringRefresh],
        visibleProjects: [visibleProject],
      }),
    ).toBe(visibleProject);

    expect(
      getProjectsStepDetailProject({
        detailProjectPageUid: hiddenDuringRefresh.pageUid,
        projects: [visibleProject, hiddenDuringRefresh],
        visibleProjects: [visibleProject],
      }),
    ).toBe(hiddenDuringRefresh);
  });

  it("closes detail cleanly when the selected project disappears entirely", () => {
    expect(
      getProjectsStepDetailProject({
        detailProjectPageUid: "missing-project",
        projects: [makeProject()],
        visibleProjects: [makeProject()],
      }),
    ).toBeNull();
  });

  it("clears the return-focus target after the step restores focus", () => {
    expect(
      clearProjectsStepReturnFocus({
        pendingFocusUid: null,
        returnFocusPageUid: "project-42",
      }),
    ).toEqual({
      pendingFocusUid: null,
      returnFocusPageUid: null,
    });
  });

  it("clears dead focus requests instead of looping forever", () => {
    const nextState = clearProjectsStepPendingFocus(
      {
        pendingFocusUid: "todo-42",
        returnFocusPageUid: null,
      },
      "todo-42",
    );

    expect(nextState.pendingFocusUid).toBeNull();
    expect(getProjectsStepRequestedFocusUid({ focusRequestUid: null, pendingFocusUid: null })).toBe(
      null,
    );
  });

  it("keeps return-focus inert when the project disappears after dismiss and preserves create-todo focus requests", () => {
    const project = makeProject({ pageUid: "project-42" });
    const createTodoState = requestProjectsStepTodoFocus(
      openProjectsStepDetail({ pendingFocusUid: null, returnFocusPageUid: null }, project),
      "todo-new",
    );

    expect(getProjectsStepRequestedFocusUid(createTodoState)).toBe("todo-new");
    expect(
      getProjectsStepReturnFocusPageUid({
        detailProjectPageUid: null,
        returnFocusPageUid: createTodoState.returnFocusPageUid,
        visibleProjects: [],
      }),
    ).toBeNull();
  });

  it("signals when a valid focus target exists but the row has not mounted yet", () => {
    const targetProject = makeProject({ lastTodoUid: "todo-42", pageUid: "project-42" });

    expect(
      resolveProjectsStepFocusResolution({
        focusRequestUid: "todo-42",
        mountedProjectPageUids: new Set(),
        pendingFocusUid: null,
        visibleProjects: [targetProject],
      }),
    ).toEqual({
      minVisibleRowCount: 1,
      requestedUid: "todo-42",
      type: "expandRows",
    });

    expect(
      resolveProjectsStepFocusResolution({
        focusRequestUid: "todo-42",
        mountedProjectPageUids: new Set(["project-42"]),
        pendingFocusUid: null,
        visibleProjects: [targetProject],
      }),
    ).toEqual({
      acknowledgeExternal: true,
      requestedUid: "todo-42",
      type: "focusTodo",
    });
  });
});
