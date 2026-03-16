import { useCallback, useMemo, useState, type MutableRefObject } from "react";

import type { ScheduleIntent } from "../components/SchedulePopover";
import type { TranslatorFn } from "../i18n";
import { formatSchedulePopoverInitialValue } from "../triage/form-helpers";
import { CALENDAR_BUTTON_ID } from "../triage/form-helpers";
import {
  getTriageDueDateTooltipLabel,
  resolveScheduleConflictMessage,
} from "../triage/schedule-support";
import { showTriageToast } from "../triage/step-logic";

interface ScheduleStateMaps {
  scheduledByUid: Record<string, ScheduleIntent>;
  unsetDueByUid: Record<string, true>;
}

interface GetCurrentScheduleStateArgs extends ScheduleStateMaps {
  currentItemUid: string | null;
  persistedCurrentDueDate: string;
}

interface ApplyConfirmedScheduleIntentArgs extends ScheduleStateMaps {
  intent: ScheduleIntent;
  uid: string;
}

interface ApplyUnsetScheduleIntentArgs extends ScheduleStateMaps {
  uid: string;
}

interface UseInboxZeroScheduleControllerArgs {
  currentItemUid: string | null;
  currentItemUidRef: MutableRefObject<string | null>;
  getCurrentDueDateValue: (uid: string) => string;
  t: TranslatorFn;
}

export function getCurrentScheduleState(args: GetCurrentScheduleStateArgs): {
  currentDueDateValue: string;
  currentScheduleIntent: ScheduleIntent | null;
  dueUnsetRequestedForCurrent: boolean;
  isCurrentItemScheduled: boolean;
} {
  const { currentItemUid, persistedCurrentDueDate, scheduledByUid, unsetDueByUid } = args;
  const currentScheduleIntent = currentItemUid ? (scheduledByUid[currentItemUid] ?? null) : null;
  const dueUnsetRequestedForCurrent = currentItemUid
    ? Boolean(unsetDueByUid[currentItemUid])
    : false;
  const currentDueDateValue = dueUnsetRequestedForCurrent
    ? ""
    : (currentScheduleIntent?.roamDate ?? persistedCurrentDueDate);

  return {
    currentDueDateValue,
    currentScheduleIntent,
    dueUnsetRequestedForCurrent,
    isCurrentItemScheduled: Boolean(currentDueDateValue.trim()),
  };
}

export function applyConfirmedScheduleIntent(
  args: ApplyConfirmedScheduleIntentArgs,
): ScheduleStateMaps {
  const { intent, scheduledByUid, uid, unsetDueByUid } = args;
  const nextUnsetDueByUid = { ...unsetDueByUid };
  delete nextUnsetDueByUid[uid];

  return {
    scheduledByUid: {
      ...scheduledByUid,
      [uid]: intent,
    },
    unsetDueByUid: nextUnsetDueByUid,
  };
}

export function applyUnsetScheduleIntent(args: ApplyUnsetScheduleIntentArgs): ScheduleStateMaps {
  const { scheduledByUid, uid, unsetDueByUid } = args;
  const nextScheduledByUid = { ...scheduledByUid };
  delete nextScheduledByUid[uid];

  return {
    scheduledByUid: nextScheduledByUid,
    unsetDueByUid: {
      ...unsetDueByUid,
      [uid]: true,
    },
  };
}

