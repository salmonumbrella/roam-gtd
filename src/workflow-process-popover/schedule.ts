import { useCallback, useEffect, useState } from "react";

import type { ScheduleIntent } from "../components/SchedulePopover";
import type { TranslatorFn } from "../i18n";
import { formatSchedulePopoverInitialValue } from "../triage/form-helpers";
import {
  getTriageDueDateTooltipLabel,
  loadMatchedCalendarEventTimeLabel,
  resolveScheduleConflictMessage,
} from "../triage/schedule-support";
import { showTriageToast } from "../triage/step-logic";
import { getCurrentDueDateValue } from "../triage/writes";

interface UseWorkflowProcessPopoverScheduleArgs {
  isOpen: boolean;
  onFocusCalendarButton: () => void;
  t: TranslatorFn;
  targetText: string;
  targetUid: string | null;
}

export function useWorkflowProcessPopoverSchedule({
  isOpen,
  onFocusCalendarButton,
  t,
  targetText,
  targetUid,
}: UseWorkflowProcessPopoverScheduleArgs) {
  const [scheduleIntent, setScheduleIntent] = useState<ScheduleIntent | null>(null);
  const [showSchedulePopover, setShowSchedulePopover] = useState(false);
  const [hideDueDateTooltipUntilMouseLeave, setHideDueDateTooltipUntilMouseLeave] = useState(false);
  const [isDueDateButtonFocused, setIsDueDateButtonFocused] = useState(false);
  const [persistedDueDate, setPersistedDueDate] = useState("");
  const [unsetDue, setUnsetDue] = useState(false);
  const [gcalTime, setGcalTime] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resetId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      setScheduleIntent(null);
      setShowSchedulePopover(false);
      setHideDueDateTooltipUntilMouseLeave(false);
      setIsDueDateButtonFocused(false);
      setUnsetDue(false);
      setPersistedDueDate(isOpen && targetUid ? getCurrentDueDateValue(targetUid) : "");
      setGcalTime(null);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(resetId);
    };
  }, [isOpen, targetUid]);

  useEffect(() => {
    if (!isOpen || !persistedDueDate.trim()) {
      return;
    }
    let cancelled = false;
    const resetId = window.setTimeout(() => {
      if (!cancelled) {
        setGcalTime(null);
      }
    }, 0);
    void loadMatchedCalendarEventTimeLabel({
      persistedDueDate,
      targetText,
    })
      .then((timeLabel) => {
        if (!cancelled) {
          setGcalTime(timeLabel);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGcalTime(null);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(resetId);
    };
  }, [isOpen, persistedDueDate, targetText]);

  const syncPersistedDueDateValue = useCallback((_uid: string, value: string): void => {
    setPersistedDueDate(value);
  }, []);

  const handleScheduleConfirm = useCallback(
    async (intent: ScheduleIntent) => {
      const conflictMessage = await resolveScheduleConflictMessage({
        intent,
        scheduleConflictLabel: t("scheduleConflict"),
      });
      if (conflictMessage) {
        showTriageToast(conflictMessage, "danger");
        return false;
      }
      setUnsetDue(false);
      setScheduleIntent(intent);
      setHideDueDateTooltipUntilMouseLeave(true);
      setShowSchedulePopover(false);
      onFocusCalendarButton();
      return true;
    },
    [onFocusCalendarButton, t],
  );

  const handleScheduleUnset = useCallback(() => {
    setScheduleIntent(null);
    setUnsetDue(true);
    setHideDueDateTooltipUntilMouseLeave(true);
    setShowSchedulePopover(false);
    onFocusCalendarButton();
  }, [onFocusCalendarButton]);

  const handleScheduleCancel = useCallback(() => {
    setHideDueDateTooltipUntilMouseLeave(true);
    setShowSchedulePopover(false);
    onFocusCalendarButton();
  }, [onFocusCalendarButton]);

  const dueDateTooltipLabel = getTriageDueDateTooltipLabel({
    gcalTime,
    persistedDueDate,
    scheduleIntent,
    unsetDue,
  });
  const schedulePopoverInitialValue = unsetDue
    ? ""
    : formatSchedulePopoverInitialValue(scheduleIntent ?? undefined, persistedDueDate);
  const isScheduled = !unsetDue && Boolean((scheduleIntent?.roamDate ?? persistedDueDate).trim());

  return {
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
  };
}
