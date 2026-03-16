import { formatRoamDate } from "../../date-utils";
import {
  getOrCreatePageUid,
  getOrderedChildren,
  isSingleStringRow,
  runQuerySync,
} from "../../graph-utils";
import type { GtdSettings } from "../../settings";
import { hasDoneOrArchivedMarker, isOpenTaskText, prependTaskMarker } from "../../task-text";
import type { TodoItem } from "../../types";
import { groupNextActionsByContext, isNoContextGroup } from "../next-actions-grouping";
import { clearGeneratedNextActionArtifacts } from "./cleanup";
import { fetchScheduledChildrenByParent, filterScheduledChildrenForDay } from "./scheduled";
import {
  fetchNearestProjectAncestors,
  fetchOpenNextActions,
  formatContextHeading,
} from "./source-data";

type BlockViewType = "tabs" | "outline" | "horizontal" | "popout" | "comment" | "side" | "vertical";

export interface SpawnNextActionsOptions {
  generatedRootText?: string;
  parentBlockText?: string;
  sectionBlockText?: string;
}

export interface SpawnNextActionsResult {
  groupCount: number;
  itemCount: number;
  pageTitle: string;
  parentUid: string;
}

async function createChildBlock(
  parentUid: string,
  text: string,
  order: number | "last" = "last",
  open?: boolean,
): Promise<string> {
  const uid = window.roamAlphaAPI.util.generateUID();
  const block: { open?: boolean; string: string; uid: string } = { string: text, uid };
  if (typeof open === "boolean") {
    block.open = open;
  }
  await window.roamAlphaAPI.createBlock({
    block,
    location: { order, "parent-uid": parentUid },
  });
  return uid;
}

function getBlockViewType(uid: string): string | null {
  const rows = runQuerySync(
    `[:find ?view-str
      :in $ ?uid
      :where
        [?b :block/uid ?uid]
        [?b :block/view-type ?view]
        [(str ?view) ?view-str]]`,
    uid,
  );
  const first = rows.find(isSingleStringRow);
  const value = first?.[0]?.trim();
  if (!value) {
    return null;
  }
  return value.replace(/^:/u, "");
}

async function setBlockViewType(uid: string, viewType: BlockViewType): Promise<void> {
  if (getBlockViewType(uid) === viewType) {
    return;
  }
  await window.roamAlphaAPI.updateBlock({
    block: { "block-view-type": viewType, uid } as { uid: string } & Record<string, unknown>,
  });
}

async function getOrCreateChildByText(
  parentUid: string,
  text: string,
  options: { openWhenCreated?: boolean } = {},
): Promise<string> {
  const children = getOrderedChildren(parentUid);
  const existing = children.find((child) => child.string.trim() === text.trim());
  if (existing) {
    return existing.uid;
  }
  return createChildBlock(parentUid, text, "last", options.openWhenCreated);
}

function getBlockStringByUid(uid: string): string | null {
  const block = window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid]);
  const blockString = block?.[":block/string"];
  return typeof blockString === "string" ? blockString : null;
}

function getDirectParentUid(childUid: string): string | null {
  const rows = runQuerySync(
    `[:find ?parent-uid
      :in $ ?child-uid
      :where
        [?child :block/uid ?child-uid]
        [?parent :block/children ?child]
        [?parent :block/uid ?parent-uid]]`,
    childUid,
  );
  const first = rows.find(isSingleStringRow);
  return first?.[0] ?? null;
}

async function createItemsUnderContainer(args: {
  containerUid: string;
  createChildBlock: typeof createChildBlock;
  items: Array<TodoItem>;
  matchingDueOrReminderChildren: Map<string, { childUids: Array<string>; parentString: string }>;
  projectParents: Map<string, string>;
  setBlockViewType: typeof setBlockViewType;
  shouldShowScheduledChildrenInline: boolean;
}): Promise<number> {
  const {
    containerUid,
    createChildBlock,
    items,
    matchingDueOrReminderChildren,
    projectParents,
    setBlockViewType,
    shouldShowScheduledChildrenInline,
  } = args;
  let spawnedItemCount = 0;

  for (const item of items) {
    const todoRefUid = await createChildBlock(containerUid, `((${item.uid}))`);
    spawnedItemCount += 1;
    const scheduledChildren = matchingDueOrReminderChildren.get(item.uid)?.childUids ?? [];
    const projectUid = projectParents.get(item.uid);
    for (const childUid of scheduledChildren) {
      await createChildBlock(todoRefUid, `((${childUid}))`);
    }
    if (projectUid) {
      await createChildBlock(todoRefUid, `((${projectUid}))`);
    }
    if (!projectUid && (!shouldShowScheduledChildrenInline || scheduledChildren.length === 0)) {
      continue;
    }
    await setBlockViewType(todoRefUid, "side");
  }

  return spawnedItemCount;
}

