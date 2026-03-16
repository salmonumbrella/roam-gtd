import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ScheduleIntent } from "../components/SchedulePopover";
import type { TranslatorFn } from "../i18n";
import { createAgendaTodo, pageHasTag } from "../people";
import { setBlockViewType } from "../roam-ui-utils";
import type { GtdSettings } from "../settings";
import {
  createProjectFromTemplateAndTeleportTodo,
  reactivateProjectStatusIfInactive,
  teleportBlockToProject,
} from "../teleport";
import {
  CONTEXT_AUTOCOMPLETE_ID,
  DELEGATE_AUTOCOMPLETE_ID,
  PROJECT_AUTOCOMPLETE_ID,
} from "../triage/form-helpers";
import { runTriageProcess } from "../triage/process-engine";
import { shouldReactivateProjectOnMove, validateWebhookUrl } from "../triage/step-logic";
import {
  invalidateTriageProjectsCache,
  buildProjectOptionLookup,
  type ProjectOption,
} from "../triage/support";

const AGENT_TAG_TITLE = "agents";
const SIDE_VIEW_TYPE = "side";

export interface WorkflowProcessDomFormValues {
  contextQuery: string;
  delegateQuery: string;
  projectQuery: string;
  selectedProject: ProjectOption | null;
}

interface UseWorkflowProcessPopoverSubmissionArgs {
  currentTag: string;
  isOpen: boolean;
  onProcessComplete: (uid: string, shouldHide: boolean) => void;
  people: Array<Parameters<typeof runTriageProcess>[0]["people"][number]>;
  persistedDueDate: string;
  readDomFormValues: (
    readInputById: (id: string) => string | undefined,
  ) => WorkflowProcessDomFormValues;
  scheduleIntent: ScheduleIntent | null;
  settings: GtdSettings;
  syncPersistedDueDateValue: (uid: string, value: string) => void;
  t: TranslatorFn;
  targetText: string;
  targetUid: string | null;
  unsetDue: boolean;
}

function readInputById(id: string): string | undefined {
  const element = document.getElementById(id) as HTMLInputElement | null;
  return element?.value;
}

export function readWorkflowProcessPopoverFormStateFromDom({
  projects,
  readInput = readInputById,
}: {
  projects: Array<ProjectOption>;
  readInput?: (id: string) => string | undefined;
}): WorkflowProcessDomFormValues {
  const projectLookup = buildProjectOptionLookup(projects);
  const contextQuery = readInput(CONTEXT_AUTOCOMPLETE_ID) ?? "";
  const delegateQuery = readInput(DELEGATE_AUTOCOMPLETE_ID) ?? "";
  const projectQuery = readInput(PROJECT_AUTOCOMPLETE_ID) ?? "";
  return {
    contextQuery,
    delegateQuery,
    projectQuery,
    selectedProject: projectLookup.get(projectQuery.trim().toLowerCase()) ?? null,
  };
}

export function createWorkflowAgentDelegationNotifier({
  settings,
}: {
  settings: Pick<GtdSettings, "agentDelegationWebhookUrl">;
}) {
  return async (args: { agentTitle: string; agentUid: string; taskUid: string }): Promise<void> => {
    const webhookUrl = settings.agentDelegationWebhookUrl.trim();
    if (!webhookUrl) {
      return;
    }
    const urlError = validateWebhookUrl(webhookUrl);
    if (urlError) {
      return;
    }
    try {
      const isAgent = pageHasTag(args.agentUid, AGENT_TAG_TITLE);
      if (!isAgent) {
        return;
      }
      await fetch(webhookUrl, {
        body: JSON.stringify({
          agentTitle: args.agentTitle,
          agentUid: args.agentUid,
          blockUid: args.taskUid,
          event: "delegated_to_agent",
          source: "roam-gtd",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch {
      // Ignore webhook failures in the popover flow.
    }
  };
}

export function useWorkflowProcessPopoverSubmission({
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
}: UseWorkflowProcessPopoverSubmissionArgs) {
  const [isProcessing, setIsProcessing] = useState(false);
  const mountedRef = useRef(true);
  const processingRef = useRef(false);
  const notifyDelegatedAgent = useMemo(
    () => createWorkflowAgentDelegationNotifier({ settings }),
    [settings],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setBlockToSideView = useCallback(async (uid: string): Promise<void> => {
    await setBlockViewType(uid, SIDE_VIEW_TYPE);
  }, []);

  const handleProcess = useCallback(async () => {
    if (processingRef.current || !isOpen || !targetUid) {
      return;
    }
    processingRef.current = true;
    setIsProcessing(true);
    try {
      const formState = readDomFormValues(readInputById);
      const result = await runTriageProcess({
        currentTag,
        delegateReplaceTags: [
          settings.tagNextAction,
          settings.tagWaitingFor,
          settings.tagDelegated,
          settings.tagSomeday,
        ],
        formState: {
          contextValue: formState.contextQuery,
          delegateValue: formState.delegateQuery,
          persistedDueDate,
          projectQuery: formState.projectQuery,
          scheduleIntent,
          selectedProject: formState.selectedProject,
          unsetDue,
        },
        item: {
          text: targetText,
          uid: targetUid,
        },
        notifyDelegatedAgent,
        onDelegateHandled: createAgendaTodo,
        people,
        projectFlow: {
          onCreateProjectFromInput: createProjectFromTemplateAndTeleportTodo,
          onProjectHandled: () => {
            invalidateTriageProjectsCache();
          },
          onTeleportToProject: async (todoUid, projectUid) => {
            await teleportBlockToProject(todoUid, projectUid);
            if (shouldReactivateProjectOnMove(targetText, settings)) {
              await reactivateProjectStatusIfInactive(projectUid);
            }
          },
          removeTriageTagIfPresent: async (_uid, sourceText) => sourceText,
        },
        pullLatestBlockString: async (uid, fallback = targetText) => {
          const pulled = window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid])?.[
            ":block/string"
          ];
          return typeof pulled === "string" ? pulled : fallback;
        },
        setBlockToSideView,
        settings,
        syncPersistedDueDateValue,
        t,
      });
      onProcessComplete(targetUid, result.shouldHide);
    } finally {
      processingRef.current = false;
      if (mountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [
    currentTag,
    isOpen,
    notifyDelegatedAgent,
    onProcessComplete,
    people,
    persistedDueDate,
    readDomFormValues,
    scheduleIntent,
    setBlockToSideView,
    settings,
    syncPersistedDueDateValue,
    t,
    targetText,
    targetUid,
    unsetDue,
  ]);

  return {
    handleProcess,
    isProcessing,
  };
}
