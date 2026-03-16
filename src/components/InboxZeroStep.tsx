import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import AutocompleteInput from "roamjs-components/components/AutocompleteInput";

import type { TranslatorFn } from "../i18n";
import { useInboxZeroActionDispatcher } from "../inbox-zero/actions";
import { useInboxZeroContextDelegateController } from "../inbox-zero/context-delegate-controller";
import { useInboxZeroHotkeys } from "../inbox-zero/hotkeys";
import { useInboxZeroScheduleController } from "../inbox-zero/schedule-controller";
import {
  blockExists,
  sleep,
  useInboxZeroStepRuntime,
  waitForAnimationFrame,
} from "../inbox-zero/use-step-runtime";
import { pageHasTag } from "../people";
import type { TriageInputService } from "../review/session/triage-input-service";
import { setBlockViewType } from "../roam-ui-utils";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import {
  CALENDAR_BUTTON_ID,
  CONTEXT_AUTOCOMPLETE_ID,
  DELEGATE_AUTOCOMPLETE_ID,
  PROJECT_AUTOCOMPLETE_ID,
  formatDueDateTooltipLabel,
  formatSchedulePopoverInitialValue,
  isAutocompleteFieldElement,
  type TriageTabStop,
} from "../triage/form-helpers";
import {
  showTriageToast,
  stripTagToken,
  validateWebhookUrl,
  type TriageCounterAction,
} from "../triage/step-logic";
import { getCurrentDueDateValue } from "../triage/writes";
import type { TodoItem } from "../types";
import { InboxZeroEmptyState } from "./inbox-zero/InboxZeroEmptyState";
import { InboxZeroHeader } from "./inbox-zero/InboxZeroHeader";
import { SchedulePopover } from "./SchedulePopover";
import {
  isWeeklyReviewBlockEditorElement as isBlockEditorElement,
  WeeklyReviewRoamBlock,
  type WeeklyReviewRoamBlockHandle,
} from "./WeeklyReviewRoamBlock";

export { shouldSuppressChildControlNavigation } from "./WeeklyReviewRoamBlock";
export { formatDueDateTooltipLabel, formatSchedulePopoverInitialValue };
export { filterNamespacedPageOptions, formatNamespacedPageDisplayTitle } from "../triage/support";
export { getNextStepOneTabStop, getStepOneTabOrder } from "../inbox-zero/hotkeys";
export {
  inferTriageCounterActionFromBlock,
  resetTriageToaster,
  resolveCounterActionFromSnapshot,
  resolveCounterActionFromSync,
  resolveProcessedSnapshot,
  showTriageToast,
  submitProjectSelection,
  validateWebhookUrl,
  wireAgendaForTaggedPeople,
} from "../triage/step-logic";

export interface InboxZeroStepProps {
  goBackRef?: React.MutableRefObject<(() => void) | null>;
  isLoading: boolean;
  items: Array<TodoItem>;
  onAdvance: () => void;
  onAtEndChange?: (atEnd: boolean) => void;
  onIndexChange?: (index: number) => void;
  onProgressChange?: (current: number, total: number) => void;
  settings: GtdSettings;
  skipItemRef?: React.MutableRefObject<(() => void) | null>;
  store: ReturnType<typeof createGtdStore>;
  t: TranslatorFn;
  triageService?: TriageInputService;
}

const MAX_IDLE_SCHEDULE_RETRIES = 20;

function scheduleWhenInputsOutsideAllowedAreIdle(
  callback: () => void,
  delayMs: number,
  allowedFieldIds: string | Array<string>,
  retryDelayMs: number = delayMs,
): () => void {
  let cancelled = false;
  let timeoutId: number | null = null;
  let retries = 0;
  const allowedFieldIdSet = new Set(
    (Array.isArray(allowedFieldIds) ? allowedFieldIds : [allowedFieldIds]).filter(Boolean),
  );

  const schedule = (nextDelayMs: number): void => {
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      if (cancelled) {
        return;
      }
      const activeElement = document.activeElement;
      if (isBlockEditorElement(activeElement)) {
        retries += 1;
        if (retries < MAX_IDLE_SCHEDULE_RETRIES) {
          schedule(retryDelayMs);
        }
        return;
      }
      const activeAutocompleteField = isAutocompleteFieldElement(activeElement)
        ? activeElement
        : null;
      if (activeAutocompleteField && !allowedFieldIdSet.has(activeAutocompleteField.id)) {
        retries += 1;
        if (retries < MAX_IDLE_SCHEDULE_RETRIES) {
          schedule(retryDelayMs);
        }
        return;
      }
      callback();
    }, nextDelayMs);
  };

  schedule(delayMs);
  return () => {
    cancelled = true;
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}

