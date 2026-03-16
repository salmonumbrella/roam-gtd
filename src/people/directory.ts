import type { QueryRow } from "../data";
import { executeQuery, runRoamQuery } from "../data";
import { cloneChildrenFromTemplate } from "../graph-utils";
import { buildPeopleByRecencyQuery, buildPeopleQuery } from "../queries";
import { buildTagTitleCandidates, normalizeDelegateTarget, type PersonEntry } from "./text";

type TemplateRow = readonly [string, string, number];

const peopleCache = new Map<string, Promise<Array<PersonEntry>>>();

function isStringPair(row: QueryRow): row is readonly [string, string] {
  return row.length >= 2 && typeof row[0] === "string" && typeof row[1] === "string";
}

function isPersonWithRecencyRow(row: QueryRow): row is readonly [string, string, number] {
  return (
    row.length >= 3 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "number"
  );
}

function buildPeopleCacheKey(delegateTargetTags: Array<string>): string {
  return delegateTargetTags.map(normalizeDelegateTarget).filter(Boolean).sort().join("\n");
}

function isTemplateRow(row: ReadonlyArray<unknown>): row is TemplateRow {
  return (
    row.length >= 3 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "number"
  );
}

function buildDelegationTemplateTargetOrder(delegateTargetTags?: Array<string>): Array<string> {
  const targets = delegateTargetTags?.length ? delegateTargetTags : ["people", "agents"];
  const orderedTargets: Array<string> = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const normalized = normalizeDelegateTarget(target);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    orderedTargets.push(normalized);
  }
  return orderedTargets;
}

function findPeopleTemplateUid(delegateTargetTags?: Array<string>): string | null {
  const targetOrder = buildDelegationTemplateTargetOrder(delegateTargetTags);
  if (targetOrder.length === 0) {
    return null;
  }
  const rows = runRoamQuery(
    `[:find ?uid ?s ?order
      :where
        [?templates-page :node/title "roam/templates"]
        [?templates-page :block/children ?block]
        [?block :block/uid ?uid]
        [?block :block/string ?s]
        [?block :block/order ?order]]`,
  );
  const templates: Array<TemplateRow> = [];
  for (const row of rows) {
    if (isTemplateRow(row)) {
      templates.push(row);
    }
  }
  templates.sort((a, b) => a[2] - b[2]);
  const templateUidByName = new Map<string, string>();
  for (const [uid, name] of templates) {
    const normalizedName = normalizeDelegateTarget(name);
    if (!normalizedName || templateUidByName.has(normalizedName)) {
      continue;
    }
    templateUidByName.set(normalizedName, uid);
  }

  for (const target of targetOrder) {
    const templateUid = templateUidByName.get(target);
    if (templateUid) {
      return templateUid;
    }
  }
  return null;
}

export function resetPeopleCache(): void {
  peopleCache.clear();
}

export function sortPeopleEntries(people: Array<PersonEntry>): Array<PersonEntry> {
  return [...people].sort(
    (a, b) =>
      (b.lastInteractionTime ?? 0) - (a.lastInteractionTime ?? 0) || a.title.localeCompare(b.title),
  );
}

export async function fetchAllPeople(
  delegateTargetTags: Array<string>,
): Promise<Array<PersonEntry>> {
  const cacheKey = buildPeopleCacheKey(delegateTargetTags);
  const cached = peopleCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loadPromise = (async (): Promise<Array<PersonEntry>> => {
    const recentRows = await executeQuery(buildPeopleByRecencyQuery(delegateTargetTags));
    const recentPeople = recentRows.filter(isPersonWithRecencyRow).map((row) => ({
      lastInteractionTime: row[2],
      title: row[0],
      uid: row[1],
    }));

    if (recentPeople.length > 0) {
      return sortPeopleEntries(recentPeople);
    }

    const rows = await executeQuery(buildPeopleQuery(delegateTargetTags));
    return sortPeopleEntries(
      rows.filter(isStringPair).map((row) => ({
        title: row[0],
        uid: row[1],
      })),
    );
  })();

  peopleCache.set(cacheKey, loadPromise);
  try {
    return await loadPromise;
  } catch (error) {
    peopleCache.delete(cacheKey);
    throw error;
  }
}

export function pageHasTag(pageUid: string, tagTitle: string): boolean {
  if (!pageUid.trim() || !tagTitle.trim()) {
    return false;
  }
  const candidates = buildTagTitleCandidates(tagTitle);
  if (candidates.length === 0) {
    return false;
  }
  const rows = runRoamQuery(
    `[:find ?tag-block-uid
      :in $ ?page-uid [?tag-title ...]
      :where
        [?page :block/uid ?page-uid]
        [?tag-page :node/title ?tag-title]
        [?tag-block :block/page ?page]
        [?tag-block :block/refs ?tag-page]
        [?tag-block :block/uid ?tag-block-uid]]`,
    pageUid,
    candidates,
  );
  for (const row of rows) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      return true;
    }
  }
  return false;
}

export async function getOrCreatePersonPage(
  personTitle: string,
  delegateTargetTags?: Array<string>,
): Promise<PersonEntry> {
  const pageRows = runRoamQuery(
    `[:find ?uid
      :in $ ?title
      :where
        [?page :node/title ?title]
        [?page :block/uid ?uid]]`,
    personTitle,
  );
  let existingUid: string | undefined;
  for (const row of pageRows) {
    if (Array.isArray(row) && typeof row[0] === "string") {
      existingUid = row[0];
      break;
    }
  }
  if (existingUid) {
    return { title: personTitle, uid: existingUid };
  }

  const pageUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createPage({ page: { title: personTitle, uid: pageUid } });

  const templateUid = findPeopleTemplateUid(delegateTargetTags);
  if (templateUid) {
    await cloneChildrenFromTemplate(templateUid, pageUid);
  }

  resetPeopleCache();

  return { title: personTitle, uid: pageUid };
}
