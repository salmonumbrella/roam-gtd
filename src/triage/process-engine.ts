import type { ScheduleIntent } from "../components/SchedulePopover";
import {
  createEvent,
  formatCalendarEventSummary,
  isGoogleCalendarAvailable,
} from "../google-calendar";
import type { TranslatorFn } from "../i18n";
import { getOrCreatePersonPage, syncDelegatedAgendaEntry, type PersonEntry } from "../people";
import { appendTag, replaceTags } from "../review/actions";
import type { GtdSettings } from "../settings";
import { hasWorkflowTag } from "../tag-utils";
import { getUnifiedTriageProcessPlan } from "../unified-triage-flow";
import {
  hasDoneOrArchivedMarker,
  isBlockCategorized,
  showTriageToast,
  stripTagToken,
  submitProjectSelection,
  type ProjectSubmissionContext,
  wireAgendaForTaggedPeople,
} from "./step-logic";
import type { ProjectOption } from "./support";
import { clearDueDateChild, upsertContextChild, upsertDueDateChild } from "./writes";

export interface TriageProcessFormState {
  contextValue: string;
  delegateValue: string;
  persistedDueDate: string;
  projectQuery: string;
  scheduleIntent: ScheduleIntent | null;
  selectedProject: ProjectOption | null;
  unsetDue: boolean;
}

export interface TriageProcessProjectFlow {
  onCreateProjectFromInput: ProjectSubmissionContext["onCreateProjectFromInput"];
  onProjectHandled: ProjectSubmissionContext["onProjectHandled"];
  onTeleportToProject: ProjectSubmissionContext["onTeleportToProject"];
  removeTriageTagIfPresent: ProjectSubmissionContext["removeTriageTagIfPresent"];
}

export interface TriageProcessInput {
  currentTag: string;
  delegateReplaceTags: Array<string>;
  formState: TriageProcessFormState;
  item: {
    text: string;
    uid: string;
  };
  notifyDelegatedAgent?: (args: {
    agentTitle: string;
    agentUid: string;
    taskUid: string;
  }) => Promise<void>;
  onDelegateHandled?: (uid: string, delegateTitle: string) => Promise<void>;
  onDelegatePersonResolved?: (person: PersonEntry) => void | Promise<void>;
  people: Array<PersonEntry>;
  projectFlow: TriageProcessProjectFlow;
  pullLatestBlockString: (uid: string, fallback?: string) => Promise<string>;
  removeCurrentTagIfPresent?: (uid: string, sourceText: string) => Promise<string>;
  setBlockToSideView?: (uid: string) => Promise<void>;
  settings: GtdSettings;
  shouldRemoveCurrentTagOnFinalize?: boolean;
  syncPersistedDueDateValue: (uid: string, value: string) => void;
  t: TranslatorFn;
}

export interface TriageProcessResult {
  nextBlockString: string;
  nextTag: string;
  projectHandled: boolean;
  shouldHide: boolean;
}

export interface ResolveTriageSubmitIntentArgs {
  blockText: string;
  contextValue: string;
  delegateValue: string;
  projectQuery: string;
  scheduledDateValue: string;
  selectedProject: ProjectOption | null;
  settings: GtdSettings;
  shouldUnsetDue: boolean;
}

export interface TriageSubmitIntent {
  autoTagAsUp: boolean;
  hasDelegateIntent: boolean;
  hasProjectIntent: boolean;
  shouldSubmit: boolean;
}

function getScheduledDateValue(formState: TriageProcessFormState): string {
  return formState.scheduleIntent?.roamDate ?? formState.persistedDueDate;
}

