import React, { useEffect, useMemo } from "react";

import { useStoreSlice } from "../../../review/use-store-slice";
import { getReviewWizardFooterState } from "../../../review/wizard-navigation";
import { useReviewWizardProjectDetail } from "../../../review/wizard-project-detail";
import {
  getPrimaryForwardLabelKey,
  getProjectsDetailDialogTitle,
  getProjectsStepForwardState,
  getReviewProgressValue,
} from "../../../review/wizard-support";
import { ProjectsStep } from "../../ProjectsStep";
import { publishStepControls, type ReviewWizardContainerProps } from "./types";

function selectProjectsSlice(
  state: ReturnType<ReviewWizardContainerProps<"projects">["store"]["getSnapshot"]>,
) {
  return {
    projects: state.projects,
    projectsHydrated: state.projectsHydrated,
    projectsLoading: state.projectsLoading,
  };
}

function projectsSliceEqual(
  left: ReturnType<typeof selectProjectsSlice>,
  right: ReturnType<typeof selectProjectsSlice>,
): boolean {
  return (
    left.projects === right.projects &&
    left.projectsHydrated === right.projectsHydrated &&
    left.projectsLoading === right.projectsLoading
  );
}

export function ProjectsStepContainer(props: ReviewWizardContainerProps<"projects">) {
  const { activeControlsRef, isLastStep, session, settings, stepCount, stepIndex, store, t } =
    props;
  const { projects, projectsHydrated } = useStoreSlice(
    store,
    selectProjectsSlice,
    projectsSliceEqual,
  );
  const controller = session.getControllerForStep("projects");
  const {
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
    projectDetailPageUid,
    projectFocusRequestUid,
    topProjectToReview,
    visibleProjectDetails,
  } = useReviewWizardProjectDetail({
    bodyProjects: projects,
    settings,
    stateProjects: projects,
    store,
  });

  const isProjectDetailOpen = activeProjectDetail != null;
  const projectsForwardState = useMemo(
    () =>
      getProjectsStepForwardState({
        isDetailOpen: isProjectDetailOpen,
        remainingProjects: visibleProjectDetails.length,
      }),
    [isProjectDetailOpen, visibleProjectDetails.length],
  );
  const footerState = useMemo(
    () =>
      getReviewWizardFooterState({
        activeDetailKind: isProjectDetailOpen ? "project" : "none",
        inboxAtEnd: false,
        inboxIndex: 0,
        isInboxComplete: false,
        isInboxWithItems: false,
        isLastStep,
        primaryForwardLabelKey: getPrimaryForwardLabelKey("projects", isLastStep),
        projectsForwardState,
        savedSummary: false,
        showPrimaryForward: true,
        stepIndex,
        stepKey: "projects",
      }),
    [isLastStep, isProjectDetailOpen, projectsForwardState, stepIndex],
  );
  const publishedSnapshot = useMemo(
    () => ({
      footer: footerState,
      header: {
        legendSegments: null,
        progressValue: getReviewProgressValue({
          inboxCurrent: 0,
          inboxTotal: 0,
          projectsReviewed: dismissedProjectUids.size,
          projectsTotal: displayProjects.length,
          stepCount,
          stepIndex,
          stepKey: "projects",
        }),
        title: getProjectsDetailDialogTitle(t("step2Title"), activeProjectDetail?.pageTitle),
      },
      stepSlot: {
        error: null,
        mode:
          !projectsHydrated && bodyDisplayProjects.length === 0
            ? ("loading" as const)
            : ("ready" as const),
      },
    }),
    [
      activeProjectDetail?.pageTitle,
      bodyDisplayProjects.length,
      dismissedProjectUids.size,
      displayProjects.length,
      footerState,
      projectsHydrated,
      stepCount,
      stepIndex,
      t,
    ],
  );

  useEffect(() => {
    controller?.publishSnapshot("projects", publishedSnapshot);
  }, [controller, publishedSnapshot]);

  useEffect(() => {
    const controls = {
      handleBack: () => {
        if (!isProjectDetailOpen) {
          return false;
        }
        handleCloseProjectDetail();
        return true;
      },
      handleForward: () => {
        if (projectsForwardState.action !== "reviewTopProject" || !topProjectToReview) {
          return false;
        }
        handleDismissProject(topProjectToReview);
        return true;
      },
    };

    return publishStepControls(activeControlsRef, controls);
  }, [
    activeControlsRef,
    handleCloseProjectDetail,
    handleDismissProject,
    isProjectDetailOpen,
    projectsForwardState.action,
    topProjectToReview,
  ]);

  return (
    <ProjectsStep
      detailProjectPageUid={projectDetailPageUid}
      dismissedUids={dismissedProjectUids}
      focusRequestUid={projectFocusRequestUid}
      hotkeyBindings={{
        delegate: settings.hotkeyDelegate || "d",
        reference: "r",
        someday: settings.hotkeySomeday || "s",
        up: "u",
        watch: settings.hotkeyWatch || "w",
      }}
      onCreateProjectTodo={handleCreateProjectTodo}
      onDismissProject={handleDismissProject}
      onFocusRequestHandled={handleProjectFocusRequestHandled}
      onOpenProjectDetail={handleOpenProjectDetail}
      onProjectTodoBlur={handleProjectTodoBlur}
      onStatusChange={handleProjectStatusChange}
      onTodoHotkeyAction={handleProjectTodoHotkeyAction}
      projects={bodyDisplayProjects}
      projectsHydrated={projectsHydrated}
      t={t}
    />
  );
}
