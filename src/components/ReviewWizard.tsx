import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TranslatorFn } from "../i18n";
import type { DashboardStepController } from "../review/controllers/dashboard-step-controller";
import { REVIEW_DIALOG_STYLE } from "../review/dialog-layout";
import { createReviewSession } from "../review/session/create-review-session";
import type { ReviewSession, ReviewSessionSnapshot } from "../review/session/types";
import {
  dispatchReviewWizardNavigationKeydown,
  dispatchReviewWizardNavigationKeyup,
} from "../review/wizard-keyboard";
import type { ReviewWizardFooterActionId } from "../review/wizard-navigation";
import { getInitialReviewStepIndex, persistReviewStepIndex } from "../review/wizard-runtime";
import {
  getPrimaryForwardLabelKey,
  getProjectsDetailChromeState,
  getProjectsDetailDialogTitle,
  getProjectsStepForwardState,
  getReviewProgressValue,
  getSteps,
  shouldShowInboxZeroLoading,
  shouldShowStepFastForwardButton,
  shouldShowTicklerStep,
  type ReviewWizardMode,
  type WizardStepKey,
} from "../review/wizard-support";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import { DashboardContainer } from "./review-wizard/containers/DashboardContainer";
import { InboxZeroStepContainer } from "./review-wizard/containers/InboxZeroStepContainer";
import { ProjectsStepContainer } from "./review-wizard/containers/ProjectsStepContainer";
import { type ReviewWizardStepControls } from "./review-wizard/containers/types";
import { WorkflowStepContainer } from "./review-wizard/containers/WorkflowStepContainer";
import { ReviewWizardShell } from "./ReviewWizardShell";
import { TriggersStep } from "./TriggersStep";
import { isWeeklyReviewEditableElement as isEditableElement } from "./WeeklyReviewRoamBlock";

export {
  getPrimaryForwardLabelKey,
  getProjectsDetailChromeState,
  getProjectsDetailDialogTitle,
  getProjectsStepForwardState,
  getReviewProgressValue,
  shouldShowInboxZeroLoading,
  shouldShowStepFastForwardButton,
  shouldShowTicklerStep,
};
export type { ReviewWizardMode };

export interface ReviewWizardProps {
  isOpen: boolean;
  mode?: ReviewWizardMode;
  onAfterClose?: () => void;
  onClose: () => void;
  settings: GtdSettings;
  store: ReturnType<typeof createGtdStore>;
  t: TranslatorFn;
}

function getFooterLabels(t: TranslatorFn) {
  return {
    back: t("back"),
    finish: t("finish"),
    next: t("next"),
    nextItem: t("nextItem"),
    nextStep: t("nextStep"),
    previousItem: t("previousItem"),
    saveWeeklySummary: t("saveWeeklySummary"),
    summarySaved: t("summarySaved"),
  };
}

function clampStepIndex(stepCount: number, stepIndex: number): number {
  if (stepCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(stepCount - 1, stepIndex));
}

function useOptionalReviewSessionSnapshot(
  session: ReviewSession | null,
): ReviewSessionSnapshot | null {
  const [snapshot, setSnapshot] = useState<ReviewSessionSnapshot | null>(() =>
    session ? session.getSnapshot() : null,
  );

  useEffect(() => {
    const nextSnapshot = session ? session.getSnapshot() : null;
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }
      setSnapshot((current) => (current === nextSnapshot ? current : nextSnapshot));
    });

    if (!session) {
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = session.subscribe(() => {
      const updatedSnapshot = session.getSnapshot();
      setSnapshot((current) => (current === updatedSnapshot ? current : updatedSnapshot));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session]);

  return session ? (snapshot ?? session.getSnapshot()) : snapshot;
}

