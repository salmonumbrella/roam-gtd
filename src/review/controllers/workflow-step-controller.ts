import type { UnifiedReviewRowTriageRequest } from "../../components/UnifiedReviewRow";
import type { TranslatorFn } from "../../i18n";
import type { PersonEntry } from "../../people";
import type { TodoItem } from "../../types";
import type { ReviewControllerSnapshot, ReviewStepController } from "../session/types";
import {
  type ActiveWorkflowTriageState,
  getNextWorkflowTriageRequest,
  resolveWorkflowControllerDetail,
} from "../wizard-workflow-triage";

type WorkflowStepKey = "upcoming" | "waitingDelegated" | "someday";

interface CreateWorkflowStepControllerArgs {
  getDelegatedPeople: () => Array<PersonEntry>;
  getVisibleItems: () => Array<TodoItem>;
  onActivate?: (stepKey: WorkflowStepKey) => void;
  t: TranslatorFn;
}

export interface WorkflowStepControllerSnapshot extends ReviewControllerSnapshot {
  detail: {
    activePersonDetail: PersonEntry | null;
    activeTriage: ActiveWorkflowTriageState | null;
    activeTriageUid: string | null;
    personUid: string | null;
  };
}

export interface WorkflowStepController extends ReviewStepController<WorkflowStepKey> {
  clearWorkflowTriageForUid(uid: string): void;
  closePersonDetail(): void;
  closeWorkflowTriage(): void;
  getSnapshot(stepKey: WorkflowStepKey): WorkflowStepControllerSnapshot;
  openPersonDetail(uid: string): void;
  openWorkflowTriage(request: UnifiedReviewRowTriageRequest): void;
}

function getStepTitle(stepKey: WorkflowStepKey, t: TranslatorFn): string {
  if (stepKey === "upcoming") {
    return t("step3Title");
  }
  if (stepKey === "waitingDelegated") {
    return t("step4Title");
  }
  return t("step5Title");
}

function createSnapshot(
  title: string,
  detail: WorkflowStepControllerSnapshot["detail"],
): WorkflowStepControllerSnapshot {
  return {
    detail,
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
  snapshot: WorkflowStepControllerSnapshot,
  publishedSnapshot: ReviewControllerSnapshot | null,
): WorkflowStepControllerSnapshot {
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

export function createWorkflowStepController(
  args: CreateWorkflowStepControllerArgs,
): WorkflowStepController {
  const listeners = new Set<() => void>();
  let activeStepKey: WorkflowStepKey = "upcoming";
  let personDetailUid: string | null = null;
  let requestedWorkflowTriage: ActiveWorkflowTriageState | null = null;
  const publishedSnapshots = new Map<WorkflowStepKey, ReviewControllerSnapshot>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    activate: async (stepKey: WorkflowStepKey) => {
      activeStepKey = stepKey;
      args.onActivate?.(stepKey);
      notify();
    },
    clearWorkflowTriageForUid: (uid: string) => {
      if (requestedWorkflowTriage?.item.uid !== uid) {
        return;
      }
      requestedWorkflowTriage = null;
      notify();
    },
    closePersonDetail: () => {
      if (personDetailUid == null) {
        return;
      }
      personDetailUid = null;
      notify();
    },
    closeWorkflowTriage: () => {
      if (requestedWorkflowTriage == null) {
        return;
      }
      requestedWorkflowTriage = null;
      notify();
    },
    deactivate: () => undefined,
    dispose: () => {
      listeners.clear();
    },
    domainKey: "workflow",
    getSnapshot: (stepKey: WorkflowStepKey) => {
      activeStepKey = stepKey;
      const detail = resolveWorkflowControllerDetail({
        delegatedPeople: args.getDelegatedPeople(),
        personDetailUid,
        requestedWorkflowTriage,
        stepKey,
        visibleItems: args.getVisibleItems(),
      });

      return applyPublishedSnapshot(
        createSnapshot(getStepTitle(activeStepKey, args.t), {
          activePersonDetail: detail.activePersonDetail,
          activeTriage: detail.activeWorkflowTriage,
          activeTriageUid: detail.activeWorkflowTriageUid,
          personUid: detail.activePersonDetail?.uid ?? null,
        }),
        publishedSnapshots.get(stepKey) ?? null,
      );
    },
    openPersonDetail: (uid: string) => {
      if (personDetailUid === uid) {
        return;
      }
      personDetailUid = uid;
      notify();
    },
    openWorkflowTriage: (request: UnifiedReviewRowTriageRequest) => {
      const nextRequest = getNextWorkflowTriageRequest(
        requestedWorkflowTriage?.item.uid ?? null,
        request,
      );
      const isSameRequest =
        nextRequest?.item.uid === requestedWorkflowTriage?.item.uid &&
        nextRequest?.currentTag === requestedWorkflowTriage?.currentTag &&
        nextRequest?.anchorElement === requestedWorkflowTriage?.anchorElement;
      if (isSameRequest) {
        return;
      }
      requestedWorkflowTriage = nextRequest;
      notify();
    },
    publishSnapshot: (stepKey, snapshot) => {
      publishedSnapshots.set(stepKey, snapshot);
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
