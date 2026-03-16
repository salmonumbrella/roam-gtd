import { useCallback, useMemo, useState } from "react";

import {
  getDismissedProjectUidsAfterDismiss,
  getProjectTodoCurrentTag,
  persistProjectStatusChange,
  type ProjectTodoHotkeyAction,
} from "../projects-step/support";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import { hasWorkflowTag } from "../tag-utils";
import type { ProjectSummary } from "../types";
import { removeTagForms, removeTodoMarker, replaceTag } from "./actions";
import {
  getOrCreateProjectTodoListUid,
  getOrderedProjects,
  loadDismissedProjectUids,
  reconcileOptimisticProjectTodos,
  saveDismissedProjectUids,
} from "./wizard-runtime";
import { shouldRefreshProjectsAfterDismiss } from "./wizard-support";
import { applyOptimisticProjectTodo, dropOptimisticProjectTodoByUid } from "./wizard-support";

interface UseReviewWizardProjectDetailArgs {
  bodyProjects: Array<ProjectSummary>;
  settings: GtdSettings;
  stateProjects: Array<ProjectSummary>;
  store: ReturnType<typeof createGtdStore>;
}

interface ResolveReviewWizardProjectCollectionsArgs {
  bodyProjects: Array<ProjectSummary>;
  dismissedProjectUids: Set<string>;
  optimisticProjectTodos: Record<string, ProjectSummary>;
  projectDetailPageUid: string | null;
  stateProjects: Array<ProjectSummary>;
}

interface ReviewWizardProjectCollections {
  activeProjectDetail: ProjectSummary | null;
  bodyDisplayProjects: Array<ProjectSummary>;
  displayProjects: Array<ProjectSummary>;
  projectDetailPageUid: string | null;
  topProjectToReview: ProjectSummary | null;
  visibleProjectDetails: Array<ProjectSummary>;
}

const REVIEW_ACTION_REFRESH_DELAY_MS = 800;

function projectTodoBlockExists(uid: string): boolean {
  const data = window.roamAlphaAPI.data.pull("[:block/uid :block/string]", [":block/uid", uid]);
  if (!data?.[":block/uid"]) {
    return false;
  }
  const text = data[":block/string"] ?? "";
  return text.trim().length > 0;
}

export function resolveReviewWizardProjectCollections({
  bodyProjects,
  dismissedProjectUids,
  optimisticProjectTodos,
  projectDetailPageUid,
  stateProjects,
}: ResolveReviewWizardProjectCollectionsArgs): ReviewWizardProjectCollections {
  const displayProjectsResult = getOrderedProjects(stateProjects, optimisticProjectTodos, null);
  const bodyDisplayProjectsResult = getOrderedProjects(
    bodyProjects,
    optimisticProjectTodos,
    displayProjectsResult.projectOrder,
  );
  const displayProjects = displayProjectsResult.projects;
  const bodyDisplayProjects = bodyDisplayProjectsResult.projects;
  const visibleProjectDetails = displayProjects.filter(
    (project) => !dismissedProjectUids.has(project.pageUid),
  );
  const resolvedProjectDetailPageUid =
    projectDetailPageUid != null &&
    visibleProjectDetails.some((project) => project.pageUid === projectDetailPageUid)
      ? projectDetailPageUid
      : null;
  const activeProjectDetail =
    resolvedProjectDetailPageUid == null
      ? null
      : (visibleProjectDetails.find(
          (project) => project.pageUid === resolvedProjectDetailPageUid,
        ) ?? null);

  return {
    activeProjectDetail,
    bodyDisplayProjects,
    displayProjects,
    projectDetailPageUid: resolvedProjectDetailPageUid,
    topProjectToReview: visibleProjectDetails[0] ?? null,
    visibleProjectDetails,
  };
}

