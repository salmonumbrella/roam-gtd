import { executeQuery } from "../data";
import { getOrCreatePageUid, getOrderedChildren } from "../graph-utils";
import { buildAllUpTodoUidsQuery, buildUpTodosWithContextQuery } from "../queries";
import type { GtdSettings } from "../settings";

type ContextTodoRow = readonly [string, string, string];
type UidRow = readonly [string];

function isContextTodoRow(row: ReadonlyArray<string | number>): row is ContextTodoRow {
  return (
    row.length >= 3 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "string"
  );
}

function isUidRow(row: ReadonlyArray<string | number>): row is UidRow {
  return row.length >= 1 && typeof row[0] === "string";
}

export async function rebuildPlansPriorities(settings: GtdSettings): Promise<void> {
  const excludeTags = [
    settings.tagNextAction,
    settings.tagWaitingFor,
    settings.tagDelegated,
    settings.tagSomeday,
  ];

  // 1. Query context mappings and all #up UIDs in parallel
  const [contextRows, allUidRows] = await Promise.all([
    executeQuery(buildUpTodosWithContextQuery(settings.tagNextAction, excludeTags)),
    executeQuery(buildAllUpTodoUidsQuery(settings.tagNextAction)),
  ]);

  const contextMappings = contextRows.filter(isContextTodoRow);
  const allUpUids = new Set(allUidRows.filter(isUidRow).map((row) => row[0]));

  // 2. Group by context
  const contextGroups = new Map<string, Array<string>>(); // context-title → [todo-uid, ...]
  const uidsWithContext = new Set<string>();

  for (const [todoUid, _todoStr, contextTitle] of contextMappings) {
    uidsWithContext.add(todoUid);
    const group = contextGroups.get(contextTitle);
    if (group) {
      if (!group.includes(todoUid)) {
        group.push(todoUid);
      }
    } else {
      contextGroups.set(contextTitle, [todoUid]);
    }
  }

  // 3. Derive "No context" group
  const noContextUids: Array<string> = [];
  for (const uid of allUpUids) {
    if (!uidsWithContext.has(uid)) {
      noContextUids.push(uid);
    }
  }

  // 4. Get or create [[Plans, Priorities]] page
  const pageTitle = settings.dailyPlanParent.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const pageUid = await getOrCreatePageUid(pageTitle);

  // 5. Clear existing children
  const existingChildren = getOrderedChildren(pageUid);
  for (const child of existingChildren) {
    await window.roamAlphaAPI.deleteBlock({ block: { uid: child.uid } });
  }

  // 6. Handle empty state
  if (allUpUids.size === 0) {
    await window.roamAlphaAPI.createBlock({
      block: { string: "No active next actions", uid: window.roamAlphaAPI.util.generateUID() },
      location: { order: "last", "parent-uid": pageUid },
    });
    return;
  }

  // 7. Write context sections (sorted alphabetically)
  const sortedContexts = [...contextGroups.keys()].sort((a, b) => a.localeCompare(b));

  for (const contextTitle of sortedContexts) {
    const uids = contextGroups.get(contextTitle)!;
    const sectionUid = window.roamAlphaAPI.util.generateUID();
    await window.roamAlphaAPI.createBlock({
      block: { string: `#[[${contextTitle}]]`, uid: sectionUid },
      location: { order: "last", "parent-uid": pageUid },
    });
    for (const todoUid of uids) {
      await window.roamAlphaAPI.createBlock({
        block: { string: `((${todoUid}))`, uid: window.roamAlphaAPI.util.generateUID() },
        location: { order: "last", "parent-uid": sectionUid },
      });
    }
  }

  // 8. Write "No context" section at the bottom
  if (noContextUids.length > 0) {
    const noContextSectionUid = window.roamAlphaAPI.util.generateUID();
    await window.roamAlphaAPI.createBlock({
      block: { string: "No context", uid: noContextSectionUid },
      location: { order: "last", "parent-uid": pageUid },
    });
    for (const todoUid of noContextUids) {
      await window.roamAlphaAPI.createBlock({
        block: { string: `((${todoUid}))`, uid: window.roamAlphaAPI.util.generateUID() },
        location: { order: "last", "parent-uid": noContextSectionUid },
      });
    }
  }
}
