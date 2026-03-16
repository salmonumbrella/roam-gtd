import React, { useEffect, useMemo, useRef, useState } from "react";

import { replaceTags } from "../../../review/actions";
import { useScheduleController } from "../../../review/use-schedule-controller";
import { useStoreSlice } from "../../../review/use-store-slice";
import {
  getTicklerGroupItemCount,
  getReviewWizardWorkflowPopoverState,
} from "../../../review/wizard-body";
import { useReviewWizardDetailState } from "../../../review/wizard-detail-state";
import { dispatchReviewWizardArchiveKeydown } from "../../../review/wizard-keyboard";
import { getReviewWizardFooterState } from "../../../review/wizard-navigation";
import {
  getPrimaryForwardLabelKey,
  getReviewProgressValue,
  isWorkflowReviewStepKey,
} from "../../../review/wizard-support";
import { useReviewWizardWorkflowTriage } from "../../../review/wizard-workflow-triage";
import { openInSidebar } from "../../../roam-ui-utils";
import { isOpenTaskText } from "../../../task-text";
import { showTriageToast } from "../../../triage/step-logic";
import type { TicklerGroup, TodoItem } from "../../../types";
import { NextActionsStep } from "../../NextActionsStep";
import { SchedulePopover } from "../../SchedulePopover";
import { SomedayMaybeStep } from "../../SomedayMaybeStep";
import { TicklerStep } from "../../TicklerStep";
import { WaitingForStep } from "../../WaitingForStep";
import { WorkflowProcessPopover } from "../../WorkflowProcessPopover";
import { publishStepControls, type ReviewWizardContainerProps } from "./types";

type WorkflowContainerStepKey = "someday" | "tickler" | "upcoming" | "waitingDelegated";

function selectWorkflowSlice(
  state: ReturnType<ReviewWizardContainerProps<WorkflowContainerStepKey>["store"]["getSnapshot"]>,
) {
  return {
    backHalfHydrated: state.backHalfHydrated,
    delegated: state.delegated,
    loading: state.loading,
    nextActions: state.nextActions,
    someday: state.someday,
    ticklerItems: state.ticklerItems,
    waitingFor: state.waitingFor,
    workflowHydrated: state.workflowHydrated,
  };
}

function workflowSliceEqual(
  left: ReturnType<typeof selectWorkflowSlice>,
  right: ReturnType<typeof selectWorkflowSlice>,
): boolean {
  return (
    left.backHalfHydrated === right.backHalfHydrated &&
    left.delegated === right.delegated &&
    left.loading === right.loading &&
    left.nextActions === right.nextActions &&
    left.someday === right.someday &&
    left.ticklerItems === right.ticklerItems &&
    left.waitingFor === right.waitingFor &&
    left.workflowHydrated === right.workflowHydrated
  );
}

function sortUpcomingItems(items: Array<TodoItem>): Array<TodoItem> {
  return [...items].sort((left, right) => right.ageDays - left.ageDays);
}

function sortOldestFirst(items: Array<TodoItem>): Array<TodoItem> {
  return [...items].sort((left, right) => right.ageDays - left.ageDays);
}

function sortNewestFirst(items: Array<TodoItem>): Array<TodoItem> {
  return [...items].sort((left, right) => left.ageDays - right.ageDays);
}

function filterHiddenItems<T extends { uid: string }>(
  items: Array<T>,
  hiddenUids: Set<string>,
): Array<T> {
  if (hiddenUids.size === 0) {
    return items;
  }
  return items.filter((item) => !hiddenUids.has(item.uid));
}

function filterHiddenTicklerGroups(
  groups: Array<TicklerGroup>,
  hiddenUids: Set<string>,
): Array<TicklerGroup> {
  if (hiddenUids.size === 0) {
    return groups;
  }
  return groups
    .map((group) => ({
      ...group,
      items: filterHiddenItems(group.items, hiddenUids),
    }))
    .filter((group) => group.items.length > 0);
}

