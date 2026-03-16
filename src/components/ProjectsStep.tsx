import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { scheduleIdleTask } from "../browser-idle";
import type { TranslatorFn } from "../i18n";
import {
  getProjectsStepKeyboardCommand,
  getProjectsStepTopControlKeyCommand,
} from "../projects-step/keyboard";
import {
  clearProjectsStepPendingFocus,
  clearProjectsStepReturnFocus,
  getProjectsStepDetailProject,
  getProjectsStepReturnFocusPageUid,
  openProjectsStepDetail,
  requestProjectsStepTodoFocus,
  resolveProjectsStepFocusResolution,
} from "../projects-step/list-detail";
import {
  getMountedProjectPageUids,
  getNextProjectKeyboardControl,
  getProjectPagePreviewSource,
  getProjectsReviewCounterPosition,
  getProjectsReviewState,
  getProjectsReviewVisibleRowCount,
  loadProjectStatusOptions,
  shouldAutoExpandProjectsReviewRows,
  type ProjectKeyboardControl,
  type ProjectTodoHotkeyAction,
  type ProjectTodoHotkeyBindings,
} from "../projects-step/support";
import type { ProjectSummary } from "../types";
import { syncPageColorBridge } from "./PageColorBridge";
import { ProjectsStepSkeleton } from "./projects-step/ProjectsStepSkeleton";
import { ProjectStatusField } from "./projects-step/ProjectStatusField";
import { ProjectTitlePreview } from "./projects-step/ProjectTitlePreview";
import { ensureProjectsStepStyle } from "./projects-step/styles";
import { ReviewPageDetailPane } from "./ReviewPageDetailPane";
import { StepEmptyState } from "./StepEmptyState";
import {
  asHtmlElement,
  isWeeklyReviewEditableElement,
  WeeklyReviewRoamBlock,
  type WeeklyReviewRoamBlockHandle,
} from "./WeeklyReviewRoamBlock";
export {
  getDismissedProjectUidsAfterDismiss,
  getMountedProjectPageUids,
  getNextProjectKeyboardControl,
  getProjectPagePreviewSource,
  getProjectTodoCurrentTag,
  getProjectTodoHotkeyAction,
  getProjectsReviewCounterPosition,
  getProjectsReviewState,
  getProjectsReviewVisibleRowCount,
  getTopProjectKeyboardAction,
  persistProjectStatusChange,
  shouldAutoExpandProjectsReviewRows,
} from "../projects-step/support";
export type { ProjectTodoHotkeyAction, ProjectTodoHotkeyBindings } from "../projects-step/support";

const DEFAULT_INITIAL_VISIBLE_PROJECT_ROWS = 12;
const DEFAULT_PROJECT_ROW_BATCH_SIZE = 8;
const DEFAULT_PROJECT_SCROLL_THRESHOLD_PX = 240;
const PROJECT_STATUS_OPTIONS_IDLE_TIMEOUT_MS = 1200;