export function ReviewWizard({
  isOpen,
  mode = "weekly",
  onAfterClose,
  onClose,
  settings,
  store,
  t,
}: ReviewWizardProps) {
  const steps = useMemo(() => getSteps(t, mode), [mode, t]);
  const [stepIndex, setStepIndex] = useState(() => getInitialReviewStepIndex(mode));
  const [stepReady, setStepReady] = useState(false);
  const activeControlsRef = useRef<ReviewWizardStepControls | null>(null);
  const session = useMemo(
    () =>
      isOpen
        ? createReviewSession({
            mode,
            settings,
            store,
            t,
          })
        : null,
    [isOpen, mode, settings, store, t],
  );

  useEffect(() => {
    return () => {
      session?.dispose();
    };
  }, [session]);

  useEffect(() => {
    if (!isOpen) {
      activeControlsRef.current = null;
      return;
    }

    setStepIndex(getInitialReviewStepIndex(mode));
  }, [isOpen, mode]);

  const safeStepIndex = clampStepIndex(steps.length, stepIndex);
  const step = steps[safeStepIndex] ?? steps[0];
  const isLastStep = safeStepIndex === steps.length - 1;

  useEffect(() => {
    persistReviewStepIndex(mode, safeStepIndex);
  }, [mode, safeStepIndex]);

  useEffect(() => {
    if (safeStepIndex !== stepIndex) {
      setStepIndex(safeStepIndex);
    }
  }, [safeStepIndex, stepIndex]);

  useEffect(() => {
    if (!isOpen || !step) {
      setStepReady(false);
      return;
    }

    if (step.key === "triggerList") {
      setStepReady(true);
      return;
    }

    setStepReady(false);
    const frameId = window.requestAnimationFrame(() => {
      setStepReady(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen || !session || !stepReady || !step) {
      return;
    }

    if (session.getControllerDomainForStep(step.key) == null) {
      return;
    }

    if (
      session.getControllerForStep(step.key) == null ||
      session.getSnapshot().activeStepKey !== step.key
    ) {
      session.activate(step.key).catch(() => undefined);
    }
  }, [isOpen, session, step, stepReady]);

  useEffect(() => {
    if (!isOpen || !session || !step) {
      return;
    }

    session.activate(step.key).catch(() => undefined);
  }, [isOpen, session, step]);

  const footerLabels = useMemo(() => getFooterLabels(t), [t]);
  const sessionSnapshot = useOptionalReviewSessionSnapshot(session);
  const activeStepSlotMode =
    sessionSnapshot?.activeStep.stepSnapshot?.stepSlot.mode ??
    (sessionSnapshot?.activeStep.controllerDomain === "static" ? "ready" : "loading");
  const navigationLocked = step?.key === "inbox" && activeStepSlotMode === "loading";
  const activeRightAction = sessionSnapshot?.activeStep.stepSnapshot?.footer.rightAction;
  const showFastForwardButton = !isLastStep && activeRightAction !== null;

  const activateStepIndex = useCallback(
    (nextStepIndex: number) => {
      const clampedIndex = clampStepIndex(steps.length, nextStepIndex);
      const nextStep = steps[clampedIndex];
      if (!nextStep) {
        return;
      }

      activeControlsRef.current = null;
      setStepIndex(clampedIndex);
      session?.activate(nextStep.key).catch(() => undefined);
    },
    [session, steps],
  );

  const activateStepKey = useCallback(
    (nextStepKey: WizardStepKey) => {
      const nextStepIndex = steps.findIndex((candidate) => candidate.key === nextStepKey);
      if (nextStepIndex < 0) {
        return;
      }
      activateStepIndex(nextStepIndex);
    },
    [activateStepIndex, steps],
  );

  const onCloseWizard = useCallback(() => {
    activeControlsRef.current = null;
    try {
      onClose();
    } finally {
      onAfterClose?.();
    }
  }, [onAfterClose, onClose]);

  const advanceToNextStep = useCallback(
    ({
      allowWhileLoading = false,
      closeOnLastStep,
    }: {
      allowWhileLoading?: boolean;
      closeOnLastStep: boolean;
    }) => {
      if (!allowWhileLoading && navigationLocked) {
        return;
      }

      if (isLastStep) {
        if (closeOnLastStep) {
          onCloseWizard();
        }
        return;
      }

      activateStepIndex(safeStepIndex + 1);
    },
    [activateStepIndex, isLastStep, navigationLocked, onCloseWizard, safeStepIndex],
  );

  const handleNavigateBack = useCallback(() => {
    if (navigationLocked) {
      return;
    }

    if (activeControlsRef.current?.handleBack?.()) {
      return;
    }

    if (safeStepIndex > 0) {
      activateStepIndex(safeStepIndex - 1);
    }
  }, [activateStepIndex, navigationLocked, safeStepIndex]);

  const handleNavigateForward = useCallback(() => {
    if (navigationLocked) {
      return;
    }

    if (activeControlsRef.current?.handleForward?.()) {
      return;
    }

    advanceToNextStep({ closeOnLastStep: true });
  }, [advanceToNextStep, navigationLocked]);

  const handleFooterAction = useCallback(
    (action: ReviewWizardFooterActionId) => {
      if (action === "back") {
        handleNavigateBack();
        return;
      }

      if (action === "previousItem") {
        activeControlsRef.current?.handlePreviousItem?.();
        return;
      }

      if (action === "saveSummaryAndClose") {
        const dashboardController = session?.getControllerForStep(
          "stats",
        ) as DashboardStepController | null;
        void (activeControlsRef.current?.saveSummary?.() ?? dashboardController?.saveSummary?.());
        onCloseWizard();
        return;
      }

      handleNavigateForward();
    },
    [handleNavigateBack, handleNavigateForward, onCloseWizard, session],
  );

  const handleFastForwardMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  const handleFastForwardStep = useCallback(() => {
    advanceToNextStep({
      allowWhileLoading: true,
      closeOnLastStep: false,
    });
  }, [advanceToNextStep]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onNavigationKeyDown = (event: KeyboardEvent): void => {
      dispatchReviewWizardNavigationKeydown({
        activeElement: document.activeElement,
        event,
        isEditableElement,
        onNavigateBack: handleNavigateBack,
        onNavigateForward: handleNavigateForward,
      });
    };

    const onNavigationKeyUp = (event: KeyboardEvent): void => {
      dispatchReviewWizardNavigationKeyup({
        activeElement: document.activeElement,
        event,
        isEditableElement,
      });
    };

    window.addEventListener("keydown", onNavigationKeyDown, true);
    window.addEventListener("keyup", onNavigationKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onNavigationKeyDown, true);
      window.removeEventListener("keyup", onNavigationKeyUp, true);
    };
  }, [handleNavigateBack, handleNavigateForward, isOpen]);

  const renderActiveStep = useCallback(() => {
    if (!session || !step) {
      return null;
    }

    if (step.key !== "triggerList" && !stepReady) {
      return null;
    }

    if (step.key === "inbox") {
      return (
        <InboxZeroStepContainer
          activeControlsRef={activeControlsRef}
          isLastStep={isLastStep}
          session={session}
          settings={settings}
          stepCount={steps.length}
          stepIndex={safeStepIndex}
          stepKey="inbox"
          store={store}
          t={t}
        />
      );
    }

    if (step.key === "projects") {
      return (
        <ProjectsStepContainer
          activeControlsRef={activeControlsRef}
          isLastStep={isLastStep}
          session={session}
          settings={settings}
          stepCount={steps.length}
          stepIndex={safeStepIndex}
          stepKey="projects"
          store={store}
          t={t}
        />
      );
    }

    if (
      step.key === "upcoming" ||
      step.key === "waitingDelegated" ||
      step.key === "someday" ||
      step.key === "tickler"
    ) {
      return (
        <WorkflowStepContainer
          activeControlsRef={activeControlsRef}
          isLastStep={isLastStep}
          session={session}
          settings={settings}
          stepCount={steps.length}
          stepIndex={safeStepIndex}
          stepKey={step.key}
          store={store}
          t={t}
        />
      );
    }

    if (step.key === "stats") {
      return (
        <DashboardContainer
          activeControlsRef={activeControlsRef}
          isLastStep={isLastStep}
          session={session}
          settings={settings}
          stepCount={steps.length}
          stepIndex={safeStepIndex}
          stepKey="stats"
          store={store}
          t={t}
        />
      );
    }

    return <TriggersStep pageName={settings.triggerListPage} t={t} />;
  }, [isLastStep, safeStepIndex, session, settings, step, stepReady, steps.length, store, t]);

  if (!session) {
    return null;
  }

  return (
    <ReviewWizardShell
      autoFocus={false}
      canEscapeKeyClose={false}
      canOutsideClickClose
      enforceFocus={false}
      fastForwardLabel={t("nextStep")}
      isOpen={isOpen}
      labels={footerLabels}
      onAction={handleFooterAction}
      onClose={onCloseWizard}
      onFastForward={handleFastForwardStep}
      onFastForwardMouseDown={handleFastForwardMouseDown}
      portalClassName="roam-gtd-portal"
      renderActiveStep={renderActiveStep}
      session={session}
      showFastForwardButton={showFastForwardButton}
      style={REVIEW_DIALOG_STYLE}
    />
  );
}