export function resolveSubmitIntent(args: ResolveTriageSubmitIntentArgs): TriageSubmitIntent {
  const {
    blockText,
    contextValue,
    delegateValue,
    projectQuery,
    scheduledDateValue,
    selectedProject,
    settings,
    shouldUnsetDue,
  } = args;
  const hasDelegateIntent = delegateValue.trim().length > 0;
  const hasProjectIntent = Boolean(selectedProject) || projectQuery.trim().length > 0;
  const hasScheduleIntent = scheduledDateValue.trim().length > 0 || shouldUnsetDue;
  const hasContextIntent = contextValue.trim().length > 0;
  const categorized = isBlockCategorized(blockText, settings);
  const autoTagAsUp =
    !categorized &&
    !hasDelegateIntent &&
    !hasProjectIntent &&
    (hasContextIntent || hasScheduleIntent);

  return {
    autoTagAsUp,
    hasDelegateIntent,
    hasProjectIntent,
    shouldSubmit: categorized || hasDelegateIntent || hasProjectIntent || autoTagAsUp,
  };
}

async function applyDueDateContextAndAgenda(args: {
  blockText: string;
  contextValue: string;
  excludeTitles?: Array<string>;
  formState: TriageProcessFormState;
  people: Array<PersonEntry>;
  settings: GtdSettings;
  summaryText: string;
  syncPersistedDueDateValue: (uid: string, value: string) => void;
  t: TranslatorFn;
  uid: string;
}): Promise<void> {
  const {
    blockText,
    contextValue,
    excludeTitles,
    formState,
    people,
    settings,
    summaryText,
    syncPersistedDueDateValue,
    t,
    uid,
  } = args;
  const targetDueDate = getScheduledDateValue(formState);
  let nextChildren: Awaited<ReturnType<typeof upsertDueDateChild>> | undefined;

  if (formState.unsetDue) {
    nextChildren = await clearDueDateChild(uid, syncPersistedDueDateValue, nextChildren);
  } else if (targetDueDate.trim()) {
    nextChildren = await upsertDueDateChild(
      uid,
      targetDueDate,
      syncPersistedDueDateValue,
      nextChildren,
    );
    if (formState.scheduleIntent?.time && isGoogleCalendarAvailable()) {
      try {
        await createEvent(
          formatCalendarEventSummary(summaryText),
          uid,
          formState.scheduleIntent.date,
          10,
          formState.scheduleIntent.googleCalendarAccount,
        );
      } catch {
        showTriageToast(t("scheduleGcalUnavailable"), "warning");
      }
    }
  }

  if (contextValue.trim()) {
    await upsertContextChild(uid, contextValue, syncPersistedDueDateValue, nextChildren);
  }

  await wireAgendaForTaggedPeople({
    additionalTitles: [contextValue],
    blockText,
    blockUid: uid,
    delegateTargetTags: settings.delegateTargetTags,
    excludeTitles,
    hasDueDate: !formState.unsetDue && Boolean(targetDueDate.trim()),
    people,
  });
}

function shouldStripCurrentTagOnFinalize(blockString: string, settings: GtdSettings): boolean {
  if (hasDoneOrArchivedMarker(blockString)) {
    return true;
  }
  const workflowTags = [
    settings.tagNextAction,
    settings.tagWaitingFor,
    settings.tagDelegated,
    settings.tagSomeday,
  ];
  return workflowTags.some((tag) => hasWorkflowTag(blockString, tag));
}

