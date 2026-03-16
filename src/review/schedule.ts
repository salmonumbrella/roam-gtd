import type { ScheduleIntent } from "../components/SchedulePopover";
import { formatRoamDate, parseRoamDate } from "../date-utils";
import { formatCalendarEventSummary } from "../google-calendar";
import {
  createEvent,
  fetchEventsForDate,
  hasConflict,
  isGoogleCalendarAvailable,
  type ConflictResult,
} from "../google-calendar";
import { getOrderedChildren } from "../graph-utils";
import { setBlockViewType } from "../roam-ui-utils";

const DUE_DATE_ATTRIBUTE = "Due";
const SIDE_VIEW_TYPE = "side";
const HASH_TOKEN_RE = /#\[\[[^\]]+\]\]|#[A-Za-z0-9/_-]+/gu;

type OrderedChild = ReturnType<typeof getOrderedChildren>[number];

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
  existingChildren?: Array<OrderedChild>,
): Promise<Array<OrderedChild>> {
  const dueDateRef = normalizeDueDateReference(dueDateValue);
  if (!dueDateRef) {
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
  return [...children, { order: children.length, string: dueLine, uid: dueChildUid }];
}

export async function clearDueDateChild(
  uid: string,
  existingChildren?: Array<OrderedChild>,
): Promise<Array<OrderedChild>> {
  const children = existingChildren ?? getOrderedChildren(uid);
  const existingDueChild = children.find((child) =>
    child.string.trim().toLowerCase().startsWith(`${DUE_DATE_ATTRIBUTE.toLowerCase()}::`),
  );
  if (!existingDueChild) {
    return children;
  }

  const tags = extractHashTagTokens(existingDueChild.string);
  if (tags.length > 0) {
    const nextString = tags.join(" ");
    await window.roamAlphaAPI.updateBlock({
      block: { string: nextString, uid: existingDueChild.uid },
    });
    return children.map((child) =>
      child.uid === existingDueChild.uid ? { ...child, string: nextString } : child,
    );
  }

  await window.roamAlphaAPI.deleteBlock({ block: { uid: existingDueChild.uid } });
  return children.filter((child) => child.uid !== existingDueChild.uid);
}

export async function checkScheduleConflict(
  intent: ScheduleIntent,
): Promise<ConflictResult | null> {
  if (!intent.time || !isGoogleCalendarAvailable()) {
    return null;
  }
  try {
    const events = await fetchEventsForDate(intent.roamDate);
    return hasConflict(events, intent.date, 10);
  } catch {
    return null;
  }
}

export async function applyScheduleIntentToBlock(
  uid: string,
  intent: ScheduleIntent,
  onGoogleCalendarUnavailable?: () => void,
): Promise<void> {
  const sourceText =
    window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid])?.[":block/string"] ?? "";
  await upsertDueDateChild(uid, intent.roamDate);
  if (!intent.time || !isGoogleCalendarAvailable()) {
    return;
  }
  try {
    await createEvent(
      formatCalendarEventSummary(sourceText),
      uid,
      intent.date,
      10,
      intent.googleCalendarAccount,
    );
  } catch {
    onGoogleCalendarUnavailable?.();
  }
}
