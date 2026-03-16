import { formatRoamDate, parseRoamDate } from "../date-utils";
import { getOrderedChildren } from "../graph-utils";
import { setBlockViewType } from "../roam-ui-utils";

export const DUE_DATE_ATTRIBUTE = "Due";
const SIDE_VIEW_TYPE = "side";
const HASH_TOKEN_RE = /#\[\[[^\]]+\]\]|#[A-Za-z0-9/_-]+/gu;
const TAG_TOKEN_BOUNDARY = String.raw`(?=$|\s|[.,!?;:)\]}])`;

export type OrderedChild = ReturnType<typeof getOrderedChildren>[number];

function normalizeDueDateReference(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const bracketMatch = trimmed.match(/^\[\[(.+)\]\]$/u);
  if (bracketMatch?.[1]) {
    return `[[${bracketMatch[1].trim()}]]`;
  }
  const parsed = parseRoamDate(trimmed);
  if (parsed) {
    return `[[${formatRoamDate(parsed)}]]`;
  }
  return `[[${trimmed}]]`;
}

function escapeTagTokenForRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function extractHashTagTokens(value: string): Array<string> {
  if (!value) {
    return [];
  }
  const matches = value.match(HASH_TOKEN_RE) ?? [];
  const deduped: Array<string> = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const token = match.trim();
    if (!token) {
      continue;
    }
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(token);
  }
  return deduped;
}

function buildDueLineWithExistingTags(dueDateRef: string, source: string): string {
  const dueLine = `${DUE_DATE_ATTRIBUTE}:: ${dueDateRef}`;
  const tags = extractHashTagTokens(source);
  if (!tags.length) {
    return dueLine;
  }
  return `${dueLine} ${tags.join(" ")}`;
}

function extractDueDateValueFromDueLine(source: string): string | null {
  const match = source.trim().match(new RegExp(`^${DUE_DATE_ATTRIBUTE}::\\s*(.+)$`, "iu"));
  if (!match?.[1]) {
    return null;
  }
  const withoutTags = match[1].replaceAll(HASH_TOKEN_RE, " ").replaceAll(/\s+/gu, " ").trim();
  if (!withoutTags) {
    return null;
  }
  const bracketMatch = withoutTags.match(/^\[\[(.+)\]\]$/u);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim();
  }
  return withoutTags;
}

function childContainsContextTag(childString: string, contextTitle: string): boolean {
  const normalizedTitle = contextTitle.trim();
  if (!normalizedTitle || !childString) {
    return false;
  }
  const escapedTitle = escapeTagTokenForRegex(normalizedTitle);
  const bracketedPattern = new RegExp(`#\\[\\[${escapedTitle}\\]\\]${TAG_TOKEN_BOUNDARY}`, "iu");
  if (bracketedPattern.test(childString)) {
    return true;
  }
  if (/\s/u.test(normalizedTitle)) {
    return false;
  }
  const simplePattern = new RegExp(`#${escapedTitle}${TAG_TOKEN_BOUNDARY}`, "iu");
  return simplePattern.test(childString);
}

export function getCurrentDueDateValue(uid: string): string {
  const children = getOrderedChildren(uid);
  const existingDueChild = children.find((child) =>
    child.string.trim().toLowerCase().startsWith(`${DUE_DATE_ATTRIBUTE.toLowerCase()}::`),
  );
  if (!existingDueChild) {
    return "";
  }
  return extractDueDateValueFromDueLine(existingDueChild.string) ?? "";
}

export async function upsertDueDateChild(
  uid: string,
  dueDateValue: string,
  onPersistedDueDateChange?: (uid: string, value: string) => void,
  existingChildren?: Array<OrderedChild>,
): Promise<Array<OrderedChild>> {
  const dueDateRef = normalizeDueDateReference(dueDateValue);
  if (!dueDateRef) {
    onPersistedDueDateChange?.(uid, "");
    return existingChildren ?? getOrderedChildren(uid);
  }
  const children = existingChildren ?? getOrderedChildren(uid);
  const existingDueChild = children.find((child) =>
    child.string.trim().toLowerCase().startsWith(`${DUE_DATE_ATTRIBUTE.toLowerCase()}::`),
  );
  if (existingDueChild) {
    const mergedDueLine = buildDueLineWithExistingTags(dueDateRef, existingDueChild.string);
    await window.roamAlphaAPI.updateBlock({
      block: { string: mergedDueLine, uid: existingDueChild.uid },
    });
    await setBlockViewType(existingDueChild.uid, SIDE_VIEW_TYPE);
    onPersistedDueDateChange?.(uid, extractDueDateValueFromDueLine(mergedDueLine) ?? "");
    return children.map((child) =>
      child.uid === existingDueChild.uid ? { ...child, string: mergedDueLine } : child,
    );
  }

  const dueLine = `${DUE_DATE_ATTRIBUTE}:: ${dueDateRef}`;
  const dueChildUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    block: { string: dueLine, uid: dueChildUid },
    location: { order: "last", "parent-uid": uid },
  });
  await setBlockViewType(dueChildUid, SIDE_VIEW_TYPE);
  onPersistedDueDateChange?.(uid, dueDateValue.trim());
  return [...children, { order: children.length, string: dueLine, uid: dueChildUid }];
}

