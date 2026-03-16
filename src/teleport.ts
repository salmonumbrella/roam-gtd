import type { QueryRow } from "./data";
import { executeQuery } from "./data";
import { formatRoamDate } from "./date-utils";
import { getOrderedChildren, getOrCreatePageUid, runQuerySync } from "./graph-utils";
import {
  buildAllProjectsByRecencyQuery,
  buildAllProjectsQuery,
  buildStatusWorkflowProjectsByRecencyQuery,
  buildStatusWorkflowProjectsQuery,
} from "./queries";

type ActiveProjectOption = { title: string; uid: string };
type ActiveProjectWithRecency = ActiveProjectOption & { lastInteractionTime: number };
const INACTIVE_PROJECT_STATUS_REGEX =
  /(?:#?\[\[(?:✅|❌|checkmark|x|someday)\]\]|#(?:✅|❌|checkmark|x|someday)\b)/i;
const INACTIVE_PROJECT_INLINE_MARKER_REGEX =
  /\s*(?:#?\[\[(?:✅|❌|checkmark|x|someday)\]\]|#(?:✅|❌|checkmark|x|someday)\b)\s*/gi;

function isStringTripleRow(row: QueryRow): row is readonly [string, string, string] {
  return (
    row.length >= 3 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "string"
  );
}

function isProjectRecencyRow(row: QueryRow): row is readonly [string, string, string, number] {
  return (
    row.length >= 4 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "string" &&
    typeof row[3] === "number"
  );
}

function extractProjectTitle(projectBlockString: string): string {
  return projectBlockString
    .replace(/^Project::\s*/i, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

async function fetchStatusWorkflowProjects(): Promise<Array<ActiveProjectOption>> {
  const recencyRows = await executeQuery(buildStatusWorkflowProjectsByRecencyQuery());
  const fallbackRows =
    recencyRows.length === 0 ? await executeQuery(buildStatusWorkflowProjectsQuery()) : [];
  const byUid = new Map<string, ActiveProjectWithRecency>();

  for (const row of recencyRows) {
    if (!isProjectRecencyRow(row)) {
      continue;
    }
    const [pageTitle, projectBlockUid, projectBlockString, interactionTime] = row;
    const extractedTitle = extractProjectTitle(projectBlockString);
    const title = extractedTitle || pageTitle.trim();
    if (!title) {
      continue;
    }
    const existing = byUid.get(projectBlockUid);
    if (
      !existing ||
      interactionTime > existing.lastInteractionTime ||
      (interactionTime === existing.lastInteractionTime && title.localeCompare(existing.title) < 0)
    ) {
      byUid.set(projectBlockUid, {
        lastInteractionTime: interactionTime,
        title,
        uid: projectBlockUid,
      });
    }
  }

  if (byUid.size === 0) {
    for (const row of fallbackRows) {
      if (!isStringTripleRow(row)) {
        continue;
      }
      const [pageTitle, projectBlockUid, projectBlockString] = row;
      if (byUid.has(projectBlockUid)) {
        continue;
      }
      const extractedTitle = extractProjectTitle(projectBlockString);
      const title = extractedTitle || pageTitle.trim();
      if (!title) {
        continue;
      }
      byUid.set(projectBlockUid, { lastInteractionTime: 0, title, uid: projectBlockUid });
    }
  }

  return Array.from(byUid.values())
    .sort((a, b) => b.lastInteractionTime - a.lastInteractionTime || a.title.localeCompare(b.title))
    .map((project) => ({ title: project.title, uid: project.uid }));
}

async function fetchAllProjectBlocks(): Promise<Array<ActiveProjectOption>> {
  const recencyRows = await executeQuery(buildAllProjectsByRecencyQuery());
  const fallbackRows = recencyRows.length === 0 ? await executeQuery(buildAllProjectsQuery()) : [];
  const byUid = new Map<string, ActiveProjectWithRecency>();

  for (const row of recencyRows) {
    if (!isProjectRecencyRow(row)) {
      continue;
    }
    const [pageTitle, projectBlockUid, projectBlockString, interactionTime] = row;
    const extractedTitle = extractProjectTitle(projectBlockString);
    const title = extractedTitle || pageTitle.trim();
    if (!title) {
      continue;
    }
    const existing = byUid.get(projectBlockUid);
    if (
      !existing ||
      interactionTime > existing.lastInteractionTime ||
      (interactionTime === existing.lastInteractionTime && title.localeCompare(existing.title) < 0)
    ) {
      byUid.set(projectBlockUid, {
        lastInteractionTime: interactionTime,
        title,
        uid: projectBlockUid,
      });
    }
  }

  if (byUid.size === 0) {
    for (const row of fallbackRows) {
      if (!isStringTripleRow(row)) {
        continue;
      }
      const [pageTitle, projectBlockUid, projectBlockString] = row;
      if (byUid.has(projectBlockUid)) {
        continue;
      }
      const extractedTitle = extractProjectTitle(projectBlockString);
      const title = extractedTitle || pageTitle.trim();
      if (!title) {
        continue;
      }
      byUid.set(projectBlockUid, { lastInteractionTime: 0, title, uid: projectBlockUid });
    }
  }

  return Array.from(byUid.values())
    .sort((a, b) => b.lastInteractionTime - a.lastInteractionTime || a.title.localeCompare(b.title))
    .map((project) => ({ title: project.title, uid: project.uid }));
}

function normalizeTemplateLabel(label: string): string {
  return label
    .replaceAll(/#\[\[([^[\]]+)\]\]/g, "$1")
    .replaceAll(/#([^\s]+)/g, "$1")
    .replaceAll(/\[\[([^[\]]+)\]\]/g, "$1")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeProjectInput(input: string): string {
  return input.replace(/^Project::\s*/i, "").trim();
}

function normalizeTagTitle(input: string): string {
  return input
    .replace(/^#/, "")
    .replaceAll(/\[\[([^[\]]+)\]\]/g, "$1")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function isTemplateRow(row: QueryRow): row is readonly [string, string, number] {
  return (
    row.length >= 3 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "number"
  );
}

function isParentOrderRow(row: QueryRow): row is readonly [string, number] {
  return row.length >= 2 && typeof row[0] === "string" && typeof row[1] === "number";
}

function findTemplateRootUid(templateName: string): string | null {
  const rows = runQuerySync(
    `[:find ?uid ?s ?order
      :where
        [?templates-page :node/title "roam/templates"]
        [?templates-page :block/children ?block]
        [?block :block/uid ?uid]
        [?block :block/string ?s]
        [?block :block/order ?order]]`,
  );
  const templates = rows.filter(isTemplateRow).sort((a, b) => a[2] - b[2]);
  const normalizedTarget = normalizeTemplateLabel(templateName);

  const exact = templates.find(([, s]) => normalizeTemplateLabel(s) === normalizedTarget);
  if (exact) {
    return exact[0];
  }

  const prefix = templates.find(([, s]) =>
    normalizeTemplateLabel(s).startsWith(`${normalizedTarget} `),
  );
  if (prefix) {
    return prefix[0];
  }

  const contains = templates.find(([, s]) => normalizeTemplateLabel(s).includes(normalizedTarget));
  return contains?.[0] ?? null;
}

// Sequential awaits are intentional: Roam's block API can silently drop
// concurrent writes or produce incorrect ordering when called in parallel.
async function cloneProjectTemplateChildren(
  sourceParentUid: string,
  targetParentUid: string,
): Promise<string | null> {
  let todoListUid: string | null = null;
  const children = getOrderedChildren(sourceParentUid);

  for (const child of children) {
    const childText = child.string.trim();
    // Flatten empty "Project::" wrapper blocks from templates so
    // project metadata appears directly under "Project:: <name>".
    if (/^Project::\s*$/i.test(childText)) {
      const nestedTodoListUid = await cloneProjectTemplateChildren(child.uid, targetParentUid);
      if (todoListUid == null && nestedTodoListUid != null) {
        todoListUid = nestedTodoListUid;
      }
      continue;
    }

    const newUid = window.roamAlphaAPI.util.generateUID();
    await window.roamAlphaAPI.createBlock({
      block: { string: child.string, uid: newUid },
      location: { order: "last", "parent-uid": targetParentUid },
    });
    if (todoListUid == null && child.string.trim().toLowerCase().startsWith("todo list::")) {
      todoListUid = newUid;
    }
    const nestedTodoListUid = await cloneProjectTemplateChildren(child.uid, newUid);
    if (todoListUid == null && nestedTodoListUid != null) {
      todoListUid = nestedTodoListUid;
    }
  }

  return todoListUid;
}

async function getOrCreateTodoListUid(projectBlockUid: string): Promise<string> {
  const children = getOrderedChildren(projectBlockUid);
  const existing = children.find((child) =>
    child.string.trim().toLowerCase().startsWith("todo list::"),
  );
  if (existing) {
    return existing.uid;
  }

  const todoListUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    block: { string: "Todo List::", uid: todoListUid },
    location: { order: "last", "parent-uid": projectBlockUid },
  });
  return todoListUid;
}

async function getOrCreateLocationBucketUid(
  todoListUid: string,
  locationTitle: string,
): Promise<string> {
  const normalizedTarget = normalizeTagTitle(locationTitle).toLowerCase();
  const children = getOrderedChildren(todoListUid);
  const existing = children.find(
    (child) => normalizeTagTitle(child.string).toLowerCase() === normalizedTarget,
  );
  if (existing) {
    return existing.uid;
  }

  const locationUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    block: { string: `#[[${normalizeTagTitle(locationTitle)}]]`, uid: locationUid },
    location: { order: "last", "parent-uid": todoListUid },
  });
  return locationUid;
}

async function moveBlockWithBreadcrumb(
  blockUid: string,
  destinationParentUid: string,
): Promise<void> {
  // Step 1: Find the direct parent + original order so we can leave a stable breadcrumb.
  const parentOrderRows = runQuerySync(
    `[:find ?parent-uid ?order
      :in $ ?block-uid
      :where
        [?block :block/uid ?block-uid]
        [?block :block/order ?order]
        [?parent :block/children ?block]
        [?parent :block/uid ?parent-uid]]`,
    blockUid,
  );
  const parentOrder = parentOrderRows.find(isParentOrderRow);

  const parentUidFromQuery = parentOrder?.[0] ?? null;
  const breadcrumbOrder = parentOrder?.[1] ?? "last";

  // Fallback for old graphs where direct-parent query does not return a row.
  const blockData = window.roamAlphaAPI.data.pull("[:block/uid {:block/parents [:block/uid]}]", [
    ":block/uid",
    blockUid,
  ]);

  // Extract a parent UID from :block/parents as fallback.
  const parents = (blockData as Record<string, unknown>)?.[":block/parents"] as
    | Array<{ ":block/uid": string }>
    | undefined;
  const parentUid = parentUidFromQuery ?? parents?.[0]?.[":block/uid"] ?? null;

  // Step 2: Move the block to the project page
  await window.roamAlphaAPI.moveBlock({
    block: { uid: blockUid },
    location: { order: "last", "parent-uid": destinationParentUid },
  });

  // Step 3: Leave a breadcrumb block ref in the original location
  if (parentUid) {
    try {
      await window.roamAlphaAPI.createBlock({
        block: { string: `((${blockUid}))` },
        location: { order: breadcrumbOrder, "parent-uid": parentUid },
      });
    } catch (error) {
      // eslint-disable-next-line no-console -- move succeeded; breadcrumb is best-effort safety marker
      console.warn("[RoamGTD] Failed to leave breadcrumb after move", error);
    }
  }
}

export async function teleportBlockToProject(
  blockUid: string,
  projectBlockUid: string,
): Promise<void> {
  const todoListUid = await getOrCreateTodoListUid(projectBlockUid);
  await moveBlockWithBreadcrumb(blockUid, todoListUid);
}

export async function teleportBlockToWorkflowLocation(
  blockUid: string,
  workflowPageTitle: string,
  locationTag: string,
): Promise<void> {
  const workflowTitle = normalizeTagTitle(workflowPageTitle);
  const locationTitle = normalizeTagTitle(locationTag);
  if (!workflowTitle || !locationTitle) {
    return;
  }

  const workflowPageUid = await getOrCreatePageUid(workflowTitle);
  const todoListUid = await getOrCreateTodoListUid(workflowPageUid);
  const locationUid = await getOrCreateLocationBucketUid(todoListUid, locationTitle);
  await moveBlockWithBreadcrumb(blockUid, locationUid);
}

export async function createProjectFromTemplateAndTeleportTodo(
  blockUid: string,
  projectInput: string,
): Promise<{ projectUid: string; todoListUid: string }> {
  const projectTitle = normalizeProjectInput(projectInput);
  if (!projectTitle) {
    throw new Error("project title is required");
  }

  const todayTitle = formatRoamDate(new Date());
  const todayUid = await getOrCreatePageUid(todayTitle);
  const projectUid = window.roamAlphaAPI.util.generateUID();

  await window.roamAlphaAPI.createBlock({
    block: { string: `Project:: ${projectTitle}`, uid: projectUid },
    location: { order: "last", "parent-uid": todayUid },
  });

  const templateUid = findTemplateRootUid("project");
  const clonedTodoListUid = templateUid
    ? await cloneProjectTemplateChildren(templateUid, projectUid)
    : null;

  let todoListUid = clonedTodoListUid;
  if (!todoListUid) {
    todoListUid = window.roamAlphaAPI.util.generateUID();
    await window.roamAlphaAPI.createBlock({
      block: { string: "Todo List::", uid: todoListUid },
      location: { order: "last", "parent-uid": projectUid },
    });
  }

  await moveBlockWithBreadcrumb(blockUid, todoListUid);
  await window.roamAlphaAPI.updateBlock({
    block: { open: false, uid: projectUid },
  });
  return { projectUid, todoListUid };
}

export async function fetchActiveProjects(): Promise<Array<{ title: string; uid: string }>> {
  try {
    return await fetchStatusWorkflowProjects();
  } catch (error) {
    // eslint-disable-next-line no-console -- keep project picker resilient under query failures
    console.warn("[RoamGTD] Active project query failed", error);
    return [];
  }
}

export async function fetchAllProjects(): Promise<Array<{ title: string; uid: string }>> {
  try {
    return await fetchAllProjectBlocks();
  } catch (error) {
    // eslint-disable-next-line no-console -- keep project picker resilient under query failures
    console.warn("[RoamGTD] All project query failed", error);
    return [];
  }
}

function readBlockString(uid: string): string {
  const block = window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid]);
  const blockString = block?.[":block/string"];
  return typeof blockString === "string" ? blockString : "";
}

function isInactiveProjectStatusValue(value: string): boolean {
  return INACTIVE_PROJECT_STATUS_REGEX.test(value);
}

function stripInactiveProjectMarkers(value: string): string {
  return value.replaceAll(INACTIVE_PROJECT_INLINE_MARKER_REGEX, " ").replaceAll(/\s+/g, " ").trim();
}

export async function reactivateProjectStatusIfInactive(projectBlockUid: string): Promise<boolean> {
  const children = getOrderedChildren(projectBlockUid);
  const statusChild = children.find((child) =>
    child.string.trim().toLowerCase().startsWith("status::"),
  );
  const projectString = readBlockString(projectBlockUid);
  const statusValue = statusChild?.string.replace(/^Status::\s*/i, "").trim() ?? "";
  if (!isInactiveProjectStatusValue(projectString) && !isInactiveProjectStatusValue(statusValue)) {
    return false;
  }

  try {
    const sanitizedProjectString = stripInactiveProjectMarkers(projectString);
    if (sanitizedProjectString && sanitizedProjectString !== projectString) {
      await window.roamAlphaAPI.updateBlock({
        block: { string: sanitizedProjectString, uid: projectBlockUid },
      });
    }
    if (statusChild) {
      await window.roamAlphaAPI.updateBlock({
        block: { string: "Status:: #ON_TRACK", uid: statusChild.uid },
      });
      return true;
    }
    await window.roamAlphaAPI.createBlock({
      block: {
        string: "Status:: #ON_TRACK",
        uid: window.roamAlphaAPI.util.generateUID(),
      },
      location: { order: "last", "parent-uid": projectBlockUid },
    });
    return true;
  } catch {
    return false;
  }
}
