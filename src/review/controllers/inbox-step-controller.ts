import type { ReviewControllerSnapshot, ReviewStepController } from "../session/types";

const WORKFLOW_PREFETCH_REMAINING_ITEMS = 2;
const PROJECTS_PREFETCH_REMAINING_ITEMS = 1;

export interface InboxPrefetchSignal {
  atEnd: boolean;
  current: number;
  total: number;
}

export function shouldWarmWorkflowFromInboxSignal(signal: InboxPrefetchSignal): boolean {
  if (signal.total <= 0) {
    return false;
  }

  return signal.total - signal.current <= WORKFLOW_PREFETCH_REMAINING_ITEMS;
}

export function shouldWarmProjectsFromInboxSignal(signal: InboxPrefetchSignal): boolean {
  if (signal.total <= 0) {
    return false;
  }

  return signal.total - signal.current <= PROJECTS_PREFETCH_REMAINING_ITEMS;
}

export interface CreateInboxStepControllerArgs {
  getFallbackSnapshot: () => ReviewControllerSnapshot;
  onActivate?: () => void;
}

export type InboxStepController = ReviewStepController<"inbox">;

export function createInboxStepController(
  args: CreateInboxStepControllerArgs,
): InboxStepController {
  const listeners = new Set<() => void>();
  let publishedSnapshot: ReviewControllerSnapshot | null = null;

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    activate: async () => {
      args.onActivate?.();
      notify();
    },
    deactivate: () => undefined,
    dispose: () => {
      listeners.clear();
    },
    domainKey: "inbox",
    getSnapshot: () => publishedSnapshot ?? args.getFallbackSnapshot(),
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

export function wireInboxPrefetchReporter<TController extends ReviewStepController>(
  controller: TController,
  onSignal: (signal: InboxPrefetchSignal) => void,
): TController {
  controller.reportInboxProgress = onSignal;
  return controller;
}
