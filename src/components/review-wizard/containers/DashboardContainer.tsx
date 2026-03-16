import React, { useEffect, useLayoutEffect, useMemo } from "react";

import { getISOWeekBounds } from "../../../date-utils";
import type { DashboardStepController } from "../../../review/controllers/dashboard-step-controller";
import { useStoreSlice } from "../../../review/use-store-slice";
import { getReviewWizardFooterState } from "../../../review/wizard-navigation";
import { getReviewProgressValue } from "../../../review/wizard-support";
import { computeAvgTime } from "../../../store/dashboard-derived";
import { VelocityDashboard } from "../../VelocityDashboard";
import { publishStepControls, type ReviewWizardContainerProps } from "./types";

type DashboardStateSlice = ReturnType<typeof selectDashboardSlice>;

type DashboardContainerProps = ReviewWizardContainerProps<"stats">;

function selectDashboardSlice(state: ReturnType<DashboardContainerProps["store"]["getSnapshot"]>) {
  return {
    backHalfHydrated: state.backHalfHydrated,
    completedThisWeek: state.completedThisWeek,
    delegated: state.delegated,
    lastWeekMetrics: state.lastWeekMetrics,
    nextActions: state.nextActions,
    triagedThisWeekCount: state.triagedThisWeekCount,
    waitingFor: state.waitingFor,
  };
}

function dashboardSliceEqual(left: DashboardStateSlice, right: DashboardStateSlice): boolean {
  return (
    left.backHalfHydrated === right.backHalfHydrated &&
    left.completedThisWeek === right.completedThisWeek &&
    left.delegated === right.delegated &&
    left.lastWeekMetrics === right.lastWeekMetrics &&
    left.nextActions === right.nextActions &&
    left.triagedThisWeekCount === right.triagedThisWeekCount &&
    left.waitingFor === right.waitingFor
  );
}

export function DashboardContainer(props: DashboardContainerProps) {
  const { activeControlsRef, isLastStep, session, stepCount, stepIndex, store, t } = props;
  const state = useStoreSlice(store, selectDashboardSlice, dashboardSliceEqual);
  const controller = session.getControllerForStep("stats") as DashboardStepController | null;
  const savedSummary = controller?.getSnapshot("stats").summary.savedSummary ?? false;

  const { end: weekEnd, start: weekStart } = useMemo(() => getISOWeekBounds(new Date()), []);
  const avgTimeDays = useMemo(
    () => computeAvgTime(state.completedThisWeek),
    [state.completedThisWeek],
  );

  const footerState = useMemo(
    () =>
      getReviewWizardFooterState({
        activeDetailKind: "none",
        inboxAtEnd: false,
        inboxIndex: 0,
        isInboxComplete: false,
        isInboxWithItems: false,
        isLastStep,
        primaryForwardLabelKey: "finish",
        projectsForwardState: {
          action: "advanceStep",
          intent: "primary",
          labelKey: "nextStep",
        },
        savedSummary,
        showPrimaryForward: true,
        stepIndex,
        stepKey: "stats",
      }),
    [isLastStep, savedSummary, stepIndex],
  );
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
          stepKey: "stats",
        }),
        title: t("weeklyReview"),
      },
      stepSlot: {
        error: null,
        mode: "ready" as const,
      },
    }),
    [footerState, stepCount, stepIndex, t],
  );

  useEffect(() => {
    controller?.publishSnapshot("stats", publishedSnapshot);
  }, [controller, publishedSnapshot]);

  useLayoutEffect(() => {
    const controls = {
      handleBack: () => false,
      saveSummary: () => controller?.saveSummary(),
    };

    return publishStepControls(activeControlsRef, controls);
  }, [activeControlsRef, controller]);

  return (
    <VelocityDashboard
      avgTimeDays={avgTimeDays}
      completedCount={state.completedThisWeek.length}
      delegatedCount={state.delegated.length}
      lastWeekMetrics={state.lastWeekMetrics}
      loading={!state.backHalfHydrated}
      t={t}
      triagedCount={state.triagedThisWeekCount}
      upcomingCount={state.nextActions.length}
      waitingForCount={state.waitingFor.length}
      weekEnd={weekEnd}
      weekStart={weekStart}
    />
  );
}
