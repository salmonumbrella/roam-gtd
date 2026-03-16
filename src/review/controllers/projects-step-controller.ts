import type { TranslatorFn } from "../../i18n";
import type { ProjectSummary } from "../../types";
import type { ReviewControllerSnapshot, ReviewStepController } from "../session/types";
import { resolveReviewWizardProjectCollections } from "../wizard-project-detail";

interface CreateProjectsStepControllerArgs {
  getBodyProjects: () => Array<ProjectSummary>;
  getProjectsHydrated?: () => boolean;
  getStateProjects: () => Array<ProjectSummary>;
  onActivate?: () => void;
  t: TranslatorFn;
}

export interface ProjectsStepControllerSnapshot extends ReviewControllerSnapshot {
  detail: {
    activeProject: ProjectSummary | null;
    projectUid: string | null;
  };
}

export interface ProjectsStepController extends ReviewStepController<"projects"> {
  closeProjectDetail(): void;
  getSnapshot(stepKey: "projects"): ProjectsStepControllerSnapshot;
  openProjectDetail(project: ProjectSummary): void;
}

function createSnapshot(
  title: string,
  activeProject: ProjectSummary | null,
  projectUid: string | null,
): ProjectsStepControllerSnapshot {
  return {
    detail: {
      activeProject,
      projectUid,
    },
    footer: {
      leftAction: null,
      rightAction: null,
    },
    header: {
      legendSegments: null,
      progressValue: 0,
      title,
    },
    stepSlot: {
      error: null,
      mode: "ready",
    },
  };
}

function applyPublishedSnapshot(
  snapshot: ProjectsStepControllerSnapshot,
  publishedSnapshot: ReviewControllerSnapshot | null,
): ProjectsStepControllerSnapshot {
  if (!publishedSnapshot) {
    return snapshot;
  }

  return {
    ...snapshot,
    footer: publishedSnapshot.footer,
    header: publishedSnapshot.header,
    stepSlot: publishedSnapshot.stepSlot,
  };
}

export function createProjectsStepController(
  args: CreateProjectsStepControllerArgs,
): ProjectsStepController {
  const listeners = new Set<() => void>();
  let projectDetailPageUid: string | null = null;
  let publishedSnapshot: ReviewControllerSnapshot | null = null;

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const getDetailSnapshot = () =>
    resolveReviewWizardProjectCollections({
      bodyProjects: args.getBodyProjects(),
      dismissedProjectUids: new Set(),
      optimisticProjectTodos: {},
      projectDetailPageUid,
      stateProjects: args.getStateProjects(),
    });

  return {
    activate: async () => {
      args.onActivate?.();
      notify();
    },
    closeProjectDetail: () => {
      if (projectDetailPageUid == null) {
        return;
      }
      projectDetailPageUid = null;
      notify();
    },
    deactivate: () => undefined,
    dispose: () => {
      listeners.clear();
    },
    domainKey: "projects",
    getSnapshot: () => {
      const detailSnapshot = getDetailSnapshot();
      const result = applyPublishedSnapshot(
        createSnapshot(
          args.t("step2Title"),
          detailSnapshot.activeProjectDetail,
          detailSnapshot.projectDetailPageUid,
        ),
        publishedSnapshot,
      );
      // If the published snapshot says "loading" but the store data says
      // projects are hydrated, override to "ready" — this prevents a
      // deadlock where the container publishes "loading", gets unmounted
      // by ReviewStepSlot, and can never publish "ready".
      if (result.stepSlot.mode === "loading" && args.getProjectsHydrated?.()) {
        return {
          ...result,
          stepSlot: { ...result.stepSlot, mode: "ready" },
        };
      }
      return result;
    },
    openProjectDetail: (project: ProjectSummary) => {
      if (projectDetailPageUid === project.pageUid) {
        return;
      }
      projectDetailPageUid = project.pageUid;
      notify();
    },
    publishSnapshot: (_stepKey, snapshot) => {
      publishedSnapshot = snapshot;
      notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
