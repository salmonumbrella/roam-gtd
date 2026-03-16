import { computeAgeDays, normalizeTodoRow, normalizeTopGoalRow, type QueryRow } from "../data";
import { formatRoamDate, parseRoamDate, toRoamLogId } from "../date-utils";
import type { GtdSettings } from "../settings";
import {
  hasDoneOrArchivedMarker,
  hasTodoMarker,
  isGeneratedTaskBlockRefOnly,
  isOpenTaskText,
} from "../task-text";
import type { ProjectSummary, TicklerGroup, TodoItem, TopGoalEntry } from "../types";

type TodoRow = readonly [string, string, string, number];
type CompletedTodoRow = readonly [string, string, string, number, number];
type TaggedTodoRow = readonly [string, string, string, number, string];
type TaggedDeferredRow = readonly [string, string, string, string, number, string];
type GoalRow = readonly [string, string, string];
type ProjectTodoCandidateRow = readonly [string, string, string, number, number];
type TicklerLinkedRefRow = readonly [string, string, number, string, number];
type TicklerScheduledItemRow = readonly [string, string, number, string];

const INACTIVE_PROJECT_MARKER_REGEX = /(?:\[\[(?:✅|❌|checkmark|x|someday)\]\]|#\[\[someday\]\])/i;
const DUE_OR_REMINDER_ATTRIBUTE_REGEX = /^(?:\*\*|__)?\s*(?:Due|Reminder)\s*::\s*(.+)$/iu;
const PAGE_REF_REGEX = /\[\[([^[\]]+)\]\]/u;

const TODO_PROJECT_UID = 0;
const TODO_UID = 1;
const TODO_TEXT = 2;
const TODO_EDIT_TIME = 3;
const TODO_PRIORITY = 4;

export interface WorkflowTodoGroups {
  delegated: Array<TodoItem>;
  nextActions: Array<TodoItem>;
  someday: Array<TodoItem>;
  waitingFor: Array<TodoItem>;
}

function isStringValue(value: string | number | undefined): value is string {
  return typeof value === "string";
}

function isNumberValue(value: string | number | undefined): value is number {
  return typeof value === "number";
}

function isTodoRow(row: QueryRow): row is TodoRow {
  return (
    row.length >= 4 &&
    isStringValue(row[0]) &&
    isStringValue(row[1]) &&
    isStringValue(row[2]) &&
    isNumberValue(row[3])
  );
}

function isTaggedTodoRow(row: QueryRow): row is TaggedTodoRow {
  return (
    row.length >= 5 &&
    isStringValue(row[0]) &&
    isStringValue(row[1]) &&
    isStringValue(row[2]) &&
    isNumberValue(row[3]) &&
    isStringValue(row[4])
  );
}

function isCompletedTodoRow(row: QueryRow): row is CompletedTodoRow {
  return (
    row.length >= 5 &&
    isStringValue(row[0]) &&
    isStringValue(row[1]) &&
    isStringValue(row[2]) &&
    isNumberValue(row[3]) &&
    isNumberValue(row[4])
  );
}

function isTaggedDeferredRow(row: QueryRow): row is TaggedDeferredRow {
  return (
    row.length >= 6 &&
    isStringValue(row[0]) &&
    isStringValue(row[1]) &&
    isStringValue(row[2]) &&
    isStringValue(row[3]) &&
    isNumberValue(row[4]) &&
    isStringValue(row[5])
  );
}

function isThreeStringRow(row: QueryRow): row is GoalRow {
  return row.length >= 3 && isStringValue(row[0]) && isStringValue(row[1]) && isStringValue(row[2]);
}

function isProjectTodoCandidateRow(row: QueryRow): row is ProjectTodoCandidateRow {
  return (
    row.length >= 5 &&
    isStringValue(row[0]) &&
    isStringValue(row[1]) &&
    isStringValue(row[2]) &&
    isNumberValue(row[3]) &&
    isNumberValue(row[4])
  );
}

function isTicklerLinkedRefRow(row: QueryRow): row is TicklerLinkedRefRow {
  return (
    row.length >= 5 &&
    isStringValue(row[0]) &&
    isStringValue(row[1]) &&
    isNumberValue(row[2]) &&
    isStringValue(row[3]) &&
    isNumberValue(row[4])
  );
}

function isTicklerScheduledItemRow(row: QueryRow): row is TicklerScheduledItemRow {
  return (
    row.length >= 4 &&
    isStringValue(row[0]) &&
    isStringValue(row[1]) &&
    isNumberValue(row[2]) &&
    isStringValue(row[3])
  );
}

function isOpenTodoText(text: string): boolean {
  return isOpenTaskText(text);
}

function isTicklerAttributeText(text: string): boolean {
  return DUE_OR_REMINDER_ATTRIBUTE_REGEX.test(text.trim());
}

function isTicklerDisplayText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isTicklerAttributeText(trimmed)) {
    return false;
  }
  if (hasTodoMarker(trimmed)) {
    return isOpenTodoText(trimmed);
  }
  return !hasDoneOrArchivedMarker(trimmed);
}

