import { useCallback, useMemo, useRef, useState } from "react";

import type { ScheduleIntent } from "../components/SchedulePopover";
import {
  applyScheduleIntentToBlock,
  checkScheduleConflict,
  clearDueDateChild,
  getCurrentDueDateValue,
} from "./schedule";

const REVIEW_ACTION_REFRESH_DELAY_MS = 800;

interface ScheduleStore<TSettings, TRefreshOptions = never> {
  scheduleRefresh: (settings: TSettings, delayMs?: number, options?: TRefreshOptions) => void;
}

export function useScheduleController<TSettings, TRefreshOptions = never>(
  store: ScheduleStore<TSettings, TRefreshOptions>,
  settings: TSettings,
): {
  canUnset: boolean;
  handleScheduleCancel: () => void;
  handleScheduleConfirm: (intent: ScheduleIntent) => Promise<boolean>;
  handleScheduleUnset: () => Promise<void>;
  initialValue: string;
  schedulingUid: string | null;
  setSchedulingUid: (uid: string | null) => void;
} {
  const [schedulingUid, setSchedulingUidState] = useState<string | null>(null);
  const schedulingUidRef = useRef<string | null>(null);
  const setSchedulingUid = useCallback((uid: string | null) => {
    schedulingUidRef.current = uid;
    setSchedulingUidState(uid);
  }, []);
  const initialValue = useMemo(
    () => (schedulingUid ? getCurrentDueDateValue(schedulingUid) : ""),
    [schedulingUid],
  );
  const canUnset = Boolean(initialValue);

  const handleScheduleConfirm = useCallback(
    async (intent: ScheduleIntent) => {
      const uid = schedulingUidRef.current;
      if (!uid) {
        return false;
      }

      const conflict = await checkScheduleConflict(intent);
      if (conflict) {
        return false;
      }

      await applyScheduleIntentToBlock(uid, intent, undefined);
      setSchedulingUid(null);
      store.scheduleRefresh(settings, REVIEW_ACTION_REFRESH_DELAY_MS);
      return true;
    },
    [setSchedulingUid, settings, store],
  );

  const handleScheduleUnset = useCallback(async () => {
    const uid = schedulingUidRef.current;
    if (!uid) {
      return;
    }

    await clearDueDateChild(uid);
    setSchedulingUid(null);
    store.scheduleRefresh(settings, REVIEW_ACTION_REFRESH_DELAY_MS);
  }, [setSchedulingUid, settings, store]);

  const handleScheduleCancel = useCallback(() => {
    setSchedulingUid(null);
  }, [setSchedulingUid]);

  return {
    canUnset,
    handleScheduleCancel,
    handleScheduleConfirm,
    handleScheduleUnset,
    initialValue,
    schedulingUid,
    setSchedulingUid,
  };
}