export function ProjectsStep({
  detailProjectPageUid,
  dismissedUids,
  focusRequestUid,
  hotkeyBindings,
  onCreateProjectTodo,
  onDismissProject,
  onFocusRequestHandled,
  onOpenProjectDetail,
  onProjectTodoBlur,
  onStatusChange,
  onTodoHotkeyAction,
  projects,
  projectsHydrated,
  t,
}: {
  detailProjectPageUid: string | null;
  dismissedUids: Set<string>;
  focusRequestUid: string | null;
  hotkeyBindings: ProjectTodoHotkeyBindings;
  onCreateProjectTodo: (project: ProjectSummary) => Promise<void>;
  onDismissProject: (project: ProjectSummary) => void;
  onFocusRequestHandled: () => void;
  onOpenProjectDetail: (project: ProjectSummary) => void;
  onProjectTodoBlur: (todoUid: string) => void;
  onStatusChange: (project: ProjectSummary, nextStatus: string) => boolean;
  onTodoHotkeyAction: (action: ProjectTodoHotkeyAction, project: ProjectSummary) => Promise<void>;
  projects: Array<ProjectSummary>;
  projectsHydrated: boolean;
  t: TranslatorFn;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const todoBlockRefs = useRef(new Map<string, WeeklyReviewRoamBlockHandle>());
  const statusButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const dismissButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [statusOptions, setStatusOptions] = useState<Array<string>>([]);
  const [listDetailState, setListDetailState] = useState({
    pendingFocusUid: null as string | null,
    returnFocusPageUid: null as string | null,
  });
  const [pendingKeyboardControlFocus, setPendingKeyboardControlFocus] =
    useState<ProjectKeyboardControl | null>(null);
  const [visibleRowCount, setVisibleRowCount] = useState(DEFAULT_INITIAL_VISIBLE_PROJECT_ROWS);
  const { allDismissed, reviewedCount, visibleProjects } = useMemo(
    () => getProjectsReviewState(projects, dismissedUids),
    [projects, dismissedUids],
  );
  const totalVisibleProjects = visibleProjects.length;
  const renderedProjects = useMemo(
    () => visibleProjects.slice(0, visibleRowCount),
    [visibleProjects, visibleRowCount],
  );
  const topProject = visibleProjects[0] ?? null;
  const topProjectUid = topProject?.pageUid ?? null;
  const detailProject = useMemo(
    () =>
      getProjectsStepDetailProject({
        detailProjectPageUid,
        projects,
        visibleProjects,
      }),
    [detailProjectPageUid, projects, visibleProjects],
  );

  useEffect(() => {
    ensureProjectsStepStyle();
    syncPageColorBridge();
  }, []);

  useEffect(() => {
    if (!projectsHydrated) {
      return;
    }
    let cancelled = false;
    const cancelIdleLoad = scheduleIdleTask(
      () => {
        void loadProjectStatusOptions().then((nextOptions) => {
          if (cancelled) {
            return;
          }
          setStatusOptions(nextOptions);
        });
      },
      { timeoutMs: PROJECT_STATUS_OPTIONS_IDLE_TIMEOUT_MS },
    );

    return () => {
      cancelled = true;
      cancelIdleLoad();
    };
  }, [projectsHydrated]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setVisibleRowCount((current) => {
        if (visibleProjects.length === 0) {
          return DEFAULT_INITIAL_VISIBLE_PROJECT_ROWS;
        }
        return Math.min(
          Math.max(current, DEFAULT_INITIAL_VISIBLE_PROJECT_ROWS),
          visibleProjects.length,
        );
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [visibleProjects.length]);

  const reviewedCountColor = "#94e2d5";
  const reviewCounterPosition = getProjectsReviewCounterPosition(reviewedCount, projects.length);
  const projectsInProgressLabel = t("projectsInProgress", reviewCounterPosition, projects.length);
  const reviewCounterPrefix = String(reviewCounterPosition);
  const reviewCounterSuffix = projectsInProgressLabel.startsWith(reviewCounterPrefix)
    ? projectsInProgressLabel.slice(reviewCounterPrefix.length)
    : ` ${projectsInProgressLabel}`;
  const mountedProjectPageUids = useMemo(
    () => getMountedProjectPageUids({ visibleProjects: renderedProjects }),
    [renderedProjects],
  );
  const returnFocusPageUid = useMemo(
    () =>
      getProjectsStepReturnFocusPageUid({
        detailProjectPageUid,
        returnFocusPageUid: listDetailState.returnFocusPageUid,
        visibleProjects,
      }),
    [detailProjectPageUid, listDetailState.returnFocusPageUid, visibleProjects],
  );
  const focusResolution = useMemo(
    () =>
      resolveProjectsStepFocusResolution({
        focusRequestUid,
        mountedProjectPageUids,
        pendingFocusUid: listDetailState.pendingFocusUid,
        visibleProjects,
      }),
    [focusRequestUid, listDetailState.pendingFocusUid, mountedProjectPageUids, visibleProjects],
  );

  const mergedStatusOptions = useMemo(() => {
    const nextOptions = [...statusOptions];
    for (const project of projects) {
      const status = project.statusText?.trim();
      if (status && !nextOptions.includes(status)) {
        nextOptions.push(status);
      }
    }
    return nextOptions;
  }, [projects, statusOptions]);

  const handleProjectsScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (renderedProjects.length >= totalVisibleProjects) {
        return;
      }
      const target = event.currentTarget;
      if (
        target.scrollHeight - (target.scrollTop + target.clientHeight) >
        DEFAULT_PROJECT_SCROLL_THRESHOLD_PX
      ) {
        return;
      }
      setVisibleRowCount((current) =>
        getProjectsReviewVisibleRowCount(
          current,
          totalVisibleProjects,
          DEFAULT_PROJECT_ROW_BATCH_SIZE,
        ),
      );
    },
    [renderedProjects.length, totalVisibleProjects],
  );

  const queueVisibleProjectRowExpansion = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) {
        return;
      }
      if (
        !shouldAutoExpandProjectsReviewRows({
          clientHeight: container.clientHeight,
          renderedProjectCount: renderedProjects.length,
          scrollHeight: container.scrollHeight,
          scrollThresholdPx: DEFAULT_PROJECT_SCROLL_THRESHOLD_PX,
          totalVisibleProjects,
        })
      ) {
        return;
      }
      setVisibleRowCount((current) =>
        getProjectsReviewVisibleRowCount(
          current,
          totalVisibleProjects,
          DEFAULT_PROJECT_ROW_BATCH_SIZE,
        ),
      );
    },
    [renderedProjects.length, totalVisibleProjects],
  );

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    let frameId: number | null = null;
    const requestExpansionCheck = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        queueVisibleProjectRowExpansion(container);
      });
    };

    requestExpansionCheck();

    if (typeof ResizeObserver !== "function") {
      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      requestExpansionCheck();
    });
    resizeObserver.observe(container);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
    };
  }, [queueVisibleProjectRowExpansion]);

  const focusTopProjectControl = useCallback(
    (control: ProjectKeyboardControl): boolean => {
      if (!topProjectUid) {
        return false;
      }
      const node =
        control === "status"
          ? statusButtonRefs.current.get(topProjectUid)
          : dismissButtonRefs.current.get(topProjectUid);
      if (!node) {
        return false;
      }
      node.focus();
      setPendingKeyboardControlFocus(null);
      return true;
    },
    [topProjectUid],
  );

  const setTodoBlockRef = useCallback((uid: string, node: WeeklyReviewRoamBlockHandle | null) => {
    if (!node) {
      todoBlockRefs.current.delete(uid);
      return;
    }
    todoBlockRefs.current.set(uid, node);
  }, []);

  const setStatusButtonRef = useCallback((uid: string, node: HTMLButtonElement | null) => {
    if (!node) {
      statusButtonRefs.current.delete(uid);
      return;
    }
    statusButtonRefs.current.set(uid, node);
  }, []);

  const setDismissButtonRef = useCallback((uid: string, node: HTMLButtonElement | null) => {
    if (!node) {
      dismissButtonRefs.current.delete(uid);
      return;
    }
    dismissButtonRefs.current.set(uid, node);
  }, []);

  const setPreviewButtonRef = useCallback((uid: string, node: HTMLButtonElement | null) => {
    if (!node) {
      previewButtonRefs.current.delete(uid);
      return;
    }
    previewButtonRefs.current.set(uid, node);
  }, []);

  const handleDismissProject = useCallback(
    (project: ProjectSummary) => {
      onDismissProject(project);
    },
    [onDismissProject],
  );

  const handleOpenProjectDetail = useCallback(
    (project: ProjectSummary) => {
      setListDetailState((current) => openProjectsStepDetail(current, project));
      onOpenProjectDetail(project);
    },
    [onOpenProjectDetail],
  );

  useEffect(() => {
    const activeElement = asHtmlElement(document.activeElement);
    if (activeElement && rootRef.current?.contains(activeElement)) {
      return;
    }
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!pendingKeyboardControlFocus) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      focusTopProjectControl(pendingKeyboardControlFocus);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusTopProjectControl, pendingKeyboardControlFocus, visibleProjects]);

  useEffect(() => {
    if (focusResolution.type === "none") {
      return;
    }
    if (focusResolution.type === "clearRequest") {
      const frameId = window.requestAnimationFrame(() => {
        if (focusResolution.acknowledgeExternal) {
          onFocusRequestHandled();
        }
        setListDetailState((current) =>
          clearProjectsStepPendingFocus(current, focusResolution.requestedUid),
        );
      });
      return () => window.cancelAnimationFrame(frameId);
    }
    if (focusResolution.type === "expandRows") {
      const frameId = window.requestAnimationFrame(() => {
        setVisibleRowCount((current) => Math.max(current, focusResolution.minVisibleRowCount));
      });
      return () => window.cancelAnimationFrame(frameId);
    }
    const blockHandle = todoBlockRefs.current.get(focusResolution.requestedUid);
    if (!blockHandle) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const focused = blockHandle.focusEditor();
      if (!focused) {
        return;
      }
      if (focusResolution.acknowledgeExternal) {
        onFocusRequestHandled();
      }
      setListDetailState((current) =>
        clearProjectsStepPendingFocus(current, focusResolution.requestedUid),
      );
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusResolution, onFocusRequestHandled]);

  useEffect(() => {
    if (!returnFocusPageUid) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      previewButtonRefs.current.get(returnFocusPageUid)?.focus();
      setListDetailState((current) => clearProjectsStepReturnFocus(current));
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [returnFocusPageUid]);

  useEffect(() => {
    if (detailProject) {
      return;
    }
    if (visibleProjects.length === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      const activeElement = asHtmlElement(document.activeElement);
      const isInsideRoot = Boolean(activeElement && rootRef.current?.contains(activeElement));
      const isInsideStatusMenu = Boolean(activeElement?.closest(".gtd-project-status-menu"));
      const activeTopProjectControl = (() => {
        if (!topProjectUid || !activeElement) {
          return null;
        }
        if (statusButtonRefs.current.get(topProjectUid) === activeElement) {
          return "status" as const;
        }
        if (dismissButtonRefs.current.get(topProjectUid) === activeElement) {
          return "dismiss" as const;
        }
        return null;
      })();
      const command = getProjectsStepKeyboardCommand({
        activeTopProjectControl,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        detailOpen: Boolean(detailProject),
        hotkeyBindings,
        isEditableTarget: isWeeklyReviewEditableElement(document.activeElement),
        isInsideRoot,
        isInsideStatusMenu,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        topProject,
        visibleProjects,
      });
      if (command.type === "noop") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (command.type === "moveTopControl") {
        if (!focusTopProjectControl(command.nextControl)) {
          setPendingKeyboardControlFocus(command.nextControl);
        }
        return;
      }
      if (command.type === "createTodo") {
        void onCreateProjectTodo(command.project);
        return;
      }
      if (command.type === "focusTodo") {
        setListDetailState((current) => requestProjectsStepTodoFocus(current, command.todoUid));
        return;
      }
      if (command.type === "todoHotkey") {
        void onTodoHotkeyAction(command.action, command.project);
        return;
      }
      setPendingKeyboardControlFocus(command.focusAfter);
      handleDismissProject(command.project);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    focusTopProjectControl,
    handleDismissProject,
    hotkeyBindings,
    onCreateProjectTodo,
    detailProject,
    onTodoHotkeyAction,
    topProject,
    topProjectUid,
    visibleProjects,
  ]);

  if (!projectsHydrated) {
    return <ProjectsStepSkeleton projectCount={projects.length} />;
  }

  if (projects.length === 0) {
    return <StepEmptyState icon="projects" title={t("noActiveProjects")} variant="empty" />;
  }

  if (allDismissed) {
    return (
      <StepEmptyState
        subtitle={t("projectsReviewed", reviewedCount, projects.length)}
        title={t("allProjectsReviewed")}
        variant="complete"
      />
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
      <div
        aria-hidden={detailProject ? "true" : undefined}
        ref={rootRef}
        style={{
          display: detailProject ? "none" : "flex",
          flex: 1,
          flexDirection: "column",
          minHeight: 0,
        }}
        tabIndex={detailProject ? undefined : -1}
      >
        <p
          data-testid="projects-review-counter"
          style={{ color: "#7f849c", fontSize: 12, lineHeight: 1.5, margin: 0, minHeight: 18 }}
        >
          <span style={{ color: reviewedCountColor, transition: "none" }}>
            {reviewCounterPrefix}
          </span>
          <span style={{ color: "#A5A5A5" }}>{reviewCounterSuffix}</span>
        </p>
        <div
          onScroll={handleProjectsScroll}
          ref={listRef}
          style={{
            flex: 1,
            marginTop: 8,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {renderedProjects.map((project, projectIndex) => {
            const isTopProject = project.pageUid === topProjectUid;
            const isLastProject = projectIndex === renderedProjects.length - 1;
            const projectPreviewSource = getProjectPagePreviewSource(project);

            return (
              <div
                className="gtd-project-row"
                data-gtd-project-row={project.pageUid}
                key={project.pageUid}
                style={{
                  borderBottom: isLastProject ? "none" : "1px solid rgba(127, 132, 156, 0.15)",
                  padding: "10px 0",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    gap: 8,
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    data-gtd-project-title-root={project.pageUid}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                  >
                    <button
                      className="gtd-project-preview-button"
                      onClick={() => handleOpenProjectDetail(project)}
                      ref={(node) => setPreviewButtonRef(project.pageUid, node)}
                      type="button"
                    >
                      <div className="gtd-project-preview">
                        <span style={{ fontWeight: 600 }}>Project:</span>{" "}
                        <ProjectTitlePreview source={projectPreviewSource} />
                      </div>
                    </button>
                  </div>
                  <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: 6 }}>
                    <ProjectStatusField
                      buttonRef={
                        isTopProject
                          ? (node) => setStatusButtonRef(project.pageUid, node)
                          : undefined
                      }
                      emptyLabel={t("noneStatus")}
                      onChangeStatus={onStatusChange}
                      onFocusButton={
                        isTopProject ? () => setPendingKeyboardControlFocus("status") : undefined
                      }
                      onRequestAdvanceFocus={
                        isTopProject
                          ? (direction) =>
                              focusTopProjectControl(
                                getNextProjectKeyboardControl("status", direction),
                              ) ||
                              setPendingKeyboardControlFocus(
                                getNextProjectKeyboardControl("status", direction),
                              )
                          : undefined
                      }
                      onRequestDismissFocus={
                        isTopProject
                          ? () =>
                              focusTopProjectControl("dismiss") ||
                              setPendingKeyboardControlFocus("dismiss")
                          : undefined
                      }
                      options={mergedStatusOptions}
                      project={project}
                    />
                    <button
                      className="bp3-button bp3-minimal bp3-small bp3-icon-small-tick gtd-project-top-control"
                      onClick={() => handleDismissProject(project)}
                      onFocus={
                        isTopProject ? () => setPendingKeyboardControlFocus("dismiss") : undefined
                      }
                      onKeyDown={
                        isTopProject
                          ? (event) => {
                              const command = getProjectsStepTopControlKeyCommand({
                                activeControl: "dismiss",
                                altKey: event.altKey,
                                ctrlKey: event.ctrlKey,
                                key: event.key,
                                metaKey: event.metaKey,
                                project,
                                shiftKey: event.shiftKey,
                              });
                              if (command.type === "noop") {
                                return;
                              }
                              event.preventDefault();
                              if (command.type === "moveTopControl") {
                                if (!focusTopProjectControl(command.nextControl)) {
                                  setPendingKeyboardControlFocus(command.nextControl);
                                }
                                return;
                              }
                              if (command.type !== "dismissTopProject") {
                                return;
                              }
                              setPendingKeyboardControlFocus(command.focusAfter);
                              handleDismissProject(command.project);
                            }
                          : undefined
                      }
                      ref={
                        isTopProject
                          ? (node) => setDismissButtonRef(project.pageUid, node)
                          : undefined
                      }
                      title={t("markReviewed")}
                      type="button"
                    />
                  </div>
                </div>
                <div style={{ marginTop: 6, minHeight: 27, paddingRight: 36 }}>
                  {project.lastTodoUid ? (
                    // Recreate the embed container when the preview block changes. Roam's
                    // renderBlock can fail to repaint a reused container after closing detail.
                    <WeeklyReviewRoamBlock
                      key={project.lastTodoUid}
                      onBlurOutside={onProjectTodoBlur}
                      ref={(node) => setTodoBlockRef(project.lastTodoUid!, node)}
                      style={{
                        fontSize: 13,
                        paddingLeft: 4,
                      }}
                      uid={project.lastTodoUid}
                    />
                  ) : (
                    <button
                      className="bp3-button bp3-minimal bp3-small bp3-icon-add"
                      onClick={() => void onCreateProjectTodo(project)}
                      style={{
                        color: "#A5A5A5",
                        cursor: "pointer",
                      }}
                      tabIndex={0}
                      type="button"
                    >
                      {t("noProjectTodos")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {detailProject ? <ReviewPageDetailPane pageUid={detailProject.pageUid} /> : null}
    </div>
  );
}
