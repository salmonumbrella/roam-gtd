import { runRoamQuery } from "../data";
import { getOrderedChildren } from "../graph-utils";
import { setBlockViewType as applyBlockViewType } from "../roam-ui-utils";
import { matchOptionalTaskBlockRef } from "../task-text";

const BLOCK_REF_RE = /^\(\(([A-Za-z0-9_-]+)\)\)$/u;
const DUE_ATTRIBUTE_PREFIX = "due::";
const EMBED_MACRO = "{{[[embed]]:";
const OUTLINE_VIEW_TYPE = "outline";
const SIDE_VIEW_TYPE = "side";

export function findAgendaBlockUid(personPageTitle: string): string | null {
  const rows = runRoamQuery(
    `[:find ?uid
      :in $ ?page-title ?prefix
      :where
        [?page :node/title ?page-title]
        [?block :block/page ?page]
        [?block :block/string ?s]
        [(clojure.string/starts-with? ?s ?prefix)]
        [?block :block/uid ?uid]]`,
    personPageTitle,
    "Agenda::",
  );

  for (const row of rows) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      return row[0];
    }
  }

  return null;
}

export async function findOrCreateAgendaBlock(personPageTitle: string): Promise<string> {
  const existing = findAgendaBlockUid(personPageTitle);
  if (existing) {
    return existing;
  }

  const pageRows = runRoamQuery(
    `[:find ?uid
      :in $ ?title
      :where
        [?page :node/title ?title]
        [?page :block/uid ?uid]]`,
    personPageTitle,
  );
  let pageUid: string | undefined;
  for (const row of pageRows) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      pageUid = row[0];
      break;
    }
  }
  if (!pageUid) {
    throw new Error(`Page not found: ${personPageTitle}`);
  }

  const newUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    block: { string: "Agenda::", uid: newUid },
    location: { order: "last", "parent-uid": pageUid },
  });

  return newUid;
}

function getReferencedUid(text: string): string | null {
  return text.match(BLOCK_REF_RE)?.[1] ?? null;
}

function getBlockParentUid(uid: string): string | null {
  const rows = runRoamQuery(
    `[:find ?parent-uid
      :in $ ?uid
      :where
        [?block :block/uid ?uid]
        [?block :block/parents ?parent]
        [?parent :block/uid ?parent-uid]]`,
    uid,
  );
  for (const row of rows) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      return row[0];
    }
  }
  return null;
}

function getBlockViewType(uid: string): string | null {
  const rows = runRoamQuery(
    `[:find ?view-str
      :in $ ?uid
      :where
        [?block :block/uid ?uid]
        [?block :block/view-type ?view]
        [(str ?view) ?view-str]]`,
    uid,
  );
  for (const row of rows) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      return row[0].replace(/^:/u, "").trim() || null;
    }
  }
  return null;
}

async function setBlockViewType(
  uid: string,
  viewType: typeof OUTLINE_VIEW_TYPE | typeof SIDE_VIEW_TYPE,
): Promise<void> {
  if (getBlockViewType(uid) === viewType) {
    return;
  }
  await applyBlockViewType(uid, viewType);
}

function isAgendaSourceEntry(value: string, sourceRef: string, embedRef: string): boolean {
  if (value === sourceRef || value === embedRef) {
    return true;
  }
  return (
    value.includes(sourceRef) &&
    (matchOptionalTaskBlockRef(value)?.uid === sourceRef.slice(2, -2) ||
      value.includes(EMBED_MACRO))
  );
}

async function createAgendaEntry(
  sourceBlockUid: string,
  personPageTitle: string,
  asEmbed: boolean,
): Promise<void> {
  const agendaUid = await findOrCreateAgendaBlock(personPageTitle);
  const sourceRef = `((${sourceBlockUid}))`;
  const embedRef = `${EMBED_MACRO} ((${sourceRef}))}}`;
  const existingAgendaEntry = getOrderedChildren(agendaUid).find((child) => {
    const value = child.string.trim();
    if (value === sourceRef || value === embedRef) {
      return true;
    }
    return isAgendaSourceEntry(value, sourceRef, embedRef);
  });
  if (existingAgendaEntry) {
    return;
  }

  await window.roamAlphaAPI.createBlock({
    block: { string: asEmbed ? embedRef : sourceRef },
    location: { order: 0, "parent-uid": agendaUid },
  });
}

