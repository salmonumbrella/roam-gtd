import type { GtdSettings } from "../settings";
import type { TodoItem } from "../types";

export interface NextActionContextGroup {
  items: Array<TodoItem>;
  key: string;
  label: string;
}

const NO_CONTEXT_KEY = "__no_context__";
const HASH_TAG_RE = /#\[\[([^\]]+)\]\]|#([^\s.,!?;:)\]}]+)/gu;
const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
type ChildTagRow = readonly [number, string];

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function extractOrderedHashTags(blockString: string): Array<string> {
  if (!blockString) {
    return [];
  }
  const textWithoutCode = blockString.replace(FENCED_CODE_RE, " ").replace(INLINE_CODE_RE, " ");

  const tags: Array<string> = [];
  const seen = new Set<string>();
  for (const match of textWithoutCode.matchAll(HASH_TAG_RE)) {
    const rawTag = (match[1] ?? match[2] ?? "").trim();
    if (!rawTag) {
      continue;
    }
    const normalized = normalizeTag(rawTag);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tags.push(rawTag);
  }
  return tags;
}

function isChildTagRow(row: unknown): row is ChildTagRow {
  return (
    Array.isArray(row) &&
    row.length >= 2 &&
    typeof row[0] === "number" &&
    typeof row[1] === "string"
  );
}

function getContextTagsFromDirectChildren(uid: string): Array<string> {
  const queryFn =
    typeof window === "undefined"
      ? undefined
      : window.roamAlphaAPI?.data?.q?.bind(window.roamAlphaAPI.data);
  if (!queryFn) {
    return [];
  }

  const rows = queryFn(
    `[:find ?order ?child-string
      :in $ ?parent-uid
      :where
        [?parent :block/uid ?parent-uid]
        [?parent :block/children ?child]
        [?child :block/order ?order]
        [?child :block/string ?child-string]]`,
    uid,
  );

  const childTagRows: Array<ChildTagRow> = [];
  for (const row of rows as Array<unknown>) {
    if (isChildTagRow(row)) {
      childTagRows.push(row);
    }
  }

  return childTagRows.sort((a, b) => a[0] - b[0]).flatMap((row) => extractOrderedHashTags(row[1]));
}

export function groupNextActionsByContext(
  items: Array<TodoItem>,
  settings: GtdSettings,
): Array<NextActionContextGroup> {
  const workflowTags = new Set(
    [
      settings.tagNextAction,
      settings.tagWaitingFor,
      settings.tagDelegated,
      settings.tagSomeday,
    ].map(normalizeTag),
  );
  const groups = new Map<string, NextActionContextGroup>();

  for (const item of items) {
    const parentContextTags = extractOrderedHashTags(item.text).filter(
      (tag) => !workflowTags.has(normalizeTag(tag)),
    );
    const contextTags =
      parentContextTags.length > 0
        ? parentContextTags
        : getContextTagsFromDirectChildren(item.uid).filter(
            (tag) => !workflowTags.has(normalizeTag(tag)),
          );

    const primaryContext = contextTags[0] ?? "";
    const key = primaryContext ? normalizeTag(primaryContext) : NO_CONTEXT_KEY;

    let group = groups.get(key);
    if (!group) {
      group = {
        items: [],
        key,
        label: primaryContext,
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.key === NO_CONTEXT_KEY) {
      return 1;
    }
    if (b.key === NO_CONTEXT_KEY) {
      return -1;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function isNoContextGroup(group: NextActionContextGroup): boolean {
  return group.key === NO_CONTEXT_KEY;
}
