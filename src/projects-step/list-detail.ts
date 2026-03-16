import type { ProjectSummary } from "../types";

export interface ProjectsStepListDetailState {
  pendingFocusUid: string | null;
  returnFocusPageUid: string | null;
}

export type ProjectsStepFocusResolution =
  | { type: "none" }
  | { acknowledgeExternal: boolean; requestedUid: string; type: "clearRequest" }
  | { minVisibleRowCount: number; requestedUid: string; type: "expandRows" }
  | { acknowledgeExternal: boolean; requestedUid: string; type: "focusTodo" };

export function getProjectsStepRequestedFocusUid({
  focusRequestUid = null,
  pendingFocusUid,
}: {
  focusRequestUid?: string | null;
  pendingFocusUid: string | null;
}): string | null {
  return focusRequestUid ?? pendingFocusUid;
}

export function getProjectsStepDetailProject({
  detailProjectPageUid,
  projects,
  visibleProjects,
}: {
  detailProjectPageUid: string | null;
  projects: Array<ProjectSummary>;
  visibleProjects: Array<ProjectSummary>;
}): ProjectSummary | null {
  if (detailProjectPageUid == null) {
    return null;
  }
  const visibleProject = visibleProjects.find(
    (project) => project.pageUid === detailProjectPageUid,
  );
  if (visibleProject) {
    return visibleProject;
  }
  // Preserve detail during transient refreshes even if the selected project
  // temporarily falls out of the visible list.
  return projects.find((project) => project.pageUid === detailProjectPageUid) ?? null;
}

export function openProjectsStepDetail(
  state: ProjectsStepListDetailState,
  project: Pick<ProjectSummary, "pageUid">,
): ProjectsStepListDetailState {
  return {
    ...state,
    returnFocusPageUid: project.pageUid,
  };
}

export function clearProjectsStepReturnFocus(
  state: ProjectsStepListDetailState,
): ProjectsStepListDetailState {
  if (state.returnFocusPageUid == null) {
    return state;
  }
  return {
    ...state,
    returnFocusPageUid: null,
  };
}

export function requestProjectsStepTodoFocus(
  state: ProjectsStepListDetailState,
  todoUid: string,
): ProjectsStepListDetailState {
  return {
    ...state,
    pendingFocusUid: todoUid,
  };
}

export function clearProjectsStepPendingFocus(
  state: ProjectsStepListDetailState,
  requestedUid: string,
): ProjectsStepListDetailState {
  if (state.pendingFocusUid !== requestedUid) {
    return state;
  }
  return {
    ...state,
    pendingFocusUid: null,
  };
}

export function getProjectsStepReturnFocusPageUid({
  detailProjectPageUid,
  returnFocusPageUid,
  visibleProjects,
}: {
  detailProjectPageUid: string | null;
  returnFocusPageUid: string | null;
  visibleProjects: Array<Pick<ProjectSummary, "pageUid">>;
}): string | null {
  if (detailProjectPageUid != null || returnFocusPageUid == null) {
    return null;
  }
  return visibleProjects.some((project) => project.pageUid === returnFocusPageUid)
    ? returnFocusPageUid
    : null;
}

export function resolveProjectsStepFocusResolution({
  focusRequestUid = null,
  mountedProjectPageUids,
  pendingFocusUid = null,
  visibleProjects,
}: {
  focusRequestUid?: string | null;
  mountedProjectPageUids: ReadonlySet<string>;
  pendingFocusUid?: string | null;
  visibleProjects: Array<ProjectSummary>;
}): ProjectsStepFocusResolution {
  const requestedUid = getProjectsStepRequestedFocusUid({ focusRequestUid, pendingFocusUid });
  if (!requestedUid) {
    return { type: "none" };
  }
  const targetProjectIndex = visibleProjects.findIndex(
    (project) => project.lastTodoUid === requestedUid,
  );
  if (targetProjectIndex < 0) {
    return {
      acknowledgeExternal: requestedUid === focusRequestUid,
      requestedUid,
      type: "clearRequest",
    };
  }
  const targetProject = visibleProjects[targetProjectIndex];
  if (!mountedProjectPageUids.has(targetProject.pageUid)) {
    return {
      minVisibleRowCount: targetProjectIndex + 1,
      requestedUid,
      type: "expandRows",
    };
  }
  return {
    acknowledgeExternal: requestedUid === focusRequestUid,
    requestedUid,
    type: "focusTodo",
  };
}
