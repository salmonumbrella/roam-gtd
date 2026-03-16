import React, { useCallback, useEffect, useRef } from "react";
import AutocompleteInput from "roamjs-components/components/AutocompleteInput";

import type { TranslatorFn } from "../i18n";
import type { PersonEntry } from "../people";
import type { TriageInputService } from "../review/session/triage-input-service";
import type { GtdSettings } from "../settings";
import {
  CALENDAR_BUTTON_ID,
  CONTEXT_AUTOCOMPLETE_ID,
  DELEGATE_AUTOCOMPLETE_ID,
  PROJECT_AUTOCOMPLETE_ID,
  focusTriageTabStop,
} from "../triage/form-helpers";
import { type ProjectOption } from "../triage/support";
import { useWorkflowProcessPopoverKeyboard } from "../workflow-process-popover/keyboard";
import { useWorkflowProcessPopoverLoading } from "../workflow-process-popover/loading";
import { useWorkflowProcessPopoverSchedule } from "../workflow-process-popover/schedule";
import { useWorkflowProcessPopoverSubmission } from "../workflow-process-popover/submission";
import { SchedulePopover } from "./SchedulePopover";

interface WorkflowProcessPopoverProps {
  anchorElement?: HTMLElement | null;
  currentTag: string;
  initialPeople?: Array<PersonEntry>;
  initialProjects?: Array<ProjectOption>;
  isOpen: boolean;
  onCancel: () => void;
  onProcessComplete: (uid: string, shouldHide: boolean) => void;
  settings: GtdSettings;
  style?: React.CSSProperties;
  t: TranslatorFn;
  targetText: string;
  targetUid: string | null;
  triageService?: TriageInputService;
}