async function findOrCreateDelegatedAgendaParent(
  agendaUid: string,
  sourceBlockUid: string,
): Promise<string> {
  const sourceRef = `((${sourceBlockUid}))`;
  const embedRef = `${EMBED_MACRO} ((${sourceRef}))}}`;
  const matchingEntries = getOrderedChildren(agendaUid).filter((child) =>
    isAgendaSourceEntry(child.string.trim(), sourceRef, embedRef),
  );

  const plainEntry = matchingEntries.find((child) => child.string.trim() === sourceRef);
  if (plainEntry) {
    return plainEntry.uid;
  }

  const legacyEntry = matchingEntries[0];
  if (legacyEntry) {
    if (legacyEntry.string.trim() !== sourceRef) {
      await window.roamAlphaAPI.updateBlock({
        block: { string: sourceRef, uid: legacyEntry.uid },
      });
    }
    return legacyEntry.uid;
  }

  const parentUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    block: { string: sourceRef, uid: parentUid },
    location: { order: 0, "parent-uid": agendaUid },
  });
  return parentUid;
}

export async function createAgendaTodo(
  sourceBlockUid: string,
  personPageTitle: string,
): Promise<void> {
  return createAgendaEntry(sourceBlockUid, personPageTitle, false);
}

export async function createAgendaReference(
  sourceBlockUid: string,
  personPageTitle: string,
): Promise<void> {
  return createAgendaEntry(sourceBlockUid, personPageTitle, false);
}

export async function syncDelegatedAgendaEntry(
  sourceBlockUid: string,
  personPageTitle: string,
): Promise<void> {
  const agendaUid = await findOrCreateAgendaBlock(personPageTitle);
  const agendaParentUid = await findOrCreateDelegatedAgendaParent(agendaUid, sourceBlockUid);
  const sourceChildren = getOrderedChildren(sourceBlockUid);
  const sourceChildUidSet = new Set(sourceChildren.map((child) => child.uid));
  const dueChildUid =
    sourceChildren.find((child) =>
      child.string.trim().toLowerCase().startsWith(DUE_ATTRIBUTE_PREFIX),
    )?.uid ?? null;
  const agendaChildren = getOrderedChildren(agendaParentUid);
  const nestedRefs = agendaChildren
    .map((child) => ({ child, referencedUid: getReferencedUid(child.string.trim()) }))
    .filter(
      (candidate): candidate is { child: (typeof agendaChildren)[number]; referencedUid: string } =>
        typeof candidate.referencedUid === "string",
    );

  for (const { child, referencedUid } of nestedRefs) {
    const pointsToCurrentDueChild = dueChildUid != null && referencedUid === dueChildUid;
    if (pointsToCurrentDueChild) {
      continue;
    }
    const pointsToSourceChild = sourceChildUidSet.has(referencedUid);
    const referencedParentUid = pointsToSourceChild
      ? sourceBlockUid
      : getBlockParentUid(referencedUid);
    const shouldDelete = referencedParentUid == null || referencedParentUid === sourceBlockUid;
    if (!shouldDelete) {
      continue;
    }
    await window.roamAlphaAPI.deleteBlock({ block: { uid: child.uid } });
  }

  if (dueChildUid) {
    const dueRef = `((${dueChildUid}))`;
    const alreadyNested = nestedRefs.some(({ referencedUid }) => referencedUid === dueChildUid);
    if (!alreadyNested) {
      const nestedUid = window.roamAlphaAPI.util.generateUID();
      await window.roamAlphaAPI.createBlock({
        block: { string: dueRef, uid: nestedUid },
        location: { order: 0, "parent-uid": agendaParentUid },
      });
    }
    await setBlockViewType(agendaParentUid, SIDE_VIEW_TYPE);
    return;
  }

  await setBlockViewType(agendaParentUid, OUTLINE_VIEW_TYPE);
}