const AGENT_TAG_TITLE = "agents";
const SIDE_VIEW_TYPE = "side";
const TRIAGE_COUNTER_ACTION_COLORS: Record<TriageCounterAction, string> = {
  delegate: "#fab387",
  done: "#a6e3a1",
  project: "#94e2d5",
  reference: "#cba6f7",
  someday: "#89b4fa",
  up: "#a6e3a1",
  watch: "#f9e2af",
};

export function InboxZeroStep({
  goBackRef,
  isLoading,
  items,
  onAdvance,
  onAtEndChange,
  onIndexChange,
  onProgressChange,
  settings,
  skipItemRef,
  store,
  t,
  triageService,
}: InboxZeroStepProps) {
  const delegateInputRef = useRef<HTMLInputElement>(null);
  const triageRootRef = useRef<HTMLDivElement>(null);
  const lastTabStopRef = useRef<TriageTabStop | null>(null);
  const embedBlockRef = useRef<WeeklyReviewRoamBlockHandle>(null);
  const embedContainerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const cacheFormStateRef = useRef<(uid: string) => void>(() => undefined);
  const restoreFormStateRef = useRef<(uid?: string) => void>(() => undefined);
  const setPendingDelegateUidRef = useRef<(uid: string | null) => void>(() => undefined);
  const setShowDelegatePromptRef = useRef<(value: boolean) => void>(() => undefined);

  const {
    advanceWithExpectedRemoval,
    currentCounterAction,
    currentItem,
    currentItemRef,
    currentItemText,
    currentItemUid,
    currentItemUidRef,
    displayPosition,
    enqueueWrite,
    focusBlockEditor,
    handleMissingCurrentItem,
    mountedRef,
    pullLatestBlockString,
    rememberCounterAction,
    scheduleInboxRefreshForUid,
    sessionTotal,
    setCounterAction,
    suppressCounterSyncRef,
    syncCounterActionForUidRef,
  } = useInboxZeroStepRuntime({
    cacheFormStateRef,
    embedBlockRef,
    embedContainerRef,
    goBackRef,
    items,
    leftPanelRef,
    onAdvance,
    onAtEndChange,
    onIndexChange,
    onProgressChange,
    restoreFormStateRef,
    setPendingDelegateUidRef,
    setShowDelegatePromptRef,
    settings,
    skipItemRef,
    store,
    triageRootRef,
  });
  const currentIndexColor = currentCounterAction
    ? TRIAGE_COUNTER_ACTION_COLORS[currentCounterAction]
    : "#89b4fa";
  const inputsLocked = isLoading;

  const {
    cacheFormState,
    contextOptions,
    contextQuery,
    delegateOptions,
    delegateQuery,
    filterContextOptions,
    filteredPeople,
    filterProjectOptions,
    formStateRef,
    handleContextInput,
    handleDelegateInput,
    handleProjectInput,
    intendedDelegateRef,
    isPeopleLoading,
    pendingDelegateUid,
    peopleRef,
    projectOptions,
    projectQuery,
    requestPeopleLoad,
    restoreFormState,
    scheduleContextSupportWarmup,
    schedulePeopleLoadSoon,
    scheduleProjectsLoadSoon,
    setDelegateQuery,
    setPendingDelegateUid,
    setShowDelegatePrompt,
    showDelegatePrompt,
    showDelegatePromptRef,
    syncFormStateFromDom,
    upsertLoadedPerson,
  } = useInboxZeroContextDelegateController({
    currentItemText,
    currentItemUid,
    delegateInputRef,
    mountedRef,
    rememberCounterAction,
    scheduleWhenInputsOutsideAllowedAreIdle,
    settings,
    store,
    syncCounterActionForUidRef,
    triageService,
  });

  useEffect(() => {
    if (!currentItemUid || !triageService) {
      return;
    }

    const warmupFrameId = window.requestAnimationFrame(() => {
      void triageService.ensureWarm("context").catch(() => undefined);
      void triageService.ensureWarm("people").catch(() => undefined);
      void triageService.ensureWarm("project").catch(() => undefined);
    });

    return () => {
      window.cancelAnimationFrame(warmupFrameId);
    };
  }, [currentItemUid, triageService]);

  useLayoutEffect(() => {
    cacheFormStateRef.current = cacheFormState;
    restoreFormStateRef.current = restoreFormState;
    setPendingDelegateUidRef.current = setPendingDelegateUid;
    setShowDelegatePromptRef.current = setShowDelegatePrompt;
  }, [cacheFormState, restoreFormState, setPendingDelegateUid, setShowDelegatePrompt]);

  const {
    currentDueDateTooltipLabel,
    currentScheduleIntent,
    currentSchedulePopoverInitialValue,
    getScheduleStateForUid,
    handleScheduleCancel,
    handleScheduleConfirm,
    handleScheduleUnset,
    hideDueDateTooltipUntilMouseLeave,
    isCurrentItemScheduled,
    isDueDateButtonFocused,
    openSchedulePopover,
    setHideDueDateTooltipUntilMouseLeave,
    setIsDueDateButtonFocused,
    setShowSchedulePopover,
    showSchedulePopover,
    syncPersistedDueDateValue,
  } = useInboxZeroScheduleController({
    currentItemUid,
    currentItemUidRef,
    getCurrentDueDateValue,
    t,
  });

  const removeTriageTagIfPresent = useCallback(
    async (uid: string, sourceText: string): Promise<string> => {
      const triageTag = settings.inboxPage.trim();
      if (!triageTag) {
        return sourceText;
      }
      const cleaned = stripTagToken(sourceText, triageTag);
      if (cleaned === sourceText) {
        return sourceText;
      }
      await window.roamAlphaAPI.updateBlock({
        block: { string: cleaned, uid },
      });
      return cleaned;
    },
    [settings.inboxPage],
  );

  const setBlockToSideView = useCallback(async (uid: string): Promise<void> => {
    await setBlockViewType(uid, SIDE_VIEW_TYPE);
  }, []);

  const notifyDelegatedAgent = useCallback(
    async ({
      agentTitle,
      agentUid,
      taskUid,
    }: {
      agentTitle: string;
      agentUid: string;
      taskUid: string;
    }): Promise<void> => {
      const webhookUrl = settings.agentDelegationWebhookUrl.trim();
      if (!webhookUrl) {
        return;
      }
      const urlError = validateWebhookUrl(webhookUrl);
      if (urlError) {
        showTriageToast(urlError, "warning");
        return;
      }
      try {
        const isAgent = pageHasTag(agentUid, AGENT_TAG_TITLE);
        if (!isAgent) {
          return;
        }
        const response = await fetch(webhookUrl, {
          body: JSON.stringify({
            agentTitle,
            agentUid,
            blockUid: taskUid,
            event: "delegated_to_agent",
            source: "roam-gtd",
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (response.status === 200) {
          showTriageToast(`Delegation sent to ${agentTitle}.`, "success");
          return;
        }
        showTriageToast(`Agent webhook failed (${response.status}).`, "danger");
      } catch {
        showTriageToast("Agent webhook failed (network error).", "danger");
      }
    },
    [settings.agentDelegationWebhookUrl],
  );

  const { handleDelegateConfirm, handleDelegateSkip, handleShortcutAction, handleSubmitCurrent } =
    useInboxZeroActionDispatcher({
      advanceWithExpectedRemoval,
      currentItemRef,
      currentItemUidRef,
      enqueueWrite,
      focusBlockEditor,
      formStateRef,
      getScheduleStateForUid,
      handleMissingCurrentItem,
      isBlockPresent: blockExists,
      mountedRef,
      notifyDelegatedAgent,
      pendingDelegateUid,
      peopleRef,
      pullLatestBlockString,
      rememberCounterAction,
      removeTriageTagIfPresent,
      requestPeopleLoad,
      scheduleInboxRefreshForUid,
      schedulePeopleLoadSoon,
      setBlockToSideView,
      setCounterAction,
      setPendingDelegateUid,
      setShowDelegatePrompt,
      settings,
      showDelegatePromptRef,
      sleep,
      store,
      syncFormStateFromDom,
      syncPersistedDueDateValue,
      t,
      upsertLoadedPerson,
      waitForAnimationFrame,
    });

  useInboxZeroHotkeys({
    currentItemUidRef,
    embedContainerRef,
    handleShortcutAction,
    lastTabStopRef,
    showDelegatePrompt,
    suppressCounterSyncRef,
    triageRootRef,
  });

  // Empty state
  const showSkeleton = !currentItem;
  if (!currentItem && !isLoading) {
    return (
      <InboxZeroEmptyState
        description={t("step1Desc")}
        title={t("allClearTitle", t("step1Title"))}
      />
    );
  }

  return (
    <div className="roam-gtd-triage-root" ref={triageRootRef} tabIndex={-1}>
      <InboxZeroHeader
        currentIndexColor={currentIndexColor}
        currentPosition={Math.min(displayPosition + 1, sessionTotal)}
        showTwoMinuteRule={Boolean(currentItem)}
        total={sessionTotal}
        twoMinuteRuleLabel={t("twoMinuteRule")}
      />

      {/* Two-column content */}
      <div className="roam-gtd-triage-columns">
        {/* Left panel: Roam block embed */}
        <div className="roam-gtd-triage-left" ref={leftPanelRef}>
          {showSkeleton ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 0" }}>
              {["70%", "55%"].map((width) => (
                <div key={width} style={{ alignItems: "center", display: "flex", gap: 8 }}>
                  <div
                    className="gtd-skeleton"
                    style={{ borderRadius: 3, flexShrink: 0, height: 18, width: 18 }}
                  />
                  <div className="gtd-skeleton" style={{ borderRadius: 4, height: 18, width }} />
                </div>
              ))}
            </div>
          ) : (
            <WeeklyReviewRoamBlock
              containerRef={embedContainerRef}
              loadingPlaceholderMode="initial-only"
              preservePreviousContentOnUidChange
              ref={embedBlockRef}
              style={{ paddingBottom: 4, paddingTop: 4 }}
              uid={currentItem.uid}
            />
          )}
        </div>

        {/* Right panel: metadata + actions */}
        <div className="roam-gtd-triage-right" style={{ position: "relative" }}>
          {showSkeleton ? (
            <div
              style={{
                bottom: 0,
                cursor: "not-allowed",
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
                zIndex: 10,
              }}
            />
          ) : null}
          {/* Context dropdown + calendar button */}
          <div
            onFocusCapture={() => {
              scheduleContextSupportWarmup();
              schedulePeopleLoadSoon([CONTEXT_AUTOCOMPLETE_ID, DELEGATE_AUTOCOMPLETE_ID], 100, 900);
              scheduleProjectsLoadSoon(
                [CONTEXT_AUTOCOMPLETE_ID, PROJECT_AUTOCOMPLETE_ID],
                120,
                1450,
              );
            }}
            style={{ marginBottom: 8, position: "relative" }}
          >
            <div style={{ alignItems: "center", display: "flex", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AutocompleteInput
                  autoFocus={false}
                  filterOptions={filterContextOptions}
                  id={CONTEXT_AUTOCOMPLETE_ID}
                  key={`context-${currentItemUid ?? "empty"}`}
                  maxItemsDisplayed={8}
                  options={contextQuery.trim() ? contextOptions : []}
                  placeholder={t("contextPlaceholder")}
                  setValue={handleContextInput}
                  value={contextQuery}
                />
              </div>
              <div
                className="roam-gtd-tooltip-wrapper"
                onMouseLeave={() => setHideDueDateTooltipUntilMouseLeave(false)}
              >
                <button
                  aria-label={currentDueDateTooltipLabel ?? t("dueDateTooltip")}
                  className={`bp3-button bp3-icon-calendar bp3-minimal${
                    isCurrentItemScheduled ? " roam-gtd-calendar-scheduled" : ""
                  }${showSchedulePopover ? " roam-gtd-calendar-open" : ""}`}
                  disabled={!currentItem}
                  id={CALENDAR_BUTTON_ID}
                  onBlur={() => setIsDueDateButtonFocused(false)}
                  onClick={() => {
                    if (!currentItem) {
                      return;
                    }
                    if (showSchedulePopover) {
                      handleScheduleCancel();
                      return;
                    }
                    openSchedulePopover();
                  }}
                  onFocus={() => setIsDueDateButtonFocused(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      lastTabStopRef.current = "calendar";
                      suppressCounterSyncRef.current = true;
                      setHideDueDateTooltipUntilMouseLeave(true);
                      setShowSchedulePopover(false);
                      event.currentTarget.blur();
                      const triageRoot = triageRootRef.current;
                      if (triageRoot) {
                        window.requestAnimationFrame(() => {
                          triageRoot.focus();
                          suppressCounterSyncRef.current = false;
                        });
                      } else {
                        suppressCounterSyncRef.current = false;
                      }
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.stopPropagation();
                      if (showSchedulePopover) {
                        handleScheduleCancel();
                        return;
                      }
                      openSchedulePopover();
                    }
                  }}
                  type="button"
                />
                {settings.showTooltips &&
                currentDueDateTooltipLabel &&
                !showSchedulePopover &&
                !hideDueDateTooltipUntilMouseLeave &&
                !isDueDateButtonFocused ? (
                  <div className="roam-gtd-tooltip">{currentDueDateTooltipLabel}</div>
                ) : null}
              </div>
            </div>
            {showSchedulePopover ? (
              <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 20 }}>
                <SchedulePopover
                  canUnset={isCurrentItemScheduled}
                  caretPosition="top-right"
                  dismissAncestorId={CALENDAR_BUTTON_ID}
                  initialGoogleCalendarAccount={
                    currentScheduleIntent?.googleCalendarAccount ?? null
                  }
                  initialValue={currentItemUid ? currentSchedulePopoverInitialValue : ""}
                  onCancel={handleScheduleCancel}
                  onConfirm={(intent) => {
                    void handleScheduleConfirm(intent);
                  }}
                  onUnset={handleScheduleUnset}
                  t={t}
                />
              </div>
            ) : null}
          </div>

          {/* Delegate person dropdown */}
          <div
            onFocusCapture={() => {
              schedulePeopleLoadSoon();
            }}
            style={{ marginBottom: 8 }}
          >
            <AutocompleteInput
              autoFocus={false}
              id={DELEGATE_AUTOCOMPLETE_ID}
              key={`delegate-${currentItemUid ?? "empty"}`}
              maxItemsDisplayed={8}
              options={delegateQuery.trim() ? delegateOptions : []}
              placeholder={t("delegatePlaceholder")}
              setValue={handleDelegateInput}
              value={delegateQuery}
            />
          </div>

          {/* Project search dropdown */}
          <div
            onFocusCapture={() => {
              scheduleProjectsLoadSoon();
            }}
            style={{ position: "relative" }}
          >
            <AutocompleteInput
              autoFocus={false}
              filterOptions={filterProjectOptions}
              id={PROJECT_AUTOCOMPLETE_ID}
              key={`project-${currentItemUid ?? "empty"}`}
              maxItemsDisplayed={12}
              options={projectQuery.trim() ? projectOptions : []}
              placeholder={t("projectSearchPlaceholder")}
              setValue={handleProjectInput}
              value={projectQuery}
            />
          </div>

          {settings.hideProcessButton ? null : (
            <button
              className="bp3-button bp3-intent-primary bp3-fill"
              disabled={inputsLocked || !currentItem}
              onClick={() => void handleSubmitCurrent()}
              style={{ backgroundImage: "none" }}
              type="button"
            >
              {t("submit")}
              <span
                className="bp3-icon bp3-icon-key-enter"
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: 3,
                  fontSize: 13,
                  marginLeft: 6,
                  padding: "1px 3px",
                }}
              />
            </button>
          )}
        </div>
      </div>

      {/* Delegation prompt overlay */}
      {showDelegatePrompt ? (
        <div
          className="bp3-card bp3-elevation-3"
          style={{
            bottom: 60,
            left: 24,
            padding: 12,
            position: "absolute",
            right: 24,
            zIndex: 30,
          }}
        >
          <p style={{ marginBottom: 8 }}>{t("delegatePrompt")}</p>
          <input
            className="bp3-input bp3-fill"
            onChange={(e) => {
              intendedDelegateRef.current = e.target.value;
              setDelegateQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (delegateQuery.trim().length > 0) {
                  void handleDelegateConfirm(delegateQuery.trim());
                } else {
                  handleDelegateSkip();
                }
              }
              if (e.key === "Escape") {
                handleDelegateSkip();
              }
            }}
            placeholder={t("delegateSkipHint")}
            ref={delegateInputRef}
            type="text"
            value={delegateQuery}
          />
          {delegateQuery.length > 0 && filteredPeople.length > 0 ? (
            <div style={{ maxHeight: 150, overflowY: "auto" }}>
              {filteredPeople.map((person) => (
                <div
                  className="bp3-menu-item"
                  key={person.uid}
                  onClick={() => void handleDelegateConfirm(person.title)}
                  role="button"
                  style={{ cursor: "pointer", padding: "4px 8px" }}
                  tabIndex={0}
                >
                  {person.title}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