export function WorkflowProcessPopover({
  anchorElement = null,
  currentTag,
  initialPeople,
  initialProjects,
  isOpen,
  onCancel,
  onProcessComplete,
  settings,
  style,
  t,
  targetText,
  targetUid,
  triageService,
}: WorkflowProcessPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const focusCalendarButton = useCallback(() => {
    document.getElementById(CALENDAR_BUTTON_ID)?.focus();
  }, []);

  const {
    contextOptions,
    contextQuery,
    delegateOptions,
    delegateQuery,
    filterContextOptions,
    filterProjectOptions,
    handleContextInput,
    handleDelegateInput,
    handleProjectInput,
    people,
    projectOptions,
    projectQuery,
    readDomFormValues,
    requestPeopleLoad,
    requestProjectsLoad,
    resetFormState,
  } = useWorkflowProcessPopoverLoading({
    delegateTargetTags: settings.delegateTargetTags,
    initialPeople,
    initialProjects,
    isOpen,
    triageService,
  });

  const {
    dueDateTooltipLabel,
    handleScheduleCancel,
    handleScheduleConfirm,
    handleScheduleUnset,
    hideDueDateTooltipUntilMouseLeave,
    isDueDateButtonFocused,
    isScheduled,
    persistedDueDate,
    scheduleIntent,
    schedulePopoverInitialValue,
    setHideDueDateTooltipUntilMouseLeave,
    setIsDueDateButtonFocused,
    setShowSchedulePopover,
    showSchedulePopover,
    syncPersistedDueDateValue,
    unsetDue,
  } = useWorkflowProcessPopoverSchedule({
    isOpen,
    onFocusCalendarButton: focusCalendarButton,
    t,
    targetText,
    targetUid,
  });

  const { rememberTabStop } = useWorkflowProcessPopoverKeyboard({
    anchorElement,
    isOpen,
    onCancel,
    popoverRef,
    rootRef,
  });

  const { handleProcess, isProcessing } = useWorkflowProcessPopoverSubmission({
    currentTag,
    isOpen,
    onProcessComplete,
    people,
    persistedDueDate,
    readDomFormValues,
    scheduleIntent,
    settings,
    syncPersistedDueDateValue,
    t,
    targetText,
    targetUid,
    unsetDue,
  });

  useEffect(() => {
    if (!isOpen || !targetUid) {
      return;
    }
    resetFormState();
    const focusId = window.requestAnimationFrame(() => {
      focusTriageTabStop("context");
    });
    return () => {
      window.cancelAnimationFrame(focusId);
    };
  }, [isOpen, resetFormState, targetUid]);

  return (
    <div
      aria-hidden={!isOpen}
      className={`roam-gtd-triage-popover${isOpen ? "" : " roam-gtd-triage-popover--hidden"}`}
      id="roam-gtd-workflow-triage-popover"
      ref={popoverRef}
      role="dialog"
      style={style}
    >
      <div aria-hidden className="roam-gtd-triage-popover__caret" />
      <div className="roam-gtd-triage-popover__body" ref={rootRef} tabIndex={-1}>
        <div style={{ marginBottom: 8, position: "relative" }}>
          <div style={{ alignItems: "center", display: "flex", gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <AutocompleteInput
                autoFocus={false}
                filterOptions={filterContextOptions}
                id={CONTEXT_AUTOCOMPLETE_ID}
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
                aria-label={dueDateTooltipLabel ?? t("dueDateTooltip")}
                className={`bp3-button bp3-icon-calendar bp3-minimal${
                  isScheduled ? " roam-gtd-calendar-scheduled" : ""
                }${showSchedulePopover ? " roam-gtd-calendar-open" : ""}`}
                id={CALENDAR_BUTTON_ID}
                onBlur={() => setIsDueDateButtonFocused(false)}
                onClick={() => {
                  if (showSchedulePopover) {
                    handleScheduleCancel();
                    return;
                  }
                  setHideDueDateTooltipUntilMouseLeave(true);
                  setShowSchedulePopover(true);
                }}
                onFocus={() => setIsDueDateButtonFocused(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    rememberTabStop("calendar");
                    setHideDueDateTooltipUntilMouseLeave(true);
                    setShowSchedulePopover(false);
                    event.currentTarget.blur();
                    rootRef.current?.focus();
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    setHideDueDateTooltipUntilMouseLeave(true);
                    setShowSchedulePopover((current) => !current);
                  }
                }}
                type="button"
              />
              {settings.showTooltips &&
              dueDateTooltipLabel &&
              !showSchedulePopover &&
              !hideDueDateTooltipUntilMouseLeave &&
              !isDueDateButtonFocused ? (
                <div className="roam-gtd-tooltip">{dueDateTooltipLabel}</div>
              ) : null}
            </div>
          </div>
          {showSchedulePopover ? (
            <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 20 }}>
              <SchedulePopover
                canUnset={isScheduled}
                caretPosition="top-right"
                dismissAncestorId={CALENDAR_BUTTON_ID}
                initialGoogleCalendarAccount={scheduleIntent?.googleCalendarAccount ?? null}
                initialValue={schedulePopoverInitialValue}
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

        <div onFocusCapture={requestPeopleLoad} style={{ marginBottom: 8 }}>
          <AutocompleteInput
            autoFocus={false}
            id={DELEGATE_AUTOCOMPLETE_ID}
            maxItemsDisplayed={8}
            options={delegateQuery.trim() ? delegateOptions : []}
            placeholder={t("delegatePlaceholder")}
            setValue={handleDelegateInput}
            value={delegateQuery}
          />
        </div>

        <div onFocusCapture={requestProjectsLoad} style={{ position: "relative" }}>
          <AutocompleteInput
            autoFocus={false}
            filterOptions={filterProjectOptions}
            id={PROJECT_AUTOCOMPLETE_ID}
            maxItemsDisplayed={12}
            options={projectQuery.trim() ? projectOptions : []}
            placeholder={t("projectSearchPlaceholder")}
            setValue={handleProjectInput}
            value={projectQuery}
          />
        </div>

        <button
          className="bp3-button bp3-intent-primary bp3-fill"
          disabled={isProcessing}
          onClick={() => {
            void handleProcess();
          }}
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
      </div>
    </div>
  );
}
