import { runRoamQuery, type QueryRow } from "./data";

type ChildRow = readonly [string, string, number];

export function isChildRow(row: QueryRow): row is ChildRow {
  return (
    row.length >= 3 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "number"
  );
}

export function runQuerySync(query: string, ...inputs: Array<string>): Array<QueryRow> {
  const rows = runRoamQuery(query, ...inputs);
  const normalized: Array<QueryRow> = [];
  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue;
    }
    const values = row.filter(
      (value): value is string | number => typeof value === "string" || typeof value === "number",
    );
    normalized.push(values);
  }
  return normalized;
}

export function isSingleStringRow(row: QueryRow): row is readonly [string] {
  return row.length >= 1 && typeof row[0] === "string";
}

export function getOrderedChildren(
  parentUid: string,
): Array<{ order: number; string: string; uid: string }> {
  const rows = runQuerySync(
    `[:find ?child-uid ?child-string ?order
      :in $ ?parent-uid
      :where
        [?parent :block/uid ?parent-uid]
        [?parent :block/children ?child]
        [?child :block/uid ?child-uid]
        [?child :block/string ?child-string]
        [?child :block/order ?order]]`,
    parentUid,
  );
  return rows
    .filter(isChildRow)
    .sort((a, b) => a[2] - b[2])
    .map((row) => ({ order: row[2], string: row[1], uid: row[0] }));
}

export function getPageUidByTitle(title: string): string | null {
  const rows = runQuerySync(
    `[:find ?uid
      :in $ ?title
      :where
        [?page :node/title ?title]
        [?page :block/uid ?uid]]`,
    title,
  );
  const first = rows.find(isSingleStringRow);
  return first?.[0] ?? null;
}

export async function cloneChildrenFromTemplate(
  sourceParentUid: string,
  targetParentUid: string,
): Promise<void> {
  const children = getOrderedChildren(sourceParentUid);
  for (const child of children) {
    const newUid = window.roamAlphaAPI.util.generateUID();
    await window.roamAlphaAPI.createBlock({
      block: { string: child.string, uid: newUid },
      location: { order: "last", "parent-uid": targetParentUid },
    });
    await cloneChildrenFromTemplate(child.uid, newUid);
  }
}

export async function getOrCreatePageUid(title: string): Promise<string> {
  const existingUid = getPageUidByTitle(title);
  if (existingUid) {
    return existingUid;
  }

  const pageUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createPage({ page: { title, uid: pageUid } });
  return pageUid;
}
