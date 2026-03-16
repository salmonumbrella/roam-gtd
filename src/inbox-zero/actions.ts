import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { ScheduleIntent } from "../components/SchedulePopover";
import {
  createEvent,
  formatCalendarEventSummary,
  isGoogleCalendarAvailable,
} from "../google-calendar";
import type { TranslatorFn } from "../i18n";
import { getOrCreatePersonPage, syncDelegatedAgendaEntry, type PersonEntry } from "../people";
import { markDone, removeTodoMarker, replaceTag } from "../review/actions";
import type { InboxShortcutAction as ReviewShortcutAction } from "../review/shortcuts";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import {
  createProjectFromTemplateAndTeleportTodo,
  reactivateProjectStatusIfInactive,
  teleportBlockToProject,
} from "../teleport";
import { CONTEXT_AUTOCOMPLETE_ID, focusTriageTabStop } from "../triage/form-helpers";
import { resolveSubmitIntent, runTriageProcess } from "../triage/process-engine";
import {
  inferTriageCounterActionFromBlock,
  shouldReactivateProjectOnMove,
  stripTagToken,
  showTriageToast,
  type TriageCounterAction,
  wireAgendaForTaggedPeople,
} from "../triage/step-logic";
import { invalidateTriageProjectsCache } from "../triage/support";
import {
  clearDueDateChild,
  type OrderedChild,
  upsertContextChild,
  upsertDueDateChild,
} from "../triage/writes";
import type { TodoItem } from "../types";
import type { InboxZeroFormState } from "./context-delegate-controller";

export type InboxShortcutAction = "delegate" | "done" | "reference" | "someday" | "up" | "watch";

type ShortcutTagSettingKey = "tagDelegated" | "tagNextAction" | "tagSomeday" | "tagWaitingFor";

interface ShortcutMutationPlan {
  counterAction: TriageCounterAction;
  shortcutTag: string | null;
  shouldApplyContext: boolean;
  shouldApplySchedule: boolean;
}

interface UseInboxZeroActionDispatcherArgs {
  advanceWithExpectedRemoval: (targetUid?: string, fallbackText?: string) => void;
  currentItemRef: MutableRefObject<TodoItem | null>;
  currentItemUidRef: MutableRefObject<string | null>;
  enqueueWrite: (task: () => Promise<void>) => void;
  focusBlockEditor: () => boolean;
  formStateRef: MutableRefObject<InboxZeroFormState>;
  getScheduleStateForUid: (uid: string) => {
    intent: ScheduleIntent | null;
    scheduledDateValue: string;
    shouldUnsetDue: boolean;
  };
  handleMissingCurrentItem: (missingUid?: string) => void;
  isBlockPresent: (uid: string) => boolean;
  mountedRef: MutableRefObject<boolean>;
  notifyDelegatedAgent: (args: {
    agentTitle: string;
    agentUid: string;
    taskUid: string;
  }) => Promise<void>;
  pendingDelegateUid: string | null;
  peopleRef: MutableRefObject<Array<PersonEntry>>;
  pullLatestBlockString: (uid: string, fallback?: string) => Promise<string>;
  rememberCounterAction: (uid: string, action: TriageCounterAction) => void;
  removeTriageTagIfPresent: (uid: string, sourceText: string) => Promise<string>;
  requestPeopleLoad: () => void;
  scheduleInboxRefreshForUid: (uid: string | null | undefined) => void;
  schedulePeopleLoadSoon: (
    allowedFieldIds?: string | Array<string>,
    retryDelayMs?: number,
    initialDelayMs?: number,
  ) => void;
  setBlockToSideView: (uid: string) => Promise<void>;
  setCounterAction: (uid: string, action: TriageCounterAction | null) => void;
  setPendingDelegateUid: Dispatch<SetStateAction<string | null>>;
  setShowDelegatePrompt: Dispatch<SetStateAction<boolean>>;
  settings: GtdSettings;
  showDelegatePromptRef: MutableRefObject<boolean>;
  sleep: (ms: number) => Promise<void>;
  store: ReturnType<typeof createGtdStore>;
  syncFormStateFromDom: () => void;
  syncPersistedDueDateValue: (uid: string, value: string) => void;
  t: TranslatorFn;
  upsertLoadedPerson: (person: PersonEntry) => void;
  waitForAnimationFrame: () => Promise<void>;
}