export function useReviewWizardProjectDetail({
  bodyProjects,
  settings,
  stateProjects,
  store,
}: UseReviewWizardProjectDetailArgs) {
  const [dismissedProjectUids, setDismissedProjectUids] = useState(loadDismissedProjectUids);
  const [optimisticProjectTodos, setOptimisticProjectTodos] = useState<
    Record<string, ProjectSummary>
  >({});
  const [projectFocusRequestUid, setProjectFocusRequestUid] = useState<string | null>(null);
  const [projectDetailPageUid, setProjectDetailPageUid] = useState<string | null>(null);
  const { nextFocusRequestUid, nextOptimisticProjectTodos: resolvedOptimisticProjectTodos } =
    useMemo(
      () =>
        reconcileOptimisticProjectTodos({
          focusRequestUid: projectFocusRequestUid,
          optimisticProjectTodos,
          projects: stateProjects,
        }),
      [optimisticProjectTodos, projectFocusRequestUid, stateProjects],
    );
  const {
    activeProjectDetail,
    bodyDisplayProjects,
    displayProjects,
    projectDetailPageUid: resolvedProjectDetailPageUid,
    topProjectToReview,
    visibleProjectDetails,
  } = useMemo(
    () =>
      resolveReviewWizardProjectCollections({
        bodyProjects,
        dismissedProjectUids,
        optimisticProjectTodos: resolvedOptimisticProjectTodos,
        projectDetailPageUid,
        stateProjects,
      }),
    [
      bodyProjects,
      dismissedProjectUids,
      projectDetailPageUid,
      resolvedOptimisticProjectTodos,
      stateProjects,
    ],
  );

  const resetProjectDetailState = useCallback(() => {
    setDismissedProjectUids(loadDismissedProjectUids());
    setOptimisticProjectTodos({});
    setProjectDetailPageUid(null);
    setProjectFocusRequestUid(null);
  }, []);

  const handleDismissProject = useCallback(
    (project: ProjectSummary) => {
      setDismissedProjectUids((current) => {
        const next = getDismissedProjectUidsAfterDismiss(current, project.pageUid);
        saveDismissedProjectUids(next);
        return next;
      });
      if (shouldRefreshProjectsAfterDismiss(resolvedOptimisticProjectTodos, project.pageUid)) {
        store.scheduleRefresh(settings, REVIEW_ACTION_REFRESH_DELAY_MS, { scope: "projects" });
      }
    },
    [resolvedOptimisticProjectTodos, settings, store],
  );

  const handleProjectStatusChange = useCallback((project: ProjectSummary, nextStatus: string) => {
    const trimmed = nextStatus.trim();
    const statusText = trimmed ? `#${trimmed.replace(/^#/, "")}` : null;
    setOptimisticProjectTodos((current) => ({
      ...current,
      [project.pageUid]: { ...project, statusText },
    }));
    void persistProjectStatusChange({
      createBlock: window.roamAlphaAPI.createBlock,
      newStatus: nextStatus,
      pageUid: project.pageUid,
      refreshDelayMs: 0,
      scheduleRefresh: () => {},
      statusBlockUid: project.statusBlockUid,
      updateBlock: window.roamAlphaAPI.updateBlock,
    });
    return true;
  }, []);

  const handleCreateProjectTodo = useCallback(async (project: ProjectSummary) => {
    const todoListUid = await getOrCreateProjectTodoListUid(project);
    const todoUid = window.roamAlphaAPI.util.generateUID();
    await window.roamAlphaAPI.createBlock({
      block: { string: "{{[[TODO]]}} ", uid: todoUid },
      location: { order: "last", "parent-uid": todoListUid },
    });
    setOptimisticProjectTodos((current) => ({
      ...current,
      [project.pageUid]: applyOptimisticProjectTodo(project, todoUid, Date.now(), todoListUid),
    }));
    setProjectFocusRequestUid(todoUid);
  }, []);

  const handleProjectTodoHotkeyAction = useCallback(
    async (action: ProjectTodoHotkeyAction, project: ProjectSummary) => {
      const todoUid = project.lastTodoUid;

      if (action === "delegate") {
        if (!todoUid) {
          await handleCreateProjectTodo(project);
          return;
        }
        setProjectFocusRequestUid(todoUid);
        return;
      }

      if (!todoUid) {
        return;
      }

      const latestText =
        window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", todoUid])?.[
          ":block/string"
        ] ??
        project.lastTodoText ??
        "";
      if (!latestText.trim()) {
        return;
      }

      if (action === "reference") {
        const nextText = latestText.replace(/\{\{\s*(?:\[\[\s*)?TODO(?:\s*\]\])?\s*\}\}\s*/iu, "");
        setOptimisticProjectTodos((current) => ({
          ...current,
          [project.pageUid]: {
            ...(current[project.pageUid] ?? project),
            lastTodoCreatedTime: Date.now(),
            lastTodoText: nextText,
            lastTodoUid: todoUid,
          },
        }));
        await removeTodoMarker(todoUid, latestText);
        return;
      }

      const nextTag =
        action === "watch"
          ? settings.tagWaitingFor
          : action === "someday"
            ? settings.tagSomeday
            : settings.tagNextAction;
      const currentTag = getProjectTodoCurrentTag(latestText, settings);
      const withoutCurrentTag = currentTag ? removeTagForms(latestText, currentTag) : latestText;
      const nextText = hasWorkflowTag(withoutCurrentTag, nextTag)
        ? withoutCurrentTag
        : `${withoutCurrentTag} #[[${nextTag}]]`.trim();
      setOptimisticProjectTodos((current) => ({
        ...current,
        [project.pageUid]: {
          ...(current[project.pageUid] ?? project),
          lastTodoCreatedTime: Date.now(),
          lastTodoText: nextText,
          lastTodoUid: todoUid,
        },
      }));
      await replaceTag(todoUid, currentTag, nextTag, latestText);
    },
    [handleCreateProjectTodo, settings],
  );

  const handleProjectTodoBlur = useCallback(
    (todoUid: string) => {
      if (projectTodoBlockExists(todoUid)) {
        return;
      }
      const { changed, nextOptimisticProjectTodos } = dropOptimisticProjectTodoByUid(
        resolvedOptimisticProjectTodos,
        todoUid,
      );
      if (!changed) {
        return;
      }
      setOptimisticProjectTodos(nextOptimisticProjectTodos);
      setProjectFocusRequestUid((current) => (current === todoUid ? null : current));
      store.scheduleRefresh(settings, 0, { scope: "projects" });
    },
    [resolvedOptimisticProjectTodos, settings, store],
  );

  const handleProjectFocusRequestHandled = useCallback(() => {
    setProjectFocusRequestUid(null);
  }, []);

  const handleOpenProjectDetail = useCallback((project: ProjectSummary) => {
    setProjectDetailPageUid(project.pageUid);
  }, []);

  const handleCloseProjectDetail = useCallback(() => {
    const closingUid = projectDetailPageUid;
    setProjectDetailPageUid(null);
    if (!closingUid) {
      return;
    }
    void store.refresh(settings, { scope: "projects" });
    const project = stateProjects.find((entry) => entry.pageUid === closingUid);
    if (!project?.statusBlockUid) {
      return;
    }
    const blockString =
      window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", project.statusBlockUid])?.[
        ":block/string"
      ] ?? null;
    const newStatusText = blockString?.replace(/^Status::\s*/i, "").trim() || null;
    setOptimisticProjectTodos((current) => {
      const optimisticProject = current[closingUid];
      if (newStatusText === project.statusText) {
        return current;
      }
      if (newStatusText === (optimisticProject?.statusText ?? project.statusText)) {
        return current;
      }
      return {
        ...current,
        [closingUid]: { ...(optimisticProject ?? project), statusText: newStatusText },
      };
    });
  }, [projectDetailPageUid, settings, stateProjects, store]);

  return {
    activeProjectDetail,
    bodyDisplayProjects,
    dismissedProjectUids,
    displayProjects,
    handleCloseProjectDetail,
    handleCreateProjectTodo,
    handleDismissProject,
    handleOpenProjectDetail,
    handleProjectFocusRequestHandled,
    handleProjectStatusChange,
    handleProjectTodoBlur,
    handleProjectTodoHotkeyAction,
    projectDetailPageUid: resolvedProjectDetailPageUid,
    projectFocusRequestUid: nextFocusRequestUid,
    resetProjectDetailState,
    topProjectToReview,
    visibleProjectDetails,
  };
}
