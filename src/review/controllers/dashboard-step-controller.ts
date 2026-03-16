import type { TranslatorFn } from "../../i18n";
import type { GtdState } from "../../store";
import type { ReviewControllerSnapshot, ReviewStepController } from "../session/types";
import { writeWeeklyReviewSummary } from "../wizard-summary";

interface CreateDashboardStepControllerArgs {
  findSummaryPageUid?: (title: string) => string | null;
  getState: () => GtdState;
  now?: () => Date;
  onActivate?: () => void;
  t: TranslatorFn;
}

export interface DashboardStepControllerSnapshot extends ReviewControllerSnapshot {
  summary: {
    savedSummary: boolean;
  };
}

export interface DashboardStepController extends ReviewStepController<"stats"> {
  getSnapshot(stepKey: "stats"): DashboardStepControllerSnapshot;
  resetSummaryState(): void;
  saveSummary(): Promise<void>;
}

function createSnapshot(title: string, savedSummary: boolean): DashboardStepControllerSnapshot {
  return {
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
    summary: {
      savedSummary,
    },
  };
}

function applyPublishedSnapshot(
  snapshot: DashboardStepControllerSnapshot,
  publishedSnapshot: ReviewControllerSnapshot | null,
): DashboardStepControllerSnapshot {
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

export function createDashboardStepController(
  args: CreateDashboardStepControllerArgs,
): DashboardStepController {
  const listeners = new Set<() => void>();
  let savedSummary = false;
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
    domainKey: "dashboard",
    getSnapshot: () => {
      const result = applyPublishedSnapshot(
        createSnapshot(args.t("step8Title"), savedSummary),
        publishedSnapshot,
      );
      if (result.stepSlot.mode === "loading" && args.getState().backHalfHydrated) {
        return { ...result, stepSlot: { ...result.stepSlot, mode: "ready" } };
      }
      return result;
    },
    publishSnapshot: (_stepKey, snapshot) => {
      publishedSnapshot = snapshot;
      notify();
    },
    resetSummaryState: () => {
      if (!savedSummary) {
        return;
      }
      savedSummary = false;
      notify();
    },
    saveSummary: async () => {
      await writeWeeklyReviewSummary({
        findSummaryPageUid: args.findSummaryPageUid,
        now: args.now?.(),
        state: args.getState(),
      });
      savedSummary = true;
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