const BLUR_SETTLE_DELAY_MS = 90;
const REFRESH_DELAY_MS = 300;

function getHtmlInputValue(id: string): string | null {
  const element = document.getElementById(id);
  return element != null && element.nodeType === Node.ELEMENT_NODE && element.tagName === "INPUT"
    ? (element as HTMLInputElement).value
    : null;
}

export { resolveSubmitIntent } from "../triage/process-engine";

const SHORTCUT_TAG_BY_ACTION: Record<
  Exclude<InboxShortcutAction, "done" | "reference">,
  ShortcutTagSettingKey
> = {
  delegate: "tagDelegated",
  someday: "tagSomeday",
  up: "tagNextAction",
  watch: "tagWaitingFor",
};

export function getShortcutMutationPlan(
  action: InboxShortcutAction,
  settings: GtdSettings,
): ShortcutMutationPlan {
  switch (action) {
    case "reference":
      return {
        counterAction: "reference",
        shortcutTag: null,
        shouldApplyContext: false,
        shouldApplySchedule: false,
      };
    case "done":
      return {
        counterAction: "done",
        shortcutTag: null,
        shouldApplyContext: true,
        shouldApplySchedule: false,
      };
    case "watch":
      return {
        counterAction: "watch",
        shortcutTag: settings[SHORTCUT_TAG_BY_ACTION.watch],
        shouldApplyContext: true,
        shouldApplySchedule: true,
      };
    case "delegate":
    case "someday":
    case "up":
      return {
        counterAction: action,
        shortcutTag: settings[SHORTCUT_TAG_BY_ACTION[action]],
        shouldApplyContext: true,
        shouldApplySchedule: false,
      };
  }
}