function parseTicklerTargetDate(
  childString: string,
  monthStartLogId: number,
  monthEndLogId: number,
): { dailyLogId: number; dailyTitle: string } | null {
  const match = childString.trim().match(DUE_OR_REMINDER_ATTRIBUTE_REGEX);
  if (!match) {
    return null;
  }
  const attributeValue = match[1]?.trim() ?? "";
  if (!attributeValue) {
    return null;
  }

  const pageRefTitle = attributeValue.match(PAGE_REF_REGEX)?.[1]?.trim() ?? "";
  const plainDateValue = pageRefTitle || (attributeValue.split(/\s+#/u, 1)[0]?.trim() ?? "");
  const parsedDate = parseRoamDate(plainDateValue);
  if (!parsedDate) {
    return null;
  }

  const dailyLogId = toRoamLogId(parsedDate);
  if (dailyLogId < monthStartLogId || dailyLogId > monthEndLogId) {
    return null;
  }

  return {
    dailyLogId,
    dailyTitle: formatRoamDate(parsedDate),
  };
}

function normalizeProjectTitle(rawTitle: string): string {
  return rawTitle.replace(/^Project::\s*/i, "").trim();
}

function normalizeProjectStatus(statusText: string | null): string {
  const trimmed = statusText?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const pageRefMatch = trimmed.match(/^#?\[\[(.+?)\]\]$/);
  if (pageRefMatch?.[1]) {
    return pageRefMatch[1].trim().toUpperCase();
  }
  const hashMatch = trimmed.match(/^#(.+)$/);
  if (hashMatch?.[1]) {
    return hashMatch[1].trim().toUpperCase();
  }
  return trimmed.toUpperCase();
}

function shouldIncludeProjectInReview(project: ProjectSummary, _hasReviewTodo: boolean): boolean {
  const normalizedStatus = normalizeProjectStatus(project.statusText);
  if (!normalizedStatus) {
    return true;
  }
  return (
    normalizedStatus === "ON_TRACK" || normalizedStatus === "LAGGING" || normalizedStatus === "POOR"
  );
}

function isInactiveProjectMarker(projectString: string): boolean {
  return INACTIVE_PROJECT_MARKER_REGEX.test(projectString);
}

export function categorizeWorkflowTodoRows(
  taggedTodoRows: Array<QueryRow>,
  settings: Pick<GtdSettings, "tagDelegated" | "tagNextAction" | "tagSomeday" | "tagWaitingFor">,
): WorkflowTodoGroups {
  const categorizedTodos = taggedTodoRows
    .filter(isTaggedTodoRow)
    .filter((row) => isOpenTodoText(row[1]));
  const groups: WorkflowTodoGroups = {
    delegated: [],
    nextActions: [],
    someday: [],
    waitingFor: [],
  };

  for (const row of categorizedTodos) {
    const item = normalizeTodoRow([row[0], row[1], row[2], row[3]]);
    if (row[4] === settings.tagNextAction) {
      groups.nextActions.push(item);
    } else if (row[4] === settings.tagWaitingFor) {
      groups.waitingFor.push(item);
    } else if (row[4] === settings.tagDelegated) {
      groups.delegated.push(item);
    } else if (row[4] === settings.tagSomeday) {
      groups.someday.push(item);
    }
  }

  return groups;
}

export function mapTodoRows(rows: Array<QueryRow>): Array<TodoItem> {
  return rows.filter(isTodoRow).map((row) => normalizeTodoRow(row));
}

export function mapCompletedTodoRows(rows: Array<QueryRow>): Array<TodoItem> {
  return rows.filter(isCompletedTodoRow).map((row) => ({
    ...normalizeTodoRow([row[0], row[1], row[2], row[3]]),
    editTime: row[4],
  }));
}

export function mapDeferredTodoRows(
  taggedDeferredRows: Array<QueryRow>,
  settings: Pick<GtdSettings, "tagDelegated" | "tagNextAction" | "tagWaitingFor">,
): Array<TodoItem> {
  const deferredMap = new Map<string, TodoItem>();
  const deferredNextRows: Array<TaggedDeferredRow> = [];
  const deferredWaitingRows: Array<TaggedDeferredRow> = [];
  const deferredDelegatedRows: Array<TaggedDeferredRow> = [];
  const deferredRows = taggedDeferredRows.filter(isTaggedDeferredRow);

  for (const row of deferredRows) {
    if (row[5] === settings.tagNextAction) {
      deferredNextRows.push(row);
    } else if (row[5] === settings.tagWaitingFor) {
      deferredWaitingRows.push(row);
    } else if (row[5] === settings.tagDelegated) {
      deferredDelegatedRows.push(row);
    }
  }

  const orderedDeferredRows = deferredNextRows
    .concat(deferredWaitingRows)
    .concat(deferredDelegatedRows);
  for (const row of orderedDeferredRows) {
    if (!deferredMap.has(row[0])) {
      deferredMap.set(row[0], normalizeTodoRow([row[0], row[1], row[2], row[4]], row[3]));
    }
  }

  return Array.from(deferredMap.values());
}

export function mapTopGoalRows(
  topGoalRows: Array<QueryRow>,
  topGoalAttr: string,
): Array<TopGoalEntry> {
  return topGoalRows.filter(isThreeStringRow).map((row) => normalizeTopGoalRow(row, topGoalAttr));
}

export function buildTicklerGroups(args: {
  monthEndLogId: number;
  monthStartLogId: number;
  resolveDailyPageUid?: (dailyLogId: number, dailyTitle: string) => string | null;
  scheduledPageRefRows: Array<QueryRow>;
  scheduledRows: Array<QueryRow>;
}): Array<TicklerGroup> {
  const {
    monthEndLogId,
    monthStartLogId,
    resolveDailyPageUid = resolveTicklerDailyPageUid,
    scheduledPageRefRows,
    scheduledRows,
  } = args;
  const buckets = new Map<
    string,
    {
      dailyPageUid: string;
      itemsByUid: Map<string, TodoItem>;
      logId: number;
    }
  >();

  const addItem = (dailyTitle: string, dailyLogId: number, item: TodoItem): void => {
    const dailyPageUid = resolveDailyPageUid(dailyLogId, dailyTitle);
    if (!dailyPageUid) {
      return;
    }
    const bucket = buckets.get(dailyTitle) ?? {
      dailyPageUid,
      itemsByUid: new Map<string, TodoItem>(),
      logId: dailyLogId,
    };
    const existing = bucket.itemsByUid.get(item.uid);
    if (!existing || item.createdTime > existing.createdTime) {
      bucket.itemsByUid.set(item.uid, item);
    }
    if (dailyLogId > bucket.logId) {
      bucket.logId = dailyLogId;
    }
    buckets.set(dailyTitle, bucket);
  };

  for (const row of scheduledPageRefRows) {
    if (!isTicklerLinkedRefRow(row) || !isTicklerDisplayText(row[1])) {
      continue;
    }
    addItem(row[3], row[4], normalizeTodoRow([row[0], row[1], row[3], row[2]]));
  }

  for (const row of scheduledRows) {
    if (!isTicklerScheduledItemRow(row) || !isTicklerDisplayText(row[1])) {
      continue;
    }
    const ticklerTarget = parseTicklerTargetDate(row[3], monthStartLogId, monthEndLogId);
    if (!ticklerTarget) {
      continue;
    }
    addItem(
      ticklerTarget.dailyTitle,
      ticklerTarget.dailyLogId,
      normalizeTodoRow([row[0], row[1], ticklerTarget.dailyTitle, row[2]]),
    );
  }

  return Array.from(buckets.entries())
    .map(([dailyTitle, bucket]) => ({
      dailyPageUid: bucket.dailyPageUid,
      dailyTitle,
      items: Array.from(bucket.itemsByUid.values()).sort(
        (a, b) => b.createdTime - a.createdTime || a.uid.localeCompare(b.uid),
      ),
      logId: bucket.logId,
    }))
    .sort((a, b) => b.logId - a.logId || a.dailyTitle.localeCompare(b.dailyTitle))
    .map(({ dailyPageUid, dailyTitle, items }) => ({
      dailyPageUid,
      dailyTitle,
      items,
    }));
}

function resolveTicklerDailyPageUid(dailyLogId: number): string | null {
  const rows = window.roamAlphaAPI.data.q(
    `[:find ?uid . :in $ ?log-id :where [?page :log/id ?log-id] [?page :block/uid ?uid]]`,
    dailyLogId,
  );
  return typeof rows === "string" ? rows : null;
}

export function mapProjectSummaryRows(projectSummaryRows: Array<QueryRow>): Array<ProjectSummary> {
  const projectsByUid = new Map<string, ProjectSummary>();

  for (const row of projectSummaryRows) {
    if (row.length < 5) {
      continue;
    }
    const rawTitle = row[0];
    const pageUid = row[1];
    const statusStr = row[2];
    const statusUid = row[3];
    const todoListUid = row[4];
    if (!isStringValue(rawTitle) || !isStringValue(pageUid) || !isStringValue(statusStr)) {
      continue;
    }
    if (isInactiveProjectMarker(rawTitle)) {
      continue;
    }

    const normalizedStatusText = statusStr.replace(/^Status::\s*/i, "").trim() || null;
    const existing = projectsByUid.get(pageUid);
    if (existing) {
      if (normalizedStatusText && existing.statusText == null) {
        projectsByUid.set(pageUid, {
          ...existing,
          statusBlockUid: isStringValue(statusUid) && statusUid.trim() ? statusUid : null,
          statusText: normalizedStatusText,
          todoListUid:
            existing.todoListUid ??
            (isStringValue(todoListUid) && todoListUid.trim() ? todoListUid : null),
        });
      } else if (existing.todoListUid == null && isStringValue(todoListUid) && todoListUid.trim()) {
        projectsByUid.set(pageUid, {
          ...existing,
          todoListUid,
        });
      }
      continue;
    }

    projectsByUid.set(pageUid, {
      doneCount: 0,
      lastDoneTime: null,
      lastTodoCreatedTime: null,
      lastTodoText: null,
      lastTodoUid: null,
      pageTitle: normalizeProjectTitle(rawTitle),
      pageUid,
      statusBlockUid: isStringValue(statusUid) && statusUid.trim() ? statusUid : null,
      statusText: normalizedStatusText,
      todoCount: 0,
      todoListUid: isStringValue(todoListUid) && todoListUid.trim() ? todoListUid : null,
      totalCount: 0,
    });
  }

  return Array.from(projectsByUid.values());
}

export function attachProjectTodoRows(
  projects: Array<ProjectSummary>,
  todoCandidateRows: Array<QueryRow>,
): Array<ProjectSummary> {
  const todoStateByProjectUid = new Map<
    string,
    {
      count: number;
      hasReviewTodo: boolean;
      todo: ProjectTodoCandidateRow | null;
    }
  >();
  const seenTodoUids = new Map<string, Set<string>>();

  for (const row of todoCandidateRows) {
    if (!isProjectTodoCandidateRow(row)) {
      continue;
    }
    const projectUid = row[TODO_PROJECT_UID];
    const existing = todoStateByProjectUid.get(projectUid);

    let projectSeenUids = seenTodoUids.get(projectUid);
    if (!projectSeenUids) {
      projectSeenUids = new Set();
      seenTodoUids.set(projectUid, projectSeenUids);
    }
    projectSeenUids.add(row[TODO_UID]);

    const isBlockRefOnly = isGeneratedTaskBlockRefOnly(row[TODO_TEXT]);
    if (isBlockRefOnly) {
      todoStateByProjectUid.set(projectUid, {
        count: projectSeenUids.size,
        hasReviewTodo: existing?.hasReviewTodo === true || row[TODO_PRIORITY] > 1,
        todo: existing?.todo ?? null,
      });
      continue;
    }

    const existingTodo = existing?.todo;
    const shouldReplace =
      existingTodo == null ||
      row[TODO_PRIORITY] > existingTodo[TODO_PRIORITY] ||
      (row[TODO_PRIORITY] === existingTodo[TODO_PRIORITY] &&
        (row[TODO_EDIT_TIME] > existingTodo[TODO_EDIT_TIME] ||
          (row[TODO_EDIT_TIME] === existingTodo[TODO_EDIT_TIME] &&
            row[TODO_UID].localeCompare(existingTodo[TODO_UID]) < 0)));

    todoStateByProjectUid.set(projectUid, {
      count: projectSeenUids.size,
      hasReviewTodo: existing?.hasReviewTodo === true || row[TODO_PRIORITY] > 1,
      todo: shouldReplace ? row : existingTodo,
    });
  }

  return projects
    .map((project) => {
      const todoState = todoStateByProjectUid.get(project.pageUid);
      const latestTodo = todoState?.todo;
      const doneCount = project.doneCount ?? 0;
      if (!latestTodo) {
        return {
          ...project,
          todoCount: todoState?.count ?? 0,
          totalCount: (todoState?.count ?? 0) + doneCount,
        };
      }
      return {
        ...project,
        lastTodoCreatedTime: latestTodo[TODO_EDIT_TIME],
        lastTodoText: latestTodo[TODO_TEXT],
        lastTodoUid: latestTodo[TODO_UID],
        todoCount: todoState?.count ?? 0,
        totalCount: (todoState?.count ?? 0) + doneCount,
      };
    })
    .filter((project) =>
      shouldIncludeProjectInReview(
        project,
        todoStateByProjectUid.get(project.pageUid)?.hasReviewTodo === true,
      ),
    );
}

// --- Pull-based project mapping ---

export interface PulledBlockChild {
  ":block/children"?: Array<PulledBlockChild>;
  ":block/refs"?: Array<{ ":node/title": string }>;
  ":block/string": string;
  ":block/uid": string;
  ":create/time"?: number;
  ":edit/time"?: number;
}

export interface PulledProjectEntity {
  ":block/children"?: Array<PulledBlockChild>;
  ":block/string": string;
  ":block/uid": string;
}

interface MapPulledProjectsOptions {
  includeNonReviewableStatuses?: boolean;
}

interface PullMapperTagSettings {
  tagDelegated: string;
  tagNextAction: string;
  tagSomeday: string;
  tagWaitingFor: string;
}

function hasRef(child: PulledBlockChild, title: string): boolean {
  return child[":block/refs"]?.some((ref) => ref[":node/title"] === title) === true;
}

function getPullTodoPriority(child: PulledBlockChild, tags: PullMapperTagSettings): number {
  if (hasRef(child, tags.tagNextAction)) {
    return 4;
  }
  if (hasRef(child, tags.tagDelegated)) {
    return 3;
  }
  if (hasRef(child, tags.tagWaitingFor)) {
    return 2;
  }
  if (hasRef(child, tags.tagSomeday)) {
    return 0;
  }
  return 1;
}

export function mapPulledProjects(
  entities: Array<PulledProjectEntity>,
  tags: PullMapperTagSettings,
  options: MapPulledProjectsOptions = {},
): Array<ProjectSummary> {
  const results: Array<ProjectSummary> = [];

  for (const entity of entities) {
    const rawTitle = entity[":block/string"];
    if (isInactiveProjectMarker(rawTitle)) {
      continue;
    }

    const pageTitle = normalizeProjectTitle(rawTitle);
    const pageUid = entity[":block/uid"];
    const children = entity[":block/children"] ?? [];

    // Find Status:: child
    let statusText: string | null = null;
    let statusBlockUid: string | null = null;
    const statusChild = children.find((c) => c[":block/string"].startsWith("Status::"));
    if (statusChild) {
      statusText = statusChild[":block/string"].replace(/^Status::\s*/i, "").trim() || null;
      statusBlockUid = statusChild[":block/uid"];
    }

    // Find Todo List:: child
    let todoListUid: string | null = null;
    const todoListChild = children.find(
      (c) =>
        c[":block/string"].startsWith("Todo List::") ||
        c[":block/string"].includes("[[Todo List]]"),
    );
    if (todoListChild) {
      todoListUid = todoListChild[":block/uid"];
    }

    // Extract TODO items from todo list children
    let doneCount = 0;
    let lastDoneTime: number | null = null;
    let todoCount = 0;
    let bestTodo: { createdTime: number; priority: number; text: string; uid: string } | null =
      null;
    const todoChildren = todoListChild?.[":block/children"] ?? [];
    const seenUids = new Set<string>();

    for (const todo of todoChildren) {
      if (seenUids.has(todo[":block/uid"])) {
        continue;
      }
      seenUids.add(todo[":block/uid"]);

      const isDoneTodo = hasRef(todo, "DONE") || hasRef(todo, "ARCHIVED");
      if (isDoneTodo) {
        doneCount += 1;
        const completedAt = todo[":edit/time"];
        if (
          typeof completedAt === "number" &&
          (lastDoneTime == null || completedAt > lastDoneTime)
        ) {
          lastDoneTime = completedAt;
        }
        continue;
      }

      if (!hasRef(todo, "TODO")) {
        continue;
      }

      todoCount += 1;

      if (isGeneratedTaskBlockRefOnly(todo[":block/string"])) {
        continue;
      }

      const priority = getPullTodoPriority(todo, tags);
      const createdTime = todo[":create/time"] ?? 0;
      if (
        !bestTodo ||
        priority > bestTodo.priority ||
        (priority === bestTodo.priority &&
          (createdTime > bestTodo.createdTime ||
            (createdTime === bestTodo.createdTime &&
              todo[":block/uid"].localeCompare(bestTodo.uid) < 0)))
      ) {
        bestTodo = { createdTime, priority, text: todo[":block/string"], uid: todo[":block/uid"] };
      }
    }

    const project: ProjectSummary = {
      doneCount,
      lastDoneTime,
      lastTodoCreatedTime: bestTodo?.createdTime ?? null,
      lastTodoText: bestTodo?.text ?? null,
      lastTodoUid: bestTodo?.uid ?? null,
      pageTitle,
      pageUid,
      statusBlockUid,
      statusText,
      todoCount,
      todoListUid,
      totalCount: todoCount + doneCount,
    };

    if (
      !options.includeNonReviewableStatuses &&
      !shouldIncludeProjectInReview(project, bestTodo != null && bestTodo.priority > 1)
    ) {
      continue;
    }

    results.push(project);
  }

  return results;
}

// --- Pull-based inbox mapping ---

export interface PulledTriageBlock {
  ":block/children"?: Array<PulledBlockChild>;
  ":block/page"?: { ":node/title": string };
  ":block/string": string;
  ":block/uid": string;
}

export function mapPulledInboxItems(
  triageBlocks: Array<PulledTriageBlock>,
  excludeTags: Array<string>,
): Array<TodoItem> {
  const excludeSet = new Set(["DONE", "ARCHIVED", ...excludeTags]);
  const items: Array<TodoItem> = [];

  for (const parent of triageBlocks) {
    if (!parent) {
      continue;
    }
    const pageTitle = parent[":block/page"]?.[":node/title"] ?? "";
    for (const child of parent[":block/children"] ?? []) {
      const refs = child[":block/refs"]?.map((r) => r[":node/title"]) ?? [];
      if (!refs.includes("TODO")) {
        continue;
      }
      if (refs.some((r) => excludeSet.has(r))) {
        continue;
      }

      items.push({
        ageDays: computeAgeDays(child[":create/time"] ?? 0),
        createdTime: child[":create/time"] ?? 0,
        deferredDate: null,
        pageTitle,
        text: child[":block/string"],
        uid: child[":block/uid"],
      });
    }
  }

  return items.sort((a, b) => b.createdTime - a.createdTime || a.uid.localeCompare(b.uid));
}