export async function clearDueDateChild(
  uid: string,
  onPersistedDueDateChange?: (uid: string, value: string) => void,
  existingChildren?: Array<OrderedChild>,
): Promise<Array<OrderedChild>> {
  const children = existingChildren ?? getOrderedChildren(uid);
  const existingDueChild = children.find((child) =>
    child.string.trim().toLowerCase().startsWith(`${DUE_DATE_ATTRIBUTE.toLowerCase()}::`),
  );
  if (!existingDueChild) {
    onPersistedDueDateChange?.(uid, "");
    return children;
  }

  const tags = extractHashTagTokens(existingDueChild.string);
  if (tags.length > 0) {
    const nextString = tags.join(" ");
    await window.roamAlphaAPI.updateBlock({
      block: { string: nextString, uid: existingDueChild.uid },
    });
    onPersistedDueDateChange?.(uid, "");
    return children.map((child) =>
      child.uid === existingDueChild.uid ? { ...child, string: nextString } : child,
    );
  }

  await window.roamAlphaAPI.deleteBlock({ block: { uid: existingDueChild.uid } });
  onPersistedDueDateChange?.(uid, "");
  return children.filter((child) => child.uid !== existingDueChild.uid);
}

export async function upsertContextChild(
  uid: string,
  contextValue: string,
  onPersistedDueDateChange?: (uid: string, value: string) => void,
  existingChildren?: Array<OrderedChild>,
): Promise<Array<OrderedChild>> {
  const contextTitle = contextValue.trim();
  if (!contextTitle) {
    return existingChildren ?? getOrderedChildren(uid);
  }
  const contextTag = `#[[${contextTitle}]]`;
  const children = existingChildren ?? getOrderedChildren(uid);
  const existingDueChild = children.find((child) =>
    child.string.trim().toLowerCase().startsWith(`${DUE_DATE_ATTRIBUTE.toLowerCase()}::`),
  );

  if (existingDueChild) {
    const dueHasContext = childContainsContextTag(existingDueChild.string, contextTitle);
    if (!dueHasContext) {
      const nextDueLine = `${existingDueChild.string.trimEnd()} ${contextTag}`.replaceAll(
        /\s+/gu,
        " ",
      );
      await window.roamAlphaAPI.updateBlock({
        block: { string: nextDueLine, uid: existingDueChild.uid },
      });
      onPersistedDueDateChange?.(uid, extractDueDateValueFromDueLine(nextDueLine) ?? "");
    }
    await setBlockViewType(existingDueChild.uid, SIDE_VIEW_TYPE);

    const contextOnlyChildren = children.filter((child) => {
      if (child.uid === existingDueChild.uid) {
        return false;
      }
      return child.string.trim() === contextTag;
    });
    for (const child of contextOnlyChildren) {
      await window.roamAlphaAPI.deleteBlock({ block: { uid: child.uid } });
    }
    return children
      .filter(
        (child) => !contextOnlyChildren.some((contextChild) => contextChild.uid === child.uid),
      )
      .map((child) => {
        if (child.uid !== existingDueChild.uid || dueHasContext) {
          return child;
        }
        return {
          ...child,
          string: `${existingDueChild.string.trimEnd()} ${contextTag}`.replaceAll(/\s+/gu, " "),
        };
      });
  }

  const existingContextChild = children.find((child) =>
    childContainsContextTag(child.string, contextTitle),
  );
  if (existingContextChild) {
    return children;
  }
  const contextChildUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    block: { string: contextTag, uid: contextChildUid },
    location: { order: 0, "parent-uid": uid },
  });
  return [{ order: 0, string: contextTag, uid: contextChildUid }, ...children];
}