export function useInboxZeroActionDispatcher(args: UseInboxZeroActionDispatcherArgs) {
  const {
    advanceWithExpectedRemoval,
    currentItemRef,
    currentItemUidRef,
    enqueueWrite,
    focusBlockEditor,
    formStateRef,
    getScheduleStateForUid,
    handleMissingCurrentItem,
    isBlockPresent,
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
  } = args;
  const handleSubmitCurrentRef = useRef<(() => void) | null>(null);

  const handleDelegateConfirm = useCallback(
    async (personTitle: string) => {
      if (!pendingDelegateUid) {
        return;
      }
      const trimmed = personTitle.trim();
      if (!trimmed) {
        return;
      }
      const personPage = await getOrCreatePersonPage(trimmed, settings.delegateTargetTags);
      upsertLoadedPerson(personPage);
      requestPeopleLoad();
      const latestText = await pullLatestBlockString(pendingDelegateUid, "");
      const withoutPersonTag = stripTagToken(latestText, trimmed);
      await replaceTag(
        pendingDelegateUid,
        settings.inboxPage,
        settings.tagDelegated,
        withoutPersonTag,
      );
      const scheduleState = getScheduleStateForUid(pendingDelegateUid);
      let nextChildren: Array<OrderedChild> | undefined;
      if (scheduleState.shouldUnsetDue) {
        nextChildren = await clearDueDateChild(
          pendingDelegateUid,
          syncPersistedDueDateValue,
          nextChildren,
        );
      } else if (scheduleState.scheduledDateValue.trim()) {
        nextChildren = await upsertDueDateChild(
          pendingDelegateUid,
          scheduleState.scheduledDateValue,
          syncPersistedDueDateValue,
          nextChildren,
        );
        if (scheduleState.intent?.time && isGoogleCalendarAvailable()) {
          try {
            const summary = formatCalendarEventSummary(withoutPersonTag);
            await createEvent(
              summary,
              pendingDelegateUid,
              scheduleState.intent.date,
              10,
              scheduleState.intent.googleCalendarAccount,
            );
          } catch {
            showTriageToast(t("scheduleGcalUnavailable"), "warning");
          }
        }
      }
      await upsertContextChild(
        pendingDelegateUid,
        formStateRef.current.contextQuery,
        syncPersistedDueDateValue,
        nextChildren,
      );
      await setBlockToSideView(pendingDelegateUid);
      await syncDelegatedAgendaEntry(pendingDelegateUid, trimmed);
      void notifyDelegatedAgent({
        agentTitle: trimmed,
        agentUid: personPage.uid,
        taskUid: pendingDelegateUid,
      });
      rememberCounterAction(pendingDelegateUid, "delegate");
      scheduleInboxRefreshForUid(pendingDelegateUid);
      advanceWithExpectedRemoval();
    },
    [
      advanceWithExpectedRemoval,
      formStateRef,
      getScheduleStateForUid,
      notifyDelegatedAgent,
      pendingDelegateUid,
      pullLatestBlockString,
      rememberCounterAction,
      requestPeopleLoad,
      scheduleInboxRefreshForUid,
      setBlockToSideView,
      settings,
      syncPersistedDueDateValue,
      t,
      upsertLoadedPerson,
    ],
  );

  const handleDelegateSkip = useCallback(() => {
    if (pendingDelegateUid) {
      rememberCounterAction(pendingDelegateUid, "delegate");
    }
    scheduleInboxRefreshForUid(pendingDelegateUid);
    advanceWithExpectedRemoval();
  }, [
    advanceWithExpectedRemoval,
    pendingDelegateUid,
    rememberCounterAction,
    scheduleInboxRefreshForUid,
  ]);

  const handleSubmitCurrent = useCallback((): void => {
    const targetItem = currentItemRef.current;
    if (!targetItem) {
      return;
    }
    if (!isBlockPresent(targetItem.uid)) {
      handleMissingCurrentItem(targetItem.uid);
      return;
    }

    syncFormStateFromDom();
    const {
      contextQuery: contextValue,
      delegateQuery: rawDelegateQuery,
      projectQuery: projectValue,
      selectedProject,
    } = formStateRef.current;
    const delegateValue = rawDelegateQuery.trim();
    const scheduleState = getScheduleStateForUid(targetItem.uid);
    const submitIntent = resolveSubmitIntent({
      blockText: targetItem.text,
      contextValue,
      delegateValue,
      projectQuery: projectValue,
      scheduledDateValue: scheduleState.scheduledDateValue,
      selectedProject,
      settings,
      shouldUnsetDue: scheduleState.shouldUnsetDue,
    });
    if (!submitIntent.shouldSubmit) {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    const wasEditingText = Boolean(
      activeElement &&
      (activeElement.isContentEditable ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.classList.contains("rm-block-input")),
    );

    if (submitIntent.autoTagAsUp) {
      rememberCounterAction(targetItem.uid, "up");
    } else if (submitIntent.hasDelegateIntent) {
      rememberCounterAction(targetItem.uid, "delegate");
    } else if (submitIntent.hasProjectIntent) {
      rememberCounterAction(targetItem.uid, "project");
    }

    advanceWithExpectedRemoval(targetItem.uid, targetItem.text);

    enqueueWrite(async () => {
      try {
        await waitForAnimationFrame();
        await waitForAnimationFrame();
        if (!mountedRef.current) {
          return;
        }

        if (wasEditingText && activeElement?.isConnected) {
          activeElement.blur();
          await sleep(BLUR_SETTLE_DELAY_MS);
          if (!mountedRef.current) {
            return;
          }
        }

        const blockString = await pullLatestBlockString(targetItem.uid, targetItem.text);
        if (!isBlockPresent(targetItem.uid)) {
          return;
        }

        if (submitIntent.hasDelegateIntent) {
          requestPeopleLoad();
        }

        let projectReactivated = false;
        const result = await runTriageProcess({
          currentTag: "",
          delegateReplaceTags: [settings.inboxPage],
          formState: {
            contextValue,
            delegateValue,
            persistedDueDate: scheduleState.scheduledDateValue,
            projectQuery: projectValue,
            scheduleIntent: scheduleState.intent,
            selectedProject,
            unsetDue: scheduleState.shouldUnsetDue,
          },
          item: targetItem,
          notifyDelegatedAgent,
          onDelegatePersonResolved: (person) => {
            upsertLoadedPerson(person);
            requestPeopleLoad();
          },
          people: peopleRef.current,
          projectFlow: {
            onCreateProjectFromInput: createProjectFromTemplateAndTeleportTodo,
            onProjectHandled: () => {
              invalidateTriageProjectsCache();
              rememberCounterAction(targetItem.uid, "project");
              if (projectReactivated) {
                store.scheduleRefresh(settings, REFRESH_DELAY_MS, { scope: "projects" });
                store.scheduleRefresh(settings, REFRESH_DELAY_MS, { scope: "inboxOnly" });
                return;
              }
              scheduleInboxRefreshForUid(targetItem.uid);
            },
            onTeleportToProject: async (todoUid, projectUid) => {
              await teleportBlockToProject(todoUid, projectUid);
              if (shouldReactivateProjectOnMove(blockString, settings)) {
                projectReactivated = await reactivateProjectStatusIfInactive(projectUid);
              }
            },
            removeTriageTagIfPresent,
          },
          pullLatestBlockString,
          removeCurrentTagIfPresent: removeTriageTagIfPresent,
          setBlockToSideView,
          settings,
          shouldRemoveCurrentTagOnFinalize: true,
          syncPersistedDueDateValue,
          t,
        });
        setCounterAction(
          targetItem.uid,
          inferTriageCounterActionFromBlock(result.nextBlockString, settings),
        );
        if (!result.projectHandled) {
          scheduleInboxRefreshForUid(targetItem.uid);
        }
      } catch (error) {
        // eslint-disable-next-line no-console -- background write failure should not block triage UI
        console.warn("[RoamGTD] submit background write failed", error);
      }
    });
  }, [
    advanceWithExpectedRemoval,
    currentItemRef,
    enqueueWrite,
    formStateRef,
    getScheduleStateForUid,
    handleMissingCurrentItem,
    isBlockPresent,
    mountedRef,
    notifyDelegatedAgent,
    peopleRef,
    pullLatestBlockString,
    rememberCounterAction,
    requestPeopleLoad,
    scheduleInboxRefreshForUid,
    setBlockToSideView,
    setCounterAction,
    settings,
    sleep,
    store,
    syncFormStateFromDom,
    syncPersistedDueDateValue,
    t,
    upsertLoadedPerson,
    waitForAnimationFrame,
    removeTriageTagIfPresent,
  ]);

  useEffect(() => {
    handleSubmitCurrentRef.current = handleSubmitCurrent;
  }, [handleSubmitCurrent]);

  const handleShortcutAction = useCallback(
    (action: ReviewShortcutAction): boolean => {
      const itemUid = currentItemUidRef.current;

      if (action === "focus") {
        if (showDelegatePromptRef.current) {
          return true;
        }
        if (!itemUid) {
          return false;
        }
        return focusBlockEditor();
      }

      if (action === "submit") {
        handleSubmitCurrentRef.current?.();
        return true;
      }

      if (!itemUid) {
        return false;
      }

      if (action === "delegate") {
        schedulePeopleLoadSoon();
        setPendingDelegateUid(itemUid);
        setShowDelegatePrompt(true);
        return true;
      }
      if (action === "project") {
        focusTriageTabStop("project");
        return true;
      }

      const uid = itemUid;
      const sourceText = currentItemRef.current?.text ?? "";
      const latestPulled = window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid])?.[
        ":block/string"
      ];
      const latestText = typeof latestPulled === "string" ? latestPulled : sourceText;
      const mutationPlan = getShortcutMutationPlan(action, settings);

      if (action === "reference") {
        rememberCounterAction(uid, mutationPlan.counterAction);
        advanceWithExpectedRemoval(uid, latestText);
        enqueueWrite(async () => {
          await removeTodoMarker(uid, latestText);
          store.scheduleRefresh(settings, REFRESH_DELAY_MS, { scope: "inboxOnly" });
        });
        return true;
      }

      if (action === "done") {
        const contextForQueue =
          getHtmlInputValue(CONTEXT_AUTOCOMPLETE_ID) ?? formStateRef.current.contextQuery;
        rememberCounterAction(uid, mutationPlan.counterAction);
        advanceWithExpectedRemoval(uid, latestText);
        enqueueWrite(async () => {
          await markDone(uid, latestText);
          if (contextForQueue.trim()) {
            await upsertContextChild(uid, contextForQueue, syncPersistedDueDateValue);
          }
          store.scheduleRefresh(settings, REFRESH_DELAY_MS, { scope: "inboxOnly" });
        });
        return true;
      }

      rememberCounterAction(uid, mutationPlan.counterAction);
      const contextElement = document.getElementById(
        CONTEXT_AUTOCOMPLETE_ID,
      ) as HTMLInputElement | null;
      const contextForQueue = mutationPlan.shouldApplyContext
        ? (contextElement?.value ?? formStateRef.current.contextQuery)
        : "";
      const scheduleState = mutationPlan.shouldApplySchedule
        ? getScheduleStateForUid(uid)
        : { intent: null, scheduledDateValue: "", shouldUnsetDue: false };
      const peopleForQueue = mutationPlan.shouldApplySchedule ? [...peopleRef.current] : [];

      advanceWithExpectedRemoval(uid, latestText);
      enqueueWrite(async () => {
        await replaceTag(uid, settings.inboxPage, mutationPlan.shortcutTag!, latestText);
        let nextChildren: Array<OrderedChild> | undefined;
        if (mutationPlan.shouldApplySchedule) {
          if (scheduleState.shouldUnsetDue) {
            nextChildren = await clearDueDateChild(uid, syncPersistedDueDateValue, nextChildren);
          } else if (scheduleState.scheduledDateValue.trim()) {
            nextChildren = await upsertDueDateChild(
              uid,
              scheduleState.scheduledDateValue,
              syncPersistedDueDateValue,
              nextChildren,
            );
            if (scheduleState.intent?.time && isGoogleCalendarAvailable()) {
              try {
                const summary = formatCalendarEventSummary(latestText);
                await createEvent(
                  summary,
                  uid,
                  scheduleState.intent.date,
                  10,
                  scheduleState.intent.googleCalendarAccount,
                );
              } catch {
                showTriageToast(t("scheduleGcalUnavailable"), "warning");
              }
            }
          }
          await wireAgendaForTaggedPeople({
            additionalTitles: [contextForQueue],
            blockText: latestText,
            blockUid: uid,
            delegateTargetTags: settings.delegateTargetTags,
            hasDueDate:
              !scheduleState.shouldUnsetDue && Boolean(scheduleState.scheduledDateValue.trim()),
            people: peopleForQueue,
          });
        }
        if (contextForQueue.trim()) {
          await upsertContextChild(uid, contextForQueue, syncPersistedDueDateValue, nextChildren);
        }
        store.scheduleRefresh(settings, REFRESH_DELAY_MS, { scope: "inboxOnly" });
      });
      return true;
    },
    [
      advanceWithExpectedRemoval,
      currentItemRef,
      currentItemUidRef,
      enqueueWrite,
      focusBlockEditor,
      formStateRef,
      getScheduleStateForUid,
      peopleRef,
      schedulePeopleLoadSoon,
      setPendingDelegateUid,
      setShowDelegatePrompt,
      settings,
      showDelegatePromptRef,
      store,
      syncPersistedDueDateValue,
      t,
      rememberCounterAction,
    ],
  );

  return {
    handleDelegateConfirm,
    handleDelegateSkip,
    handleShortcutAction,
    handleSubmitCurrent,
  };
}
