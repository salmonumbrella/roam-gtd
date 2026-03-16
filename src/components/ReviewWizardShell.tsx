import { Dialog } from "@blueprintjs/core";
import React, { useEffect, useMemo, useRef } from "react";

import type { ReviewSession } from "../review/session/types";
import { useReviewSessionSnapshot } from "../review/session/use-review-session-snapshot";
import { createReviewShortcutKeyDownHandler } from "../review/shortcuts";
import {
  getReviewWizardFooterState,
  type ReviewWizardFooterButton,
  type ReviewWizardFooterLegendSegment,
} from "../review/wizard-navigation";
import { getPrimaryForwardLabelKey, getReviewProgressValue } from "../review/wizard-support";
import { ReviewStepSlot } from "./review-wizard/ReviewStepSlot";
import {
  ReviewWizardFooter,
  type ReviewWizardFooterLabels,
} from "./review-wizard/ReviewWizardFooter";
import { ReviewWizardHeader, ReviewWizardProgressBar } from "./review-wizard/ReviewWizardHeader";

const DEFAULT_FOOTER_LABELS = {
  back: "Back",
  finish: "Finish",
  next: "Next",
  nextItem: "Next",
  nextStep: "Next Step",
  previousItem: "Previous Item",
  saveWeeklySummary: "Save Weekly Summary",
  summarySaved: "Summary Saved",
};

const DEFAULT_SHORTCUT_SETTINGS = {
  hotkeyDelegate: "d",
  hotkeyDone: "e",
  hotkeyProject: "p",
  hotkeySomeday: "s",
  hotkeyWatch: "w",
};

function shouldSuppressShellModifierShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || !(event.metaKey || event.ctrlKey)) {
    return false;
  }

  const key = event.key.toLowerCase();
  if (key !== "p" && key !== "z") {
    return false;
  }

  return true;
}

function getDefaultShellProgressValue(snapshot: ReturnType<ReviewSession["getSnapshot"]>): number {
  const stepIndex = snapshot.steps.findIndex((step) => step.key === snapshot.activeStepKey);
  return getReviewProgressValue({
    inboxCurrent: 0,
    inboxTotal: 0,
    projectsReviewed: 0,
    projectsTotal: 0,
    stepCount: snapshot.steps.length,
    stepIndex: Math.max(0, stepIndex),
    stepKey: snapshot.activeStepKey,
  });
}

function getDefaultShellFooter(snapshot: ReturnType<ReviewSession["getSnapshot"]>): {
  leftAction: ReviewWizardFooterButton | null;
  rightAction: ReviewWizardFooterButton | null;
} {
  const stepIndex = Math.max(
    0,
    snapshot.steps.findIndex((step) => step.key === snapshot.activeStepKey),
  );
  const isLastStep = stepIndex === snapshot.steps.length - 1;

  return getReviewWizardFooterState({
    activeDetailKind: "none",
    inboxAtEnd: false,
    inboxIndex: 0,
    isInboxComplete: snapshot.activeStepKey !== "inbox",
    isInboxWithItems: snapshot.activeStepKey === "inbox",
    isLastStep,
    primaryForwardLabelKey: getPrimaryForwardLabelKey(snapshot.activeStepKey, isLastStep),
    projectsForwardState: {
      action: "advanceStep",
      intent: "primary",
      labelKey: "nextStep",
    },
    savedSummary: false,
    showPrimaryForward: true,
    stepIndex,
    stepKey: snapshot.activeStepKey,
  });
}

