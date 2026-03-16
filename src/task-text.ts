export type TaskMarker = "todo" | "done" | "archived";

const TASK_MARKER_SOURCE = "TODO|DONE|ARCHIVED";
const SINGLE_TASK_MARKER_SOURCE = String.raw`(?:\{\{\s*(?:\[\[\s*)?(TODO|DONE|ARCHIVED)(?:\s*\]\])?\s*\}\}|\[\[\s*(TODO|DONE|ARCHIVED)\s*\]\]|(TODO|DONE|ARCHIVED)\b)`;
const LEADING_TASK_MARKER_REGEX = new RegExp(
  String.raw`^\s*(?:-\s*)?${SINGLE_TASK_MARKER_SOURCE}`,
  "iu",
);
const LEADING_TASK_MARKER_REGION_REGEX = new RegExp(
  String.raw`^(?:\s*(?:-\s*)?${SINGLE_TASK_MARKER_SOURCE}\s*)+`,
  "iu",
);
const TASK_STATUS_MACRO_REGEX = /\{\{\s*(?:\[\[\s*)?(TODO|DONE|ARCHIVED)(?:\s*\]\])?\s*\}\}/giu;
const CLOSED_TASK_MARKER_REGEX =
  /(?:\{\{\s*(?:\[\[\s*)?(DONE|ARCHIVED)(?:\s*\]\])?\s*\}\}|\[\[\s*(DONE|ARCHIVED)\s*\]\])/iu;
const CLOSED_TASK_PREFIX_REGEX = /^\s*(?:-\s*)?(DONE|ARCHIVED)\b/iu;
const BLOCK_REF_ONLY_REGEX = /^\(\(([A-Za-z0-9_-]+)\)\)$/u;
const CANONICAL_TASK_MARKER_BY_TYPE: Record<TaskMarker, string> = {
  archived: "{{[[ARCHIVED]]}}",
  done: "{{[[DONE]]}}",
  todo: "{{[[TODO]]}}",
};

function normalizeTaskMarker(value: string | undefined): TaskMarker | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "todo" || normalized === "done" || normalized === "archived") {
    return normalized;
  }
  return null;
}

export function parseTaskMarker(text: string): TaskMarker | null {
  const match = text.match(LEADING_TASK_MARKER_REGEX);
  return normalizeTaskMarker(match?.[1] ?? match?.[2] ?? match?.[3]);
}

export function hasTodoMarker(text: string): boolean {
  return parseTaskMarker(text) === "todo";
}

export function hasClosedTaskMarker(text: string): boolean {
  const marker = parseTaskMarker(text);
  return marker === "done" || marker === "archived";
}

export function hasDoneOrArchivedMarker(text: string): boolean {
  return CLOSED_TASK_MARKER_REGEX.test(text) || CLOSED_TASK_PREFIX_REGEX.test(text);
}

export function isOpenTaskText(text: string): boolean {
  return hasTodoMarker(text) && !hasDoneOrArchivedMarker(text);
}

export function canonicalTaskMarker(marker: TaskMarker): string {
  return CANONICAL_TASK_MARKER_BY_TYPE[marker];
}

export function stripTaskMarker(text: string): string {
  return text.replace(LEADING_TASK_MARKER_REGION_REGEX, "").trimStart();
}

export function stripTaskStatusMacros(
  text: string,
  options: { includeArchived?: boolean } = {},
): string {
  const includeArchived = options.includeArchived ?? true;
  return text
    .replace(TASK_STATUS_MACRO_REGEX, (match, rawMarker: string) => {
      const marker = normalizeTaskMarker(rawMarker);
      if (!includeArchived && marker === "archived") {
        return match;
      }
      return marker ? "" : match;
    })
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

export function prependTaskMarker(text: string, marker: TaskMarker): string {
  const trimmed = text.trimStart();
  const canonical = canonicalTaskMarker(marker);
  return trimmed ? `${canonical} ${trimmed}` : canonical;
}

export function replaceTaskMarker(text: string, marker: TaskMarker): string {
  return prependTaskMarker(stripTaskMarker(text), marker);
}

export function canonicalizeTaskText(text: string): string {
  const marker = parseTaskMarker(text);
  return marker ? replaceTaskMarker(text, marker) : text;
}

export function matchBlockRefOnly(text: string): { uid: string } | null {
  const match = text.trim().match(BLOCK_REF_ONLY_REGEX);
  return match?.[1] ? { uid: match[1] } : null;
}

export function matchOptionalTaskBlockRef(
  text: string,
): { marker: TaskMarker | null; uid: string } | null {
  const marker = parseTaskMarker(text);
  const candidate = marker ? stripTaskMarker(text) : text.trim();
  const match = matchBlockRefOnly(candidate);
  return match ? { marker, uid: match.uid } : null;
}

export function isGeneratedTaskBlockRefOnly(text: string): boolean {
  const match = matchOptionalTaskBlockRef(text);
  return match?.marker === "todo";
}

export function stripLeadingTaskMarkers(text: string): string {
  return stripTaskMarker(text);
}

export function hasTaskMarker(text: string): boolean {
  return parseTaskMarker(text) !== null;
}

export function isSupportedTaskMarkerText(text: string): boolean {
  return new RegExp(TASK_MARKER_SOURCE, "iu").test(text);
}
