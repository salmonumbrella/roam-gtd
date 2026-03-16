import { executeQuery, normalizeTodoRow, type QueryRow } from "../../data";
import { parseRoamDate } from "../../date-utils";
import { buildTodosByTagsQuery } from "../../queries";
import type { GtdSettings } from "../../settings";
import { isOpenTaskText } from "../../task-text";
import type { TodoItem } from "../../types";
import type { ScheduledChildrenByParent } from "./scheduled";
import { toDayKey } from "./scheduled";

type TaggedTodoRow = readonly [string, string, string, number, string];

interface SourceDataDeps {
  getBlockStringByUid(uid: string): string | null;
  getDirectParentUid(uid: string): string | null;
}

function isTaggedTodoRow(row: QueryRow): row is TaggedTodoRow {
  return (
    row.length >= 5 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "string" &&
    typeof row[3] === "number" &&
    typeof row[4] === "string"
  );
}

function isProjectHeading(blockString: string): boolean {
  const trimmed = blockString.trim();
  return /^(?:\*\*|__)?\s*Project\s*::/iu.test(trimmed);
}

export function formatContextHeading(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "No context";
  }
  if (/^[A-Za-z0-9/_-]+$/u.test(trimmed)) {
    return `#${trimmed}`;
  }
  return `#[[${trimmed}]]`;
}

export async function fetchOpenNextActions(
  settings: GtdSettings,
  pageTitle: string,
  scheduledChildrenByParent: ScheduledChildrenByParent,
): Promise<Array<TodoItem>> {
  const rows = await executeQuery(buildTodosByTagsQuery([settings.tagNextAction]));
  const normalizedTag = settings.tagNextAction.trim().toLowerCase();
  const byUid = new Map<string, TodoItem>();
  const targetPageDate = parseRoamDate(pageTitle);
  const targetDayKey = targetPageDate ? toDayKey(targetPageDate) : null;

  for (const row of rows) {
    if (!isTaggedTodoRow(row)) {
      continue;
    }
    if (!isOpenTaskText(row[1])) {
      continue;
    }
    if (row[4].trim().toLowerCase() !== normalizedTag) {
      continue;
    }

    const item = normalizeTodoRow([row[0], row[1], row[2], row[3]]);
    const scheduledChildren = scheduledChildrenByParent.get(item.uid);
    if (scheduledChildren) {
      if (!targetDayKey || !scheduledChildren.childUidsByDayKey.has(targetDayKey)) {
        continue;
      }
    }
    const existing = byUid.get(item.uid);
    if (!existing || item.createdTime < existing.createdTime) {
      byUid.set(item.uid, item);
    }
  }

  return Array.from(byUid.values()).sort(
    (a, b) => a.createdTime - b.createdTime || a.uid.localeCompare(b.uid),
  );
}

export function fetchNearestProjectAncestors(
  todoUids: Array<string>,
  deps: SourceDataDeps,
): Map<string, string> {
  const byTodoUid = new Map<string, string>();
  const parentCache = new Map<string, string | null>();
  const stringCache = new Map<string, string | null>();

  const getParentCached = (uid: string): string | null => {
    if (parentCache.has(uid)) {
      return parentCache.get(uid) ?? null;
    }
    const parentUid = deps.getDirectParentUid(uid);
    parentCache.set(uid, parentUid);
    return parentUid;
  };

  const getStringCached = (uid: string): string | null => {
    if (stringCache.has(uid)) {
      return stringCache.get(uid) ?? null;
    }
    const blockString = deps.getBlockStringByUid(uid);
    stringCache.set(uid, blockString);
    return blockString;
  };

  for (const todoUid of todoUids) {
    const visited = new Set<string>();
    let currentUid = getParentCached(todoUid);
    while (currentUid && !visited.has(currentUid)) {
      visited.add(currentUid);
      const blockString = getStringCached(currentUid);
      if (blockString && isProjectHeading(blockString)) {
        byTodoUid.set(todoUid, currentUid);
        break;
      }
      currentUid = getParentCached(currentUid);
    }
  }

  return byTodoUid;
}
