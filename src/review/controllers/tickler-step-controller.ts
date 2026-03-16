import type { TranslatorFn } from "../../i18n";
import type { TicklerGroup } from "../../types";
import type { ReviewControllerSnapshot, ReviewStepController } from "../session/types";

interface CreateTicklerStepControllerArgs {
  getBodyGroups: () => Array<TicklerGroup>;
  getStateGroups: () => Array<TicklerGroup>;
  onActivate?: () => void;
  t: TranslatorFn;
}

export interface TicklerStepControllerSnapshot extends ReviewControllerSnapshot {
  detail: {
    activeGroup: TicklerGroup | null;
    pageUid: string | null;
  };
}

export interface TicklerStepController extends ReviewStepController<"tickler"> {
  closeTicklerDetail(): void;
  getSnapshot(stepKey: "tickler"): TicklerStepControllerSnapshot;
  openTicklerDetail(pageUid: string): void;
}

function resolveTicklerDetail(
  pageUid: string | null,
  bodyGroups: Array<TicklerGroup>,
  stateGroups: Array<TicklerGroup>,
): TicklerGroup | null {
  if (pageUid == null) {
    return null;
  }

  return (
    bodyGroups.find((group) => group.dailyPageUid === pageUid) ??
    stateGroups.find((group) => group.dailyPageUid === pageUid) ??
    null
  );
}

function createSnapshot(
  title: string,
  activeGroup: TicklerGroup | null,
  pageUid: string | null,
): TicklerStepControllerSnapshot {
  return {
    detail: {
      activeGroup,
      pageUid,
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
  snapshot: TicklerStepControllerSnapshot,
  publishedSnapshot: ReviewControllerSnapshot | null,
): TicklerStepControllerSnapshot {
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

export function createTicklerStepController(
  args: CreateTicklerStepControllerArgs,
): TicklerStepController {
  const listeners = new Set<() => void>();
  let detailPageUid: string | null = null;
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
    closeTicklerDetail: () => {
      if (detailPageUid == null) {
        return;
      }
      detailPageUid = null;
      notify();
    },
    deactivate: () => undefined,
    dispose: () => {
      listeners.clear();
    },
    domainKey: "tickler",
    getSnapshot: () => {
      const activeGroup = resolveTicklerDetail(
        detailPageUid,
        args.getBodyGroups(),
        args.getStateGroups(),
      );
      return applyPublishedSnapshot(
        createSnapshot(
          activeGroup?.dailyTitle ?? args.t("step7Title"),
          activeGroup,
          activeGroup?.dailyPageUid ?? null,
        ),
        publishedSnapshot,
      );
    },
    openTicklerDetail: (pageUid: string) => {
      if (detailPageUid === pageUid) {
        return;
      }
      detailPageUid = pageUid;
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