function collectScheduledOnlyParents(
  matchingDueOrReminderChildren: Map<string, { childUids: Array<string>; parentString: string }>,
  nextActionUids: Set<string>,
): Array<[string, { childUids: Array<string>; parentString: string }]> {
  return Array.from(matchingDueOrReminderChildren.entries()).filter(
    ([scheduledParentUid, match]) =>
      !nextActionUids.has(scheduledParentUid) && !hasDoneOrArchivedMarker(match.parentString),
  );
}

export async function spawnNextActionsIntoPage(
  settings: GtdSettings,
  pageTitle: string,
  options: SpawnNextActionsOptions = {},
): Promise<SpawnNextActionsResult> {
  const parentBlockText = options.parentBlockText ?? settings.dailyPlanParent;
  const generatedRootText = options.generatedRootText ?? "roam-gtd::next-actions-generated";
  const sectionBlockText = options.sectionBlockText ?? "Next Actions";

  const pageUid = await getOrCreatePageUid(pageTitle);
  const parentUid = await getOrCreateChildByText(pageUid, parentBlockText, {
    openWhenCreated: false,
  });

  await clearGeneratedNextActionArtifacts(
    parentUid,
    settings,
    { generatedRootText, sectionBlockText },
    { getBlockStringByUid, getOrderedChildren },
  );

  const scheduledChildrenByParent = await fetchScheduledChildrenByParent();
  const matchingDueOrReminderChildren = filterScheduledChildrenForDay(
    scheduledChildrenByParent,
    pageTitle,
  );
  const items = await fetchOpenNextActions(settings, pageTitle, scheduledChildrenByParent);
  const projectParents = fetchNearestProjectAncestors(
    items.map((item) => item.uid),
    {
      getBlockStringByUid,
      getDirectParentUid,
    },
  );
  // Keep current behavior: only today's daily note gets side-view schedule expansion.
  const showScheduledInline = pageTitle === formatRoamDate(new Date());
  const groups = groupNextActionsByContext(items, settings);
  const contextGroupCount = groups.filter((group) => !isNoContextGroup(group)).length;
  const nextActionUids = new Set(items.map((item) => item.uid));
  let spawnedItemCount = 0;

  for (const group of groups) {
    if (isNoContextGroup(group)) {
      spawnedItemCount += await createItemsUnderContainer({
        containerUid: parentUid,
        createChildBlock,
        items: group.items,
        matchingDueOrReminderChildren,
        projectParents,
        setBlockViewType,
        shouldShowScheduledChildrenInline: showScheduledInline,
      });
      continue;
    }

    const groupUid = await createChildBlock(
      parentUid,
      formatContextHeading(group.label),
      "last",
      false,
    );
    spawnedItemCount += await createItemsUnderContainer({
      containerUid: groupUid,
      createChildBlock,
      items: group.items,
      matchingDueOrReminderChildren,
      projectParents,
      setBlockViewType,
      shouldShowScheduledChildrenInline: showScheduledInline,
    });
  }

  for (const [scheduledParentUid, match] of collectScheduledOnlyParents(
    matchingDueOrReminderChildren,
    nextActionUids,
  )) {
    const shouldPrefixTodo = !isOpenTaskText(match.parentString);
    const lineText = shouldPrefixTodo
      ? prependTaskMarker(`((${scheduledParentUid}))`, "todo")
      : `((${scheduledParentUid}))`;
    const scheduledParentRefUid = await createChildBlock(parentUid, lineText);
    spawnedItemCount += 1;
    for (const childUid of match.childUids) {
      await createChildBlock(scheduledParentRefUid, `((${childUid}))`);
    }
    if (showScheduledInline && match.childUids.length > 0) {
      await setBlockViewType(scheduledParentRefUid, "side");
    }
  }

  return {
    groupCount: contextGroupCount,
    itemCount: spawnedItemCount,
    pageTitle,
    parentUid,
  };
}

export async function spawnNextActionsIntoToday(
  settings: GtdSettings,
  options: SpawnNextActionsOptions = {},
): Promise<SpawnNextActionsResult> {
  return spawnNextActionsIntoPage(settings, formatRoamDate(new Date()), options);
}
