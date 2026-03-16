import { executeQuery, type QueryRow } from "../../data";
import { parseRoamDate } from "../../date-utils";

const DUE_OR_REMINDER_ATTRIBUTE_REGEX = /^(?:\*\*|__)?\s*(?:Due|Reminder)\s*::\s*(.+)$/iu;
const PAGE_REF_REGEX = /\[\[([^\]]+)\]\]/u;

type DailyNoteTitleRow = readonly [string];
type ScheduledChildRow = readonly [string, string, string, string, number];

export type ScheduledChildrenByParent = Map<
  string,
  { childUidsByDayKey: Map<string, Array<string>>; parentString: string }
>;

function isDailyNoteTitleRow(row: QueryRow): row is DailyNoteTitleRow {
  return row.length >= 1 && typeof row[0] === "string";
}

function isScheduledChildRow(row: QueryRow): row is ScheduledChildRow {
  return (
    row.length >= 5 &&
    typeof row[0] === "string" &&
    typeof row[1] === "string" &&
    typeof row[2] === "string" &&
    typeof row[3] === "string" &&
    typeof row[4] === "number"
  );
}

export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDueOrReminderAttributeString(value: string): boolean {
  return DUE_OR_REMINDER_ATTRIBUTE_REGEX.test(value.trim());
}

export function parseDueOrReminderDateKeyFromChildString(
  value: string,
  dailyNoteTitles: ReadonlySet<string>,
): string | null {
  const match = value.trim().match(DUE_OR_REMINDER_ATTRIBUTE_REGEX);
  if (!match) {
    return null;
  }
  const attributeValue = match[1]?.trim() ?? "";
  if (!attributeValue) {
    return null;
  }
  const pageRefMatch = attributeValue.match(PAGE_REF_REGEX);
  if (pageRefMatch?.[1]) {
    const pageTitle = pageRefMatch[1].trim();
    if (!dailyNoteTitles.has(pageTitle)) {
      return null;
    }
    const pageDate = parseRoamDate(pageTitle);
    return pageDate ? toDayKey(pageDate) : null;
  }
  const plainDate = attributeValue.split(/\s+#/u, 1)[0]?.trim() ?? "";
  if (!plainDate) {
    return null;
  }
  const parsedDate = parseRoamDate(plainDate);
  return parsedDate ? toDayKey(parsedDate) : null;
}

async function fetchDailyNoteTitles(titles: Array<string>): Promise<Set<string>> {
  const uniqueTitles = [...new Set(titles.map((title) => title.trim()).filter(Boolean))];
  if (uniqueTitles.length === 0) {
    return new Set();
  }
  const rows = await executeQuery({
    inputs: [uniqueTitles],
    query: `[:find ?title
      :in $ [?title ...]
      :where
        [?page :node/title ?title]
        [?page :log/id _]]`,
  });
  return new Set(rows.filter(isDailyNoteTitleRow).map((row) => row[0]));
}

export async function fetchScheduledChildrenByParent(): Promise<ScheduledChildrenByParent> {
  const rows = await executeQuery({
    inputs: [],
    query: `[:find ?parent-uid ?parent-string ?child-uid ?child-string ?order
      :where
        [?parent :block/children ?child]
        [?parent :block/uid ?parent-uid]
        [?parent :block/string ?parent-string]
        [?child :block/uid ?child-uid]
        [?child :block/string ?child-string]
        [?child :block/order ?order]
        [(re-pattern "(?i)^(?:\\\\*\\\\*|__)?\\\\s*(?:Due|Reminder)\\\\s*::") ?rp]
        [(re-find ?rp ?child-string)]]`,
  });

  const candidateRows = rows.filter(isScheduledChildRow);
  if (candidateRows.length === 0) {
    return new Map();
  }

  const dailyNoteTitles = await fetchDailyNoteTitles(
    candidateRows.map((row) => row[3].match(PAGE_REF_REGEX)?.[1]?.trim() ?? "").filter(Boolean),
  );
  const grouped: ScheduledChildrenByParent = new Map();

  for (const row of candidateRows.sort((left, right) => left[4] - right[4])) {
    const [parentUid, parentString, childUid, childString] = row;
    const dayKey = parseDueOrReminderDateKeyFromChildString(childString, dailyNoteTitles);
    if (!dayKey) {
      continue;
    }
    const existing = grouped.get(parentUid);
    if (existing) {
      const existingChildren = existing.childUidsByDayKey.get(dayKey) ?? [];
      if (!existingChildren.includes(childUid)) {
        existingChildren.push(childUid);
        existing.childUidsByDayKey.set(dayKey, existingChildren);
      }
      continue;
    }
    grouped.set(parentUid, {
      childUidsByDayKey: new Map([[dayKey, [childUid]]]),
      parentString,
    });
  }

  return grouped;
}

export function filterScheduledChildrenForDay(
  scheduledChildrenByParent: ScheduledChildrenByParent,
  pageTitle: string,
): Map<string, { childUids: Array<string>; parentString: string }> {
  const targetPageDate = parseRoamDate(pageTitle);
  if (!targetPageDate) {
    return new Map();
  }

  const targetDayKey = toDayKey(targetPageDate);
  const matching = new Map<string, { childUids: Array<string>; parentString: string }>();
  for (const [parentUid, entry] of scheduledChildrenByParent.entries()) {
    const childUids = entry.childUidsByDayKey.get(targetDayKey);
    if (!childUids || childUids.length === 0) {
      continue;
    }
    matching.set(parentUid, { childUids: [...childUids], parentString: entry.parentString });
  }
  return matching;
}
