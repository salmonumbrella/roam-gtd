import {
  createAgendaReference,
  createAgendaTodo,
  fetchAllPeople,
  findPeopleInText,
  type PersonEntry,
} from "../people";
import { removeHashTagForms } from "../review/actions";
import type { GtdSettings } from "../settings";
import { hasWorkflowTag } from "../tag-utils";
import {
  hasDoneOrArchivedMarker as hasSharedDoneOrArchivedMarker,
  hasTodoMarker as hasOpenTaskMarker,
} from "../task-text";
import type { TodoItem } from "../types";
import { getNextTriageTabStop, getTriageTabOrder, type TriageTabStop } from "./form-helpers";

export interface ProjectSubmissionContext {
  blockString: string;
  currentItem: TodoItem;
  onCreateProjectFromInput: (todoUid: string, projectInput: string) => Promise<unknown>;
  onProjectHandled: () => void;
  onTeleportToProject: (todoUid: string, projectUid: string) => Promise<unknown>;
  projectQuery: string;
  removeTriageTagIfPresent: (uid: string, sourceText: string) => Promise<string>;
  selectedProject: { uid: string } | null;
}

export type TriageCounterAction =
  | "delegate"
  | "done"
  | "project"
  | "reference"
  | "someday"
  | "up"
  | "watch";

type ToastIntent = "none" | "primary" | "success" | "warning" | "danger";
type StepOneTabStop = TriageTabStop | "back" | "next" | "process";

interface BlueprintToaster {
  show: (props: { intent: string; message: string; timeout: number }) => void;
}

let triageBlueprintToaster: BlueprintToaster | null = null;

export async function submitProjectSelection(context: ProjectSubmissionContext): Promise<boolean> {
  const {
    blockString,
    currentItem,
    onCreateProjectFromInput,
    onProjectHandled,
    onTeleportToProject,
    projectQuery,
    removeTriageTagIfPresent,
    selectedProject,
  } = context;
  if (selectedProject) {
    await removeTriageTagIfPresent(currentItem.uid, blockString);
    await onTeleportToProject(currentItem.uid, selectedProject.uid);
    onProjectHandled();
    return true;
  }

  const trimmedProjectQuery = projectQuery.trim();
  if (trimmedProjectQuery.length > 0) {
    await removeTriageTagIfPresent(currentItem.uid, blockString);
    await onCreateProjectFromInput(currentItem.uid, trimmedProjectQuery);
    onProjectHandled();
    return true;
  }

  return false;
}