function getWorkflowStepTitle(
  stepKey: WorkflowContainerStepKey,
  t: ReviewWizardContainerProps<WorkflowContainerStepKey>["t"],
): string {
  if (stepKey === "upcoming") {
    return t("step3Title");
  }
  if (stepKey === "waitingDelegated") {
    return t("step4Title");
  }
  if (stepKey === "someday") {
    return t("step5Title");
  }
  return t("step7Title");
}

function requestDeferredFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(0), 0);
}

function cancelDeferredFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
    return;
  }
  window.clearTimeout(handle);
}

export function WorkflowStepContainer(props: ReviewWizardContainerProps<WorkflowContainerStepKey>) {
  const {
    activeControlsRef,
    isLastStep,
    session,
    settings,
    stepCount,
    stepIndex,
    stepKey,
    store,
    t,
  } = props;
  const state = useStoreSlice(store, selectWorkflowSlice, workflowSliceEqual);
  const [bodyState, setBodyState] = useState(state);
  const [optimisticHiddenUids, setOptimisticHiddenUids] = useState(() => new Set<string>());
  const bodySyncFrameRef = useRef<number | null>(null);
  const dialogBodyRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const workflowController = isWorkflowReviewStepKey(stepKey)
    ? session.getControllerForStep(stepKey)
    : null;
  const ticklerController = stepKey === "tickler" ? session.getControllerForStep("tickler") : null;
  const schedule = useScheduleController(store, settings);
  const queueHiddenUid = (uid: string): void => {
    requestDeferredFrame(() => {
      setOptimisticHiddenUids((current) => {
        if (current.has(uid)) {
          return current;
        }
        const next = new Set(current);
        next.add(uid);
        return next;
      });
    });
  };

  useEffect(() => {
    if (bodyState === state) {
      return;
    }

    if (bodySyncFrameRef.current !== null) {
      cancelDeferredFrame(bodySyncFrameRef.current);
    }

    bodySyncFrameRef.current = requestDeferredFrame(() => {
      bodySyncFrameRef.current = null;
      setBodyState((current) => (current === state ? current : state));
    });

    return () => {
      if (bodySyncFrameRef.current !== null) {
        cancelDeferredFrame(bodySyncFrameRef.current);
        bodySyncFrameRef.current = null;
      }
    };
  }, [bodyState, state]);

  useEffect(() => {
    if (!state.loading) {
      const frameId = requestDeferredFrame(() => {
        setOptimisticHiddenUids((current) => (current.size === 0 ? current : new Set<string>()));
      });
      return () => {
        cancelDeferredFrame(frameId);
      };
    }
  }, [state.loading]);

  useEffect(() => {
    return () => {
      if (bodySyncFrameRef.current !== null) {
        cancelDeferredFrame(bodySyncFrameRef.current);
      }
      if (dirtyRef.current) {
        store.scheduleRefresh(settings, 0);
      }
    };
  }, [settings, store]);

  const stateItems = useMemo(() => {
    if (stepKey === "upcoming") {
      return sortUpcomingItems(state.nextActions);
    }
    if (stepKey === "waitingDelegated") {
      return [...sortOldestFirst(state.delegated), ...sortOldestFirst(state.waitingFor)];
    }
    if (stepKey === "someday") {
      return sortNewestFirst(state.someday);
    }
    return [];
  }, [state.delegated, state.nextActions, state.someday, state.waitingFor, stepKey]);
  const bodyItems = useMemo(() => {
    if (stepKey === "upcoming") {
      return sortUpcomingItems(bodyState.nextActions);
    }
    if (stepKey === "waitingDelegated") {
      return [...sortOldestFirst(bodyState.delegated), ...sortOldestFirst(bodyState.waitingFor)];
    }
    if (stepKey === "someday") {
      return sortNewestFirst(bodyState.someday);
    }
    return [];
  }, [
    bodyState.delegated,
    bodyState.nextActions,
    bodyState.someday,
    bodyState.waitingFor,
    stepKey,
  ]);

  const visibleItems = useMemo(
    () => filterHiddenItems(stateItems, optimisticHiddenUids),
    [optimisticHiddenUids, stateItems],
  );
  const bodyVisibleItems = useMemo(
    () => filterHiddenItems(bodyItems, optimisticHiddenUids),
    [bodyItems, optimisticHiddenUids],
  );
  const bodyVisibleDelegatedItems = useMemo(
    () => sortOldestFirst(filterHiddenItems(bodyState.delegated, optimisticHiddenUids)),
    [bodyState.delegated, optimisticHiddenUids],
  );
  const bodyVisibleWaitingItems = useMemo(
    () => sortOldestFirst(filterHiddenItems(bodyState.waitingFor, optimisticHiddenUids)),
    [bodyState.waitingFor, optimisticHiddenUids],
  );
  const visibleDelegatedItems = useMemo(
    () => sortOldestFirst(filterHiddenItems(state.delegated, optimisticHiddenUids)),
    [optimisticHiddenUids, state.delegated],
  );
  const bodyTicklerGroups = useMemo(
    () => filterHiddenTicklerGroups(bodyState.ticklerItems, optimisticHiddenUids),
    [bodyState.ticklerItems, optimisticHiddenUids],
  );
  const visibleTicklerGroups = useMemo(
    () => filterHiddenTicklerGroups(state.ticklerItems, optimisticHiddenUids),
    [optimisticHiddenUids, state.ticklerItems],
  );
  const {
    activeWorkflowTriage,
    activeWorkflowTriageUid,
    clearWorkflowTriageForUid,
    closeWorkflowTriage,
    delegatedChildPersonRefs,
    delegatedPeople,
    openWorkflowTriage,
    triagePeople,
    triageProjects,
    workflowTriagePosition,
  } = useReviewWizardWorkflowTriage({
    delegatedItems: visibleDelegatedItems,
    dialogBodyRef,
    isOpen: stepKey !== "tickler",
    settings,
    stepKey,
    visibleItems,
  });
  const detailState = useReviewWizardDetailState({
    activeProjectPageTitle: null,
    bodyTicklerGroups,
    delegatedPeople,
    isProjectDetailOpen: false,
    stateTicklerGroups: visibleTicklerGroups,
    stepKey,
    stepTitle: getWorkflowStepTitle(stepKey, t),
  });
  const workflowPopoverState = useMemo(
    () =>
      getReviewWizardWorkflowPopoverState({
        activeWorkflowTriage,
        bodyStepKey: stepKey,
        triagePeople,
        triageProjects,
        workflowTriagePosition,
      }),
    [activeWorkflowTriage, stepKey, triagePeople, triageProjects, workflowTriagePosition],
  );
  const footerState = useMemo(
    () =>
      getReviewWizardFooterState({
        activeDetailKind: detailState.activeDetailKind,
        inboxAtEnd: false,
        inboxIndex: 0,
        isInboxComplete: false,
        isInboxWithItems: false,
        isLastStep,
        primaryForwardLabelKey: getPrimaryForwardLabelKey(stepKey, isLastStep),
        projectsForwardState: {
          action: "advanceStep",
          intent: "primary",
          labelKey: "nextStep",
        },
        savedSummary: false,
        showPrimaryForward: detailState.chromeState.showPrimaryForward,
        stepIndex,
        stepKey,
      }),
    [
      detailState.activeDetailKind,
      detailState.chromeState.showPrimaryForward,
      isLastStep,
      stepIndex,
      stepKey,
    ],
  );
  const title =
    stepKey === "tickler"
      ? detailState.dialogTitleText || t("step7Title")
      : detailState.dialogTitleText;
  const publishedSnapshot = useMemo(
    () => ({
      footer: footerState,
      header: {
        legendSegments: null,
        progressValue: getReviewProgressValue({
          inboxCurrent: 0,
          inboxTotal: 0,
          projectsReviewed: 0,
          projectsTotal: 0,
          stepCount,
          stepIndex,
          stepKey,
        }),
        title,
      },
      stepSlot: {
        error: null,
        mode:
          stepKey === "tickler" && !state.backHalfHydrated && bodyTicklerGroups.length === 0
            ? ("loading" as const)
            : state.loading
              ? ("loading" as const)
              : ("ready" as const),
      },
    }),
    [
      bodyTicklerGroups.length,
      footerState,
      state.backHalfHydrated,
      state.loading,
      stepCount,
      stepIndex,
      stepKey,
      title,
    ],
  );

  useEffect(() => {
    if (stepKey === "tickler") {
      ticklerController?.publishSnapshot("tickler", publishedSnapshot);
      return;
    }
    workflowController?.publishSnapshot(stepKey, publishedSnapshot);
  }, [publishedSnapshot, stepKey, ticklerController, workflowController]);

  useEffect(() => {
    const controls = {
      handleBack: () => {
        if (detailState.activeDetailKind === "person") {
          detailState.closePersonDetail();
          return true;
        }
        if (detailState.activeDetailKind === "tickler") {
          detailState.closeTicklerDetail();
          return true;
        }
        return false;
      },
    };

    return publishStepControls(activeControlsRef, controls);
  }, [activeControlsRef, detailState]);

  useEffect(() => {
    if (!isWorkflowReviewStepKey(stepKey)) {
      return;
    }

    const reconcileArchivedBlock = (uid: string): void => {
      window.setTimeout(() => {
        const blockString =
          window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid])?.[
            ":block/string"
          ] ?? "";
        if (!blockString || isOpenTaskText(blockString)) {
          return;
        }
        queueHiddenUid(uid);
        dirtyRef.current = true;
      }, 90);
    };

    const onArchiveKeyDown = (event: KeyboardEvent): void => {
      const activeElement = document.activeElement;
      const reviewDialog = document.querySelector<HTMLElement>(".roam-gtd-review-dialog");
      const focusedBlockFromUi = (
        window.roamAlphaAPI.ui as typeof window.roamAlphaAPI.ui & {
          getFocusedBlock?: () => { "block-uid"?: string } | null;
        }
      ).getFocusedBlock?.();
      const focusedBlockUidFromUi = focusedBlockFromUi?.["block-uid"] ?? null;
      const blockUid =
        focusedBlockUidFromUi ??
        (activeElement && activeElement.nodeType === Node.ELEMENT_NODE
          ? ((activeElement as HTMLElement)
              .closest<HTMLElement>("[data-uid]")
              ?.getAttribute("data-uid") ??
            (activeElement as HTMLElement)
              .closest<HTMLElement>("[id^='block-input-']")
              ?.id.replace(/^block-input-/, "") ??
            null)
          : null);
      const blockString = blockUid
        ? (window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", blockUid])?.[
            ":block/string"
          ] ?? "")
        : "";

      void dispatchReviewWizardArchiveKeydown({
        activeElement,
        blockString,
        event,
        focusedBlockUidFromUi,
        getFocusedModalBlockUid: () => blockUid,
        isWorkflowStepActive: true,
        onReconcileFocusedUiBlock: reconcileArchivedBlock,
        onToggleArchive: ({ hideOptimistically, nextText, uid }) => {
          if (nextText !== blockString) {
            void window.roamAlphaAPI.updateBlock({
              block: { string: nextText, uid },
            });
          }
          if (hideOptimistically) {
            queueHiddenUid(uid);
            dirtyRef.current = true;
          }
        },
        reviewDialog,
      });
    };

    window.addEventListener("keydown", onArchiveKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onArchiveKeyDown, true);
    };
  }, [stepKey]);

  const handleItemProcessed = (uid: string, action: "done" | "keep" | "someday" | "triage") => {
    clearWorkflowTriageForUid(uid);
    queueHiddenUid(uid);
    if (action !== "keep") {
      dirtyRef.current = true;
    }
  };

  if (stepKey === "tickler") {
    const ticklerItemCount = getTicklerGroupItemCount(bodyTicklerGroups);

    return (
      <div
        ref={dialogBodyRef}
        style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}
      >
        <p
          style={{
            color: "#A5A5A5",
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            minHeight: 18,
            paddingBottom: 12,
          }}
        >
          {t("ticklerThisMonth", ticklerItemCount)}
        </p>
        <TicklerStep
          activeDetailPageUid={detailState.ticklerDetailPageUid}
          groups={bodyTicklerGroups}
          onItemProcessed={handleItemProcessed}
          onOpenDetail={detailState.openTicklerDetail}
          onOpenInSidebar={openInSidebar}
          onPromoteToNext={async (item) => {
            const didWrite = await replaceTags(
              item.uid,
              [
                settings.tagNextAction,
                settings.tagWaitingFor,
                settings.tagDelegated,
                settings.tagSomeday,
              ],
              settings.tagNextAction,
            );

            if (!didWrite) {
              return;
            }

            handleItemProcessed(item.uid, "done");
            showTriageToast(t("actionActivate"), "success");
          }}
          settings={settings}
          t={t}
        />
        {schedule.schedulingUid ? (
          <div style={{ padding: "0 16px 16px" }}>
            <SchedulePopover
              canUnset={schedule.canUnset}
              initialValue={schedule.initialValue}
              onCancel={schedule.handleScheduleCancel}
              onConfirm={schedule.handleScheduleConfirm}
              onUnset={schedule.handleScheduleUnset}
              t={t}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={dialogBodyRef}
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}
    >
      {stepKey === "upcoming" ? (
        <NextActionsStep
          activeTriageUid={activeWorkflowTriageUid}
          hideEmptyState={!state.workflowHydrated || !bodyState.workflowHydrated}
          items={bodyVisibleItems}
          onItemProcessed={handleItemProcessed}
          onOpenTriage={openWorkflowTriage}
          settings={settings}
          t={t}
        />
      ) : stepKey === "waitingDelegated" ? (
        <WaitingForStep
          activePersonDetail={detailState.activePersonDetail}
          activeTriageUid={activeWorkflowTriageUid}
          delegatedChildPersonRefs={delegatedChildPersonRefs}
          delegatedItems={bodyVisibleDelegatedItems}
          delegatedPeople={delegatedPeople}
          hideEmptyState={!state.workflowHydrated || !bodyState.workflowHydrated}
          onItemProcessed={handleItemProcessed}
          onOpenPersonDetail={detailState.openPersonDetail}
          onOpenTriage={openWorkflowTriage}
          settings={settings}
          t={t}
          waitingItems={bodyVisibleWaitingItems}
        />
      ) : (
        <SomedayMaybeStep
          activeTriageUid={activeWorkflowTriageUid}
          hideEmptyState={!state.workflowHydrated || !bodyState.workflowHydrated}
          items={bodyVisibleItems}
          onItemProcessed={handleItemProcessed}
          onOpenTriage={openWorkflowTriage}
          settings={settings}
          t={t}
        />
      )}
      {workflowPopoverState ? (
        <div
          className="roam-gtd-workflow-triage-layer"
          style={{
            left: workflowPopoverState.x,
            top: workflowPopoverState.y + 6,
          }}
        >
          <WorkflowProcessPopover
            anchorElement={workflowPopoverState.triage.anchorElement}
            currentTag={workflowPopoverState.triage.currentTag}
            initialPeople={workflowPopoverState.initialPeople}
            initialProjects={workflowPopoverState.initialProjects}
            isOpen
            onCancel={closeWorkflowTriage}
            onProcessComplete={(uid, shouldHide) => {
              closeWorkflowTriage();
              if (shouldHide) {
                handleItemProcessed(uid, "triage");
              }
            }}
            settings={settings}
            t={t}
            targetText={workflowPopoverState.triage.item.text}
            targetUid={workflowPopoverState.triageUid}
          />
        </div>
      ) : null}
    </div>
  );
}