export async function runTriageProcess(input: TriageProcessInput): Promise<TriageProcessResult> {
  const {
    currentTag,
    delegateReplaceTags,
    formState,
    item,
    notifyDelegatedAgent,
    onDelegateHandled,
    onDelegatePersonResolved,
    people,
    projectFlow,
    pullLatestBlockString,
    removeCurrentTagIfPresent,
    setBlockToSideView,
    settings,
    shouldRemoveCurrentTagOnFinalize = false,
    syncPersistedDueDateValue,
    t,
  } = input;
  const nextContextValue = formState.contextValue.trim();
  const nextDelegateValue = formState.delegateValue.trim();
  const nextProjectQuery = formState.projectQuery;
  let latestBlockString = await pullLatestBlockString(item.uid, item.text);
  const shouldAutoTagUncategorizedBlock = !isBlockCategorized(latestBlockString, settings);
  const processPlan = getUnifiedTriageProcessPlan({
    blockString: latestBlockString,
    contextQuery: nextContextValue,
    currentTag,
    delegateQuery: nextDelegateValue,
    persistedDueDate: formState.persistedDueDate,
    projectQuery: nextProjectQuery,
    scheduleRoamDate: formState.scheduleIntent?.roamDate,
    selectedProject: formState.selectedProject,
    settings,
    shouldAutoTagAsUp: shouldAutoTagUncategorizedBlock,
    unsetDue: formState.unsetDue,
  });

  let nextTag = processPlan.presentWorkflowTags[0] ?? currentTag;

  if (processPlan.shouldPromoteToNext) {
    await replaceTags(
      item.uid,
      processPlan.workflowTags,
      settings.tagNextAction,
      latestBlockString,
    );
    nextTag = settings.tagNextAction;
    latestBlockString = await pullLatestBlockString(item.uid, latestBlockString);
  } else if (processPlan.shouldAutoTagAsUp) {
    await appendTag(item.uid, settings.tagNextAction, latestBlockString);
    nextTag = settings.tagNextAction;
    latestBlockString = await pullLatestBlockString(item.uid, latestBlockString);
  }

  if (processPlan.hasDelegateIntent) {
    const personPage = await getOrCreatePersonPage(nextDelegateValue, settings.delegateTargetTags);
    await onDelegatePersonResolved?.(personPage);
    const withoutPersonTag = stripTagToken(latestBlockString, nextDelegateValue);
    await replaceTags(item.uid, delegateReplaceTags, settings.tagDelegated, withoutPersonTag);
    nextTag = settings.tagDelegated;
    latestBlockString = await pullLatestBlockString(item.uid, withoutPersonTag);

    await applyDueDateContextAndAgenda({
      blockText: latestBlockString,
      contextValue: nextContextValue,
      excludeTitles: [nextDelegateValue],
      formState,
      people,
      settings,
      summaryText: withoutPersonTag,
      syncPersistedDueDateValue,
      t,
      uid: item.uid,
    });

    if (setBlockToSideView) {
      await setBlockToSideView(item.uid);
    }
    if (onDelegateHandled) {
      await onDelegateHandled(item.uid, nextDelegateValue);
    } else {
      await syncDelegatedAgendaEntry(item.uid, nextDelegateValue);
    }
    if (notifyDelegatedAgent) {
      await notifyDelegatedAgent({
        agentTitle: nextDelegateValue,
        agentUid: personPage.uid,
        taskUid: item.uid,
      });
    }
  }

  const projectHandled = processPlan.shouldRunProjectFlow
    ? await submitProjectSelection({
        blockString: latestBlockString,
        currentItem: {
          ageDays: 0,
          createdTime: Date.now(),
          deferredDate: null,
          pageTitle: "",
          text: latestBlockString,
          uid: item.uid,
        },
        onCreateProjectFromInput: projectFlow.onCreateProjectFromInput,
        onProjectHandled: projectFlow.onProjectHandled,
        onTeleportToProject: projectFlow.onTeleportToProject,
        projectQuery: nextProjectQuery,
        removeTriageTagIfPresent: projectFlow.removeTriageTagIfPresent,
        selectedProject: formState.selectedProject,
      })
    : false;

  if (!projectHandled && !processPlan.hasDelegateIntent) {
    if (
      shouldRemoveCurrentTagOnFinalize &&
      removeCurrentTagIfPresent &&
      shouldStripCurrentTagOnFinalize(latestBlockString, settings)
    ) {
      latestBlockString = await removeCurrentTagIfPresent(item.uid, latestBlockString);
    }

    await applyDueDateContextAndAgenda({
      blockText: latestBlockString,
      contextValue: nextContextValue,
      formState,
      people,
      settings,
      summaryText: latestBlockString,
      syncPersistedDueDateValue,
      t,
      uid: item.uid,
    });
  }

  return {
    nextBlockString: latestBlockString,
    nextTag,
    projectHandled,
    shouldHide: projectHandled || nextTag !== currentTag,
  };
}