export function ReviewWizardShell(props: {
  autoFocus?: boolean;
  canEscapeKeyClose?: boolean;
  canOutsideClickClose?: boolean;
  enforceFocus?: boolean;
  fastForwardLabel?: string;
  isOpen: boolean;
  labels?: ReviewWizardFooterLabels;
  leftAction?: ReviewWizardFooterButton | null;
  legendSegments?: Array<ReviewWizardFooterLegendSegment> | null;
  onAction?: (action: ReviewWizardFooterButton["action"]) => void;
  onClose: () => void;
  onFastForward?: () => void;
  onFastForwardMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  portalClassName?: string;
  progressValue?: number;
  registerShortcutHandler?: boolean;
  renderActiveStep?: () => React.ReactNode;
  rightAction?: ReviewWizardFooterButton | null;
  session: ReviewSession;
  shouldAutoActivate?: boolean;
  showFastForwardButton?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  const shouldAutoActivate = props.shouldAutoActivate ?? true;
  const shouldRegisterShortcutHandler = props.registerShortcutHandler ?? true;
  const snapshot = useReviewSessionSnapshot(props.session);
  const autoActivatedSessionRef = useRef<ReviewSession | null>(null);
  const activeSnapshot = snapshot.activeStep.stepSnapshot;
  const shellFooter = {
    leftAction:
      props.leftAction ??
      activeSnapshot?.footer.leftAction ??
      getDefaultShellFooter(snapshot).leftAction,
    rightAction:
      props.rightAction ??
      activeSnapshot?.footer.rightAction ??
      getDefaultShellFooter(snapshot).rightAction,
  };
  const shellLegendSegments = props.legendSegments ?? activeSnapshot?.header.legendSegments ?? null;
  const shellProgressValue =
    props.progressValue ??
    activeSnapshot?.header.progressValue ??
    getDefaultShellProgressValue(snapshot);
  const shellTitle = props.title ?? activeSnapshot?.header.title ?? snapshot.activeStep.step.title;
  const stepSlotSnapshot =
    activeSnapshot?.stepSlot ??
    (snapshot.activeStep.controllerDomain === "static"
      ? { error: null, mode: "ready" as const }
      : { error: null, mode: "loading" as const });

  const shortcutHandler = useMemo(
    () =>
      createReviewShortcutKeyDownHandler({
        dispatchInboxShortcut: () => undefined,
        getActiveReviewOverlayCount: () => (props.isOpen ? 1 : 0),
        getCachedSettings: () => DEFAULT_SHORTCUT_SETTINGS,
      }),
    [props.isOpen],
  );

  useEffect(() => {
    if (!props.isOpen || !shouldAutoActivate) {
      autoActivatedSessionRef.current = null;
      return;
    }

    if (autoActivatedSessionRef.current === props.session) {
      return;
    }

    // Cross-step warmup stays in the session/controller layer. The shell only
    // activates the current step and renders the latest snapshot.
    autoActivatedSessionRef.current = props.session;
    props.session.activate(snapshot.activeStepKey).catch(() => undefined);
  }, [props.isOpen, props.session, shouldAutoActivate, snapshot.activeStepKey]);

  useEffect(() => {
    if (!props.isOpen || !shouldRegisterShortcutHandler) {
      return;
    }

    const onModifierKeyDown = (event: KeyboardEvent): void => {
      if (!shouldSuppressShellModifierShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener("keydown", onModifierKeyDown, true);
    window.addEventListener("keydown", shortcutHandler, true);
    return () => {
      document.removeEventListener("keydown", onModifierKeyDown, true);
      window.removeEventListener("keydown", shortcutHandler, true);
    };
  }, [props.isOpen, shortcutHandler, shouldRegisterShortcutHandler]);

  return (
    <Dialog
      autoFocus={props.autoFocus ?? false}
      canEscapeKeyClose={props.canEscapeKeyClose ?? false}
      canOutsideClickClose={props.canOutsideClickClose ?? true}
      className="roam-gtd-dialog roam-gtd-review-dialog"
      enforceFocus={props.enforceFocus ?? false}
      isOpen={props.isOpen}
      onClose={props.onClose}
      portalClassName={props.portalClassName}
      style={props.style}
      title={
        <ReviewWizardHeader
          fastForwardLabel={props.fastForwardLabel ?? ""}
          onFastForward={props.onFastForward ?? (() => undefined)}
          onFastForwardMouseDown={props.onFastForwardMouseDown ?? (() => undefined)}
          showFastForwardButton={props.showFastForwardButton ?? false}
          title={shellTitle}
        />
      }
    >
      <div
        className="bp3-dialog-body"
        data-step-key={snapshot.activeStepKey}
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          minHeight: 0,
          position: "relative",
        }}
      >
        <ReviewWizardProgressBar progressValue={shellProgressValue} />
        <ReviewStepSlot
          onRetry={() => {
            props.session.activate(snapshot.activeStepKey).catch(() => undefined);
          }}
          snapshot={stepSlotSnapshot}
        >
          {props.renderActiveStep?.()}
        </ReviewStepSlot>
      </div>
      <ReviewWizardFooter
        labels={props.labels ?? DEFAULT_FOOTER_LABELS}
        leftAction={shellFooter.leftAction}
        legendSegments={shellLegendSegments}
        onAction={props.onAction ?? (() => undefined)}
        rightAction={shellFooter.rightAction}
      />
    </Dialog>
  );
}
