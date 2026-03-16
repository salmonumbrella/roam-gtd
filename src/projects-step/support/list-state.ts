import type { ProjectSummary } from "../../types";

export function getProjectsReviewCounterPosition(
  reviewedCount: number,
  totalProjects: number,
): number {
  if (totalProjects <= 0) {
    return 0;
  }
  return Math.min(reviewedCount + 1, totalProjects);
}

export function getProjectsReviewState(
  projects: Array<ProjectSummary>,
  dismissedUids: ReadonlySet<string>,
): {
  allDismissed: boolean;
  reviewedCount: number;
  visibleProjects: Array<ProjectSummary>;
} {
  const visibleProjects = projects.filter((project) => !dismissedUids.has(project.pageUid));
  return {
    allDismissed: visibleProjects.length === 0,
    reviewedCount: projects.length - visibleProjects.length,
    visibleProjects,
  };
}

export function getDismissedProjectUidsAfterDismiss(
  dismissedUids: Set<string>,
  projectUid: string,
): Set<string> {
  if (dismissedUids.has(projectUid)) {
    return dismissedUids;
  }
  const next = new Set(dismissedUids);
  next.add(projectUid);
  return next;
}

export function getMountedProjectPageUids(args: {
  visibleProjects: Array<Pick<ProjectSummary, "pageUid">>;
}): Set<string> {
  const { visibleProjects } = args;
  return new Set(visibleProjects.map((project) => project.pageUid));
}

export function getProjectsReviewVisibleRowCount(
  currentVisibleRows: number,
  totalRows: number,
  rowBatchSize: number,
): number {
  if (totalRows <= 0) {
    return 0;
  }
  return Math.min(totalRows, currentVisibleRows + rowBatchSize);
}

export function shouldAutoExpandProjectsReviewRows(args: {
  clientHeight: number;
  renderedProjectCount: number;
  scrollHeight: number;
  scrollThresholdPx: number;
  totalVisibleProjects: number;
}): boolean {
  const {
    clientHeight,
    renderedProjectCount,
    scrollHeight,
    scrollThresholdPx,
    totalVisibleProjects,
  } = args;
  if (renderedProjectCount >= totalVisibleProjects) {
    return false;
  }
  if (clientHeight <= 0) {
    return false;
  }
  return scrollHeight <= clientHeight + scrollThresholdPx;
}