function normalizeAgendaCandidateTitle(value: string): string {
  return value.trim().replace(/^#/, "").replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
}

export async function wireAgendaForTaggedPeople(opts: {
  additionalTitles?: Array<string>;
  blockText: string;
  blockUid: string;
  delegateTargetTags: Array<string>;
  excludeTitles?: Array<string>;
  hasDueDate: boolean;
  people: Array<PersonEntry>;
}): Promise<void> {
  let peopleList = opts.people;
  if (peopleList.length === 0) {
    try {
      peopleList = await fetchAllPeople(opts.delegateTargetTags);
    } catch (error) {
      // eslint-disable-next-line no-console -- best-effort debug logging
      console.warn("[RoamGTD] wireAgendaForTaggedPeople: fetchAllPeople failed", error);
      return;
    }
  }
  const peopleLookup = new Map(
    peopleList.map((person) => [normalizeAgendaCandidateTitle(person.title).toLowerCase(), person]),
  );
  const taggedPeople = findPeopleInText(opts.blockText, peopleList);
  const excludedTitles = new Set(
    (opts.excludeTitles ?? [])
      .map((title) => normalizeAgendaCandidateTitle(title).toLowerCase())
      .filter(Boolean),
  );
  const dedupedPeople = new Map(
    taggedPeople
      .map((person) => [normalizeAgendaCandidateTitle(person.title).toLowerCase(), person] as const)
      .filter(([normalizedTitle]) => !excludedTitles.has(normalizedTitle)),
  );
  for (const title of opts.additionalTitles ?? []) {
    const normalizedTitle = normalizeAgendaCandidateTitle(title).toLowerCase();
    if (
      !normalizedTitle ||
      dedupedPeople.has(normalizedTitle) ||
      excludedTitles.has(normalizedTitle)
    ) {
      continue;
    }
    const person = peopleLookup.get(normalizedTitle);
    if (!person) {
      continue;
    }
    dedupedPeople.set(normalizedTitle, person);
  }
  for (const person of dedupedPeople.values()) {
    try {
      if (opts.hasDueDate) {
        await createAgendaTodo(opts.blockUid, person.title);
      } else {
        await createAgendaReference(opts.blockUid, person.title);
      }
    } catch (error) {
      // eslint-disable-next-line no-console -- best-effort debug logging
      console.warn(
        "[RoamGTD] wireAgendaForTaggedPeople: agenda wiring failed for",
        person.title,
        error,
      );
    }
  }
}

function getBlueprintToaster(): BlueprintToaster | null {
  if (triageBlueprintToaster) {
    return triageBlueprintToaster;
  }
  try {
    const bp = (window as unknown as Record<string, Record<string, unknown>>).Blueprint?.Core as
      | Record<string, unknown>
      | undefined;
    if (!bp) {
      return null;
    }
    const factory = bp.OverlayToaster ?? bp.Toaster;
    if (
      typeof factory !== "function" &&
      typeof (factory as Record<string, unknown>)?.create !== "function"
    ) {
      return null;
    }
    const create =
      typeof (factory as Record<string, unknown>).create === "function"
        ? (
            factory as {
              create: (opts: Record<string, unknown>) => BlueprintToaster;
            }
          ).create
        : (factory as unknown as (opts: Record<string, unknown>) => BlueprintToaster);
    triageBlueprintToaster = create({
      position: (bp.Position as Record<string, string>)?.TOP ?? "top",
    });
  } catch {
    // Blueprint not available in this environment.
  }
  return triageBlueprintToaster;
}

export function resetTriageToaster(): void {
  triageBlueprintToaster = null;
}

export function showTriageToast(content: string, intent: ToastIntent = "none"): void {
  try {
    getBlueprintToaster()?.show({ intent, message: content, timeout: 2500 });
  } catch {
    // Toast failures should never block triage flow.
  }
}

export function getStepOneTabOrder(): Array<TriageTabStop> {
  return getTriageTabOrder();
}

export function getNextStepOneTabStop(
  currentStop: StepOneTabStop | null,
  reverse = false,
  tabOrder: Array<StepOneTabStop> = getTriageTabOrder(),
): StepOneTabStop | null {
  return getNextTriageTabStop(
    currentStop as TriageTabStop | null,
    reverse,
    tabOrder as Array<TriageTabStop>,
  );
}

export function resolveProcessedSnapshot(
  uid: string,
  items: Array<TodoItem>,
  currentItem: TodoItem | null,
  fallbackText: string,
  now: number = Date.now(),
): TodoItem {
  const liveMatch = items.find((item) => item.uid === uid);
  if (liveMatch) {
    return { ...liveMatch };
  }
  if (currentItem?.uid === uid) {
    return { ...currentItem };
  }
  return {
    ageDays: 0,
    createdTime: now,
    deferredDate: null,
    pageTitle: "",
    text: fallbackText,
    uid,
  };
}

export function hasDoneOrArchivedMarker(blockString: string): boolean {
  return hasSharedDoneOrArchivedMarker(blockString);
}

export function shouldReactivateProjectOnMove(blockString: string, settings: GtdSettings): boolean {
  if (hasDoneOrArchivedMarker(blockString)) {
    return false;
  }
  if (hasWorkflowTag(blockString, settings.tagSomeday)) {
    return false;
  }
  return (
    hasWorkflowTag(blockString, settings.tagNextAction) ||
    hasWorkflowTag(blockString, settings.tagWaitingFor) ||
    hasWorkflowTag(blockString, settings.tagDelegated)
  );
}

export function inferTriageCounterActionFromBlock(
  blockString: string,
  settings: GtdSettings,
): TriageCounterAction | null {
  if (hasDoneOrArchivedMarker(blockString)) {
    return "done";
  }

  const workflowCounterActions: Array<[string, TriageCounterAction]> = [
    [settings.tagNextAction, "up"],
    [settings.tagDelegated, "delegate"],
    [settings.tagWaitingFor, "watch"],
    [settings.tagSomeday, "someday"],
  ];
  for (const [tag, action] of workflowCounterActions) {
    if (hasWorkflowTag(blockString, tag)) {
      return action;
    }
  }

  if (!hasOpenTaskMarker(blockString)) {
    return "reference";
  }
  return null;
}

export function resolveCounterActionFromSync(
  previousAction: TriageCounterAction | undefined,
  inferredAction: TriageCounterAction | null,
): TriageCounterAction | null {
  if (inferredAction !== null) {
    return inferredAction;
  }
  if (previousAction === "reference") {
    return "reference";
  }
  return null;
}

export function resolveCounterActionFromSnapshot(
  previousAction: TriageCounterAction | undefined,
  blockString: string,
  settings: GtdSettings,
): TriageCounterAction | null {
  const inferredAction = inferTriageCounterActionFromBlock(blockString, settings);
  return resolveCounterActionFromSync(previousAction, inferredAction);
}

export function isBlockCategorized(blockString: string, settings: GtdSettings): boolean {
  if (!hasOpenTaskMarker(blockString) || hasDoneOrArchivedMarker(blockString)) {
    return true;
  }
  return (
    hasWorkflowTag(blockString, settings.tagNextAction) ||
    hasWorkflowTag(blockString, settings.tagWaitingFor) ||
    hasWorkflowTag(blockString, settings.tagDelegated) ||
    hasWorkflowTag(blockString, settings.tagSomeday)
  );
}

export function stripTagToken(blockString: string, tag: string): string {
  if (!tag.trim()) {
    return blockString;
  }
  return removeHashTagForms(blockString, tag)
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

export function validateWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "Webhook URL must use http:// or https://.";
    }
  } catch {
    return "Webhook URL is not a valid URL.";
  }
  return null;
}