export function useInboxZeroScheduleController(args: UseInboxZeroScheduleControllerArgs) {
  const { currentItemUid, currentItemUidRef, getCurrentDueDateValue, t } = args;
  const [scheduledByUid, setScheduledByUid] = useState<Record<string, ScheduleIntent>>({});
  const [unsetDueByUid, setUnsetDueByUid] = useState<Record<string, true>>({});
  const [schedulePopoverUid, setSchedulePopoverUid] = useState<string | null>(null);
  const [tooltipHiddenUid, setTooltipHiddenUid] = useState<string | null>(null);
  const [focusedDueDateButtonUid, setFocusedDueDateButtonUid] = useState<string | null>(null);
  const [persistedDueDatesByUid, setPersistedDueDatesByUid] = useState<Record<string, string>>({});
  const showSchedulePopover = currentItemUid !== null && schedulePopoverUid === currentItemUid;
  const hideDueDateTooltipUntilMouseLeave =
    currentItemUid !== null && tooltipHiddenUid === currentItemUid;
  const isDueDateButtonFocused =
    currentItemUid !== null && focusedDueDateButtonUid === currentItemUid;
  const persistedCurrentDueDate = currentItemUid
    ? (persistedDueDatesByUid[currentItemUid] ?? getCurrentDueDateValue(currentItemUid))
    : "";

  const currentScheduleState = useMemo(
    () =>
      getCurrentScheduleState({
        currentItemUid,
        persistedCurrentDueDate,
        scheduledByUid,
        unsetDueByUid,
      }),
    [currentItemUid, persistedCurrentDueDate, scheduledByUid, unsetDueByUid],
  );
  const {
    currentDueDateValue,
    currentScheduleIntent,
    dueUnsetRequestedForCurrent,
    isCurrentItemScheduled,
  } = currentScheduleState;

  const currentDueDateTooltipLabel = useMemo(
    () =>
      getTriageDueDateTooltipLabel({
        gcalTime: null,
        persistedDueDate: persistedCurrentDueDate,
        scheduleIntent: currentScheduleIntent,
        unsetDue: dueUnsetRequestedForCurrent,
      }),
    [currentScheduleIntent, dueUnsetRequestedForCurrent, persistedCurrentDueDate],
  );
  const currentSchedulePopoverInitialValue = dueUnsetRequestedForCurrent
    ? ""
    : formatSchedulePopoverInitialValue(
        currentScheduleIntent ?? undefined,
        persistedCurrentDueDate,
      );

  const setHideDueDateTooltipUntilMouseLeave = useCallback(
    (value: boolean): void => {
      const uid = currentItemUidRef.current;
      setTooltipHiddenUid(value && uid ? uid : null);
    },
    [currentItemUidRef],
  );

  const setIsDueDateButtonFocused = useCallback(
    (value: boolean): void => {
      const uid = currentItemUidRef.current;
      setFocusedDueDateButtonUid(value && uid ? uid : null);
    },
    [currentItemUidRef],
  );

  const setShowSchedulePopover = useCallback(
    (value: boolean): void => {
      const uid = currentItemUidRef.current;
      setSchedulePopoverUid(value && uid ? uid : null);
    },
    [currentItemUidRef],
  );

  const syncPersistedDueDateValue = useCallback((uid: string, value: string): void => {
    setPersistedDueDatesByUid((previous) =>
      previous[uid] === value ? previous : { ...previous, [uid]: value },
    );
  }, []);

  const getScheduleStateForUid = useCallback(
    (uid: string) => {
      const intent = scheduledByUid[uid] ?? null;
      return {
        intent,
        scheduledDateValue: intent?.roamDate ?? "",
        shouldUnsetDue: Boolean(unsetDueByUid[uid]),
      };
    },
    [scheduledByUid, unsetDueByUid],
  );

  const openSchedulePopover = useCallback(() => {
    const uid = currentItemUidRef.current;
    if (!uid) {
      return;
    }
    setHideDueDateTooltipUntilMouseLeave(true);
    syncPersistedDueDateValue(uid, getCurrentDueDateValue(uid));
    setSchedulePopoverUid(uid);
  }, [
    currentItemUidRef,
    getCurrentDueDateValue,
    setHideDueDateTooltipUntilMouseLeave,
    syncPersistedDueDateValue,
  ]);

  const handleScheduleConfirm = useCallback(
    async (intent: ScheduleIntent) => {
      const uid = currentItemUidRef.current;
      if (!uid) {
        return;
      }

      const conflictMessage = await resolveScheduleConflictMessage({
        intent,
        scheduleConflictLabel: t("scheduleConflict"),
      });
      if (conflictMessage) {
        showTriageToast(conflictMessage, "danger");
        return;
      }

      setScheduledByUid(
        (previous) =>
          applyConfirmedScheduleIntent({
            intent,
            scheduledByUid: previous,
            uid,
            unsetDueByUid,
          }).scheduledByUid,
      );
      setUnsetDueByUid(
        (previous) =>
          applyConfirmedScheduleIntent({
            intent,
            scheduledByUid,
            uid,
            unsetDueByUid: previous,
          }).unsetDueByUid,
      );
      setHideDueDateTooltipUntilMouseLeave(true);
      setSchedulePopoverUid(null);
      document.getElementById(CALENDAR_BUTTON_ID)?.focus();
    },
    [currentItemUidRef, scheduledByUid, setHideDueDateTooltipUntilMouseLeave, t, unsetDueByUid],
  );

  const handleScheduleUnset = useCallback(() => {
    const uid = currentItemUidRef.current;
    if (!uid) {
      return;
    }
    setScheduledByUid(
      (previous) =>
        applyUnsetScheduleIntent({
          scheduledByUid: previous,
          uid,
          unsetDueByUid,
        }).scheduledByUid,
    );
    setUnsetDueByUid(
      (previous) =>
        applyUnsetScheduleIntent({
          scheduledByUid,
          uid,
          unsetDueByUid: previous,
        }).unsetDueByUid,
    );
    setHideDueDateTooltipUntilMouseLeave(true);
    setSchedulePopoverUid(null);
    document.getElementById(CALENDAR_BUTTON_ID)?.focus();
  }, [currentItemUidRef, scheduledByUid, setHideDueDateTooltipUntilMouseLeave, unsetDueByUid]);

  const handleScheduleCancel = useCallback(() => {
    setHideDueDateTooltipUntilMouseLeave(true);
    setSchedulePopoverUid(null);
    document.getElementById(CALENDAR_BUTTON_ID)?.focus();
  }, [setHideDueDateTooltipUntilMouseLeave]);

  return {
    currentDueDateTooltipLabel,
    currentDueDateValue,
    currentScheduleIntent,
    currentSchedulePopoverInitialValue,
    dueUnsetRequestedForCurrent,
    getScheduleStateForUid,
    handleScheduleCancel,
    handleScheduleConfirm,
    handleScheduleUnset,
    hideDueDateTooltipUntilMouseLeave,
    isCurrentItemScheduled,
    isDueDateButtonFocused,
    openSchedulePopover,
    scheduledByUid,
    setHideDueDateTooltipUntilMouseLeave,
    setIsDueDateButtonFocused,
    setShowSchedulePopover,
    showSchedulePopover,
    syncPersistedDueDateValue,
    unsetDueByUid,
  };
}
