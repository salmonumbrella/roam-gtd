import type { GtdSettings } from "./settings";
import { hasWorkflowTag } from "./tag-utils";

export interface UnifiedTriageProcessPlanArgs {
  blockString: string;
  contextQuery: string;
  currentTag: string;
  delegateQuery: string;
  persistedDueDate: string;
  projectQuery: string;
  scheduleRoamDate?: string | null;
  selectedProject: unknown;
  settings: GtdSettings;
  shouldAutoTagAsUp: boolean;
  unsetDue: boolean;
}

export interface UnifiedTriageProcessPlan {
  hasDelegateIntent: boolean;
  hasProjectIntent: boolean;
  presentWorkflowTags: Array<string>;
  shouldAutoTagAsUp: boolean;
  shouldPromoteToNext: boolean;
  shouldRunProjectFlow: boolean;
  workflowTags: Array<string>;
}

export function getWorkflowTags(settings: GtdSettings): Array<string> {
  return [
    settings.tagNextAction,
    settings.tagWaitingFor,
    settings.tagDelegated,
    settings.tagSomeday,
  ];
}

export function getPresentWorkflowTags(blockString: string, settings: GtdSettings): Array<string> {
  return getWorkflowTags(settings).filter((tag) => hasWorkflowTag(blockString, tag));
}

export function getUnifiedTriageProcessPlan(
  args: UnifiedTriageProcessPlanArgs,
): UnifiedTriageProcessPlan {
  const {
    blockString,
    contextQuery,
    currentTag,
    delegateQuery,
    persistedDueDate,
    projectQuery,
    scheduleRoamDate,
    selectedProject,
    settings,
    shouldAutoTagAsUp,
    unsetDue,
  } = args;
  const workflowTags = getWorkflowTags(settings);
  const presentWorkflowTags = getPresentWorkflowTags(blockString, settings);
  const hasDelegateIntent = delegateQuery.trim().length > 0;
  const hasProjectIntent = Boolean(selectedProject) || projectQuery.trim().length > 0;
  const hasOnlyNextAction =
    presentWorkflowTags.length === 1 && presentWorkflowTags[0] === settings.tagNextAction;
  const hasActionableState = presentWorkflowTags.length > 0 || currentTag.trim().length > 0;
  const hasContextOrDueDateIntent =
    contextQuery.trim().length > 0 ||
    Boolean(scheduleRoamDate?.trim()) ||
    unsetDue ||
    Boolean(persistedDueDate.trim());

  return {
    hasDelegateIntent,
    hasProjectIntent,
    presentWorkflowTags,
    shouldAutoTagAsUp: shouldAutoTagAsUp && hasContextOrDueDateIntent,
    shouldPromoteToNext:
      !hasDelegateIntent && !hasProjectIntent && hasActionableState && !hasOnlyNextAction,
    shouldRunProjectFlow: hasProjectIntent,
    workflowTags,
  };
}
