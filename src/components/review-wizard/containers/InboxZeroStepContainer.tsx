import React, { useEffect, useMemo, useRef, useState } from "react";

import { createTriageInputService } from "../../../review/session/triage-input-service";
import { useStoreSlice } from "../../../review/use-store-slice";
import {
  getReviewWizardFooterLegendSegments,
  getReviewWizardFooterState,
} from "../../../review/wizard-navigation";
import {
  getPrimaryForwardLabelKey,
  getReviewProgressValue,
  shouldShowInboxZeroLoading,
} from "../../../review/wizard-support";
import { todoItemsEqual } from "../../../store/refresh-policy";
import { InboxZeroStep } from "../../InboxZeroStep";
import { publishStepControls, type ReviewWizardContainerProps } from "./types";

function selectInboxSlice(
  state: ReturnType<ReviewWizardContainerProps<"inbox">["store"]["getSnapshot"]>,
) {
  return {
    inbox: state.inbox,
    loading: state.loading,
  };
}

function inboxSliceEqual(
  left: ReturnType<typeof selectInboxSlice>,
  right: ReturnType<typeof selectInboxSlice>,
): boolean {
  return left.loading === right.loading && todoItemsEqual(left.inbox, right.inbox);
}

function getFooterLegendSegments(settings: ReviewWizardContainerProps<"inbox">["settings"]) {
  const userHotkeys = new Set(
    [
      settings.hotkeyWatch,
      settings.hotkeyDelegate,
      settings.hotkeySomeday,
      settings.hotkeyProject,
      settings.hotkeyDone,
    ].filter(Boolean),
  );

  return getReviewWizardFooterLegendSegments({
    delegateHotkey: settings.hotkeyDelegate || "d",
    projectHotkey: settings.hotkeyProject || "p",
    referenceHotkey: userHotkeys.has("r") ? null : "r",
    somedayHotkey: settings.hotkeySomeday || "s",
    stepKey: "inbox",
    upHotkey: userHotkeys.has("u") ? null : "u",
    watchHotkey: settings.hotkeyWatch || "w",
  });
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

export function InboxZeroStepContainer(props: ReviewWizardContainerProps<"inbox">) {
  const { activeControlsRef, isLastStep, session, settings, stepCount, stepIndex, store, t } =
    props;
  const { inbox, loading } = useStoreSlice(store, selectInboxSlice, inboxSliceEqual);
  const [inboxAtEnd, setInboxAtEnd] = useState(false);
  const [inboxBootstrapping, setInboxBootstrapping] = useState(() => inbox.length === 0);
  const [inboxIndex, setInboxIndex] = useState(0);
  const [inboxProgressCurrent, setInboxProgressCurrent] = useState(0);
  const [inboxProgressTotal, setInboxProgressTotal] = useState(0);
  const goBackRef = useRef<(() => void) | null>(null);
  const skipItemRef = useRef<(() => void) | null>(null);
  const loadStartedRef = useRef(false);
  const controller = session.getControllerForStep("inbox");
  const triageService = useMemo(
    () =>
      createTriageInputService({
        settings,
        store,
      }),
    [settings, store],
  );
  const footerLegendSegments = useMemo(() => getFooterLegendSegments(settings), [settings]);
  const footerState = useMemo(
    () =>
      getReviewWizardFooterState({
        activeDetailKind: "none",
        inboxAtEnd,
        inboxIndex,
        isInboxComplete: inbox.length === 0 && !loading && !inboxBootstrapping,
        isInboxWithItems: inbox.length > 0,
        isLastStep,
        primaryForwardLabelKey: getPrimaryForwardLabelKey("inbox", isLastStep),
        projectsForwardState: {
          action: "advanceStep",
          intent: "primary",
          labelKey: "nextStep",
        },
        savedSummary: false,
        showPrimaryForward: true,
        stepIndex,
        stepKey: "inbox",
      }),
    [inbox.length, inboxAtEnd, inboxBootstrapping, inboxIndex, isLastStep, loading, stepIndex],
  );
  const showInboxZeroLoading = shouldShowInboxZeroLoading(inboxBootstrapping, inbox.length);
  const publishedSnapshot = useMemo(
    () => ({
      footer: footerState,
      header: {
        legendSegments: footerLegendSegments,
        progressValue: getReviewProgressValue({
          inboxCurrent: inboxProgressCurrent,
          inboxTotal: inboxProgressTotal,
          projectsReviewed: 0,
          projectsTotal: 0,
          stepCount,
          stepIndex,
          stepKey: "inbox",
        }),
        title: stepCount === 1 ? t("dailyReviewTitle") : t("step1Title"),
      },
      stepSlot: {
        error: null,
        mode: showInboxZeroLoading ? ("loading" as const) : ("ready" as const),
      },
    }),
    [
      footerLegendSegments,
      footerState,
      inboxProgressCurrent,
      inboxProgressTotal,
      showInboxZeroLoading,
      stepCount,
      stepIndex,
      t,
    ],
  );

  useEffect(() => {
    if (loading) {
      loadStartedRef.current = true;
      return;
    }

    if (loadStartedRef.current) {
      const frameId = requestDeferredFrame(() => {
        setInboxBootstrapping(false);
      });
      return () => {
        cancelDeferredFrame(frameId);
      };
    }
  }, [loading]);

  useEffect(() => {
    controller?.publishSnapshot("inbox", publishedSnapshot);
  }, [controller, publishedSnapshot]);

  useEffect(() => {
    const controls = {
      handleBack: () => {
        if (inboxIndex <= 0) {
          return false;
        }
        goBackRef.current?.();
        return true;
      },
      handleForward: () => {
        if (inbox.length === 0 || inboxAtEnd) {
          return false;
        }
        skipItemRef.current?.();
        return true;
      },
      handlePreviousItem: () => {
        goBackRef.current?.();
      },
    };

    return publishStepControls(activeControlsRef, controls);
  }, [activeControlsRef, inbox.length, inboxAtEnd, inboxIndex]);

  const reportProgress = (atEnd: boolean, current: number, total: number): void => {
    controller?.reportInboxProgress?.({ atEnd, current, total });
  };

  return (
    <InboxZeroStep
      goBackRef={goBackRef}
      isLoading={showInboxZeroLoading}
      items={inbox}
      onAdvance={() => {
        store.scheduleRefresh(settings, 800, { scope: "inboxOnly" });
      }}
      onAtEndChange={(atEnd) => {
        setInboxAtEnd((previous) => (previous === atEnd ? previous : atEnd));
        reportProgress(atEnd, inboxProgressCurrent, inboxProgressTotal);
      }}
      onIndexChange={(index) => {
        setInboxIndex((previous) => (previous === index ? previous : index));
      }}
      onProgressChange={(current, total) => {
        setInboxProgressCurrent((previous) => (previous === current ? previous : current));
        setInboxProgressTotal((previous) => (previous === total ? previous : total));
        reportProgress(inboxAtEnd, current, total);
      }}
      settings={settings}
      skipItemRef={skipItemRef}
      store={store}
      t={t}
      triageService={triageService}
    />
  );
}
