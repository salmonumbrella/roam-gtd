import { stripTaskMarker } from "./task-text";

export interface CalendarEvent {
  end: { date?: string; dateTime?: string };
  start: { date?: string; dateTime?: string };
  summary: string;
}

interface CalendarFetchResult {
  event: CalendarEvent;
}

export interface ConflictResult {
  endTime: string;
  eventName: string;
  startTime: string;
}

interface GoogleOauthRecord {
  access_token: string;
  expires_in: number;
  node?: { time?: string };
  refresh_token: string;
}

interface GoogleLinkedCalendarSetting {
  account: string;
  calendar: string;
}

export interface GoogleCalendarAccountOption {
  account: string;
  label: string;
}

interface GoogleConfigNode {
  children?: Array<GoogleConfigNode>;
  text: string;
}

type BlockReferenceResolver = (uid: string) => string | null;

const DATALOG_QUERY_LINE_REGEX = /^\s*(?:-\s*|\d+\.\s*)?:q\b/iu;
const QUERY_MACRO_REGEX = /\{\{\s*(?:\[\[\s*query\s*\]\]\s*:|query\s*:)[\s\S]*?\}\}+/giu;
const FENCED_CODE_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~/gu;
const UNCLOSED_FENCE_START_REGEX = /(?:```|~~~)[\s\S]*$/u;
const ROAM_COMMAND_REGEX = /\{\{[^{}]*\}\}/gu;
const MARKDOWN_LINK_TO_ROAM_REF_REGEX = /\[([^\]]+)\]\((\[\[[^\]]+\]\]|\(\([^)]+\)\))\)/gu;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gu;
const HASHTAG_TOKEN_REGEX =
  /(^|[\s(])(?:#\[\[[^\]]+\]\]|#\(\([^)]+\)\)|#[^\s#()[\]{}.,;:!?]+)(?=$|[\s),.;:!?])/gu;
const BLOCK_REFERENCE_UID_REGEX = /\(\(([A-Za-z0-9_-]{9})\)\)/gu;
const PAGE_REFERENCE_REGEX = /\[\[[^\]]+\]\]/gu;
const BLOCK_REFERENCE_REGEX = /\(\([^)]+\)\)/gu;
const WHITESPACE_REGEX = /\s+/gu;

function isCalendarFetchResult(value: unknown): value is CalendarFetchResult {
  return Boolean(
    value &&
    typeof value === "object" &&
    "event" in (value as Record<string, unknown>) &&
    typeof (value as { event?: unknown }).event === "object",
  );
}

/**
 * Check whether the RoamJS Google Calendar extension is installed and authenticated.
 */
export function isGoogleCalendarAvailable(): boolean {
  return typeof window.roamjs?.extension?.google?.fetchGoogleCalendar === "function";
}

/**
 * Fetch Google Calendar events for a single day using the RoamJS Google extension.
 */
export async function fetchEventsForDate(roamDateTitle: string): Promise<Array<CalendarEvent>> {
  const fetchGoogleCalendar = window.roamjs?.extension?.google?.fetchGoogleCalendar;
  if (typeof fetchGoogleCalendar !== "function") {
    return [];
  }

  const results = await fetchGoogleCalendar({
    endDatePageTitle: roamDateTitle,
    startDatePageTitle: roamDateTitle,
  });

  return (results ?? [])
    .filter(isCalendarFetchResult)
    .map((result: CalendarFetchResult) => result.event);
}

/**
 * Check if a proposed time slot conflicts with existing events.
 */
export function hasConflict(
  events: Array<CalendarEvent>,
  startTime: Date,
  durationMinutes: number,
): ConflictResult | null {
  const newStart = startTime.getTime();
  const newEnd = newStart + durationMinutes * 60_000;

  for (const event of events) {
    const eventStartString =
      event.start.dateTime ?? (event.start.date ? `${event.start.date}T00:00:00` : undefined);
    const eventEndString =
      event.end.dateTime ?? (event.end.date ? `${event.end.date}T00:00:00` : undefined);
    if (!eventStartString || !eventEndString) {
      continue;
    }

    const eventStart = new Date(eventStartString).getTime();
    const eventEnd = new Date(eventEndString).getTime();
    if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) {
      continue;
    }

    if (newStart < eventEnd && newEnd > eventStart) {
      return {
        endTime: eventEndString,
        eventName: event.summary ?? "(No title)",
        startTime: eventStartString,
      };
    }
  }

  return null;
}

function defaultResolveBlockReference(uid: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const pulled = window.roamAlphaAPI?.data?.pull("[:block/string]", [":block/uid", uid]);
    const value = pulled?.[":block/string"];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parses linked-calendar values from RoamJS Google settings.
 * Accepts raw strings, object arrays, or nested `calendars` payload shapes.
 */
export function parseGoogleLinkedCalendars(value: unknown): Array<GoogleLinkedCalendarSetting> {
  if (Array.isArray(value)) {
    return value.flatMap(parseGoogleLinkedCalendars);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    const looksJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));
    if (!looksJson) {
      return [];
    }
    try {
      return parseGoogleLinkedCalendars(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  if ("calendars" in record) {
    return parseGoogleLinkedCalendars(record.calendars);
  }

  const account = normalizeString(record.account);
  const calendar = normalizeString(record.calendar);
  if (!account && !calendar) {
    return [];
  }
  return [{ account, calendar }];
}

/**
 * Selects the account label to use for event creation.
 * Preference: calendar row with `calendar = "primary"`, then first account.
 */
export function selectPrimaryGoogleAccountLabel(
  calendars: Array<GoogleLinkedCalendarSetting>,
): string {
  const normalized = calendars.map((calendar) => ({
    account: normalizeString(calendar.account),
    calendar: normalizeString(calendar.calendar),
  }));
  const primaryCalendarAccount = normalized.find(
    (calendar) => calendar.account && calendar.calendar.toLowerCase() === "primary",
  );
  if (primaryCalendarAccount?.account) {
    return primaryCalendarAccount.account;
  }
  return normalized.find((calendar) => calendar.account)?.account ?? "";
}

export function selectGoogleCalendarAccountOptions(
  calendars: Array<GoogleLinkedCalendarSetting>,
  accountLabels: Array<string> = [],
): Array<GoogleCalendarAccountOption> {
  const normalizedAccountLabels = accountLabels
    .map((accountLabel) => normalizeString(accountLabel))
    .filter(Boolean);
  const preferredAccount = selectPrimaryGoogleAccountLabel(calendars);

  if (normalizedAccountLabels.length) {
    const orderedOauthAccounts = Array.from(new Set(normalizedAccountLabels));
    if (!preferredAccount || !orderedOauthAccounts.includes(preferredAccount)) {
      return orderedOauthAccounts.map((account) => ({ account, label: account }));
    }
    return [
      { account: preferredAccount, label: preferredAccount },
      ...orderedOauthAccounts
        .filter((account) => account !== preferredAccount)
        .map((account) => ({ account, label: account })),
    ];
  }

  const orderedAccounts: Array<string> = [];
  const seenAccounts = new Set<string>();

  if (preferredAccount) {
    orderedAccounts.push(preferredAccount);
    seenAccounts.add(preferredAccount);
  }

  for (const calendar of calendars) {
    const account = normalizeString(calendar.account);
    if (!account || seenAccounts.has(account)) {
      continue;
    }
    orderedAccounts.push(account);
    seenAccounts.add(account);
  }

  return orderedAccounts.map((account) => ({ account, label: account }));
}

function readGoogleLinkedCalendarsFromRuntimeSettings(): Array<GoogleLinkedCalendarSetting> {
  const googleExtension = window.roamjs?.extension?.google as
    | { extensionAPI?: { settings?: { get?: (key: string) => unknown } } }
    | undefined;
  const settingsGet = googleExtension?.extensionAPI?.settings?.get;
  if (typeof settingsGet !== "function") {
    return [];
  }
  try {
    return parseGoogleLinkedCalendars(settingsGet("calendars"));
  } catch {
    return [];
  }
}

function readGoogleLinkedCalendarsFromConfigTree(
  tree: Array<GoogleConfigNode>,
): Array<GoogleLinkedCalendarSetting> {
  const calendarsNode =
    tree.find((node) => /^\s*calendars\s*$/iu.test(node.text)) ??
    tree.find((node) => /linked\s+calendars/iu.test(node.text));
  if (!calendarsNode?.children?.length) {
    return [];
  }
  return calendarsNode.children.flatMap((child) => parseGoogleLinkedCalendars(child.text));
}

async function resolvePreferredGoogleAccountLabel(): Promise<string> {
  const runtimeLabel = selectPrimaryGoogleAccountLabel(
    readGoogleLinkedCalendarsFromRuntimeSettings(),
  );
  if (runtimeLabel) {
    return runtimeLabel;
  }

  try {
    const [{ default: getBasicTreeByParentUid }, { default: getPageUidByPageTitle }] =
      await Promise.all([
        import("roamjs-components/queries/getBasicTreeByParentUid"),
        import("roamjs-components/queries/getPageUidByPageTitle"),
      ]);
    const configPageUid = getPageUidByPageTitle("roam/js/google");
    if (!configPageUid) {
      return "";
    }
    const tree = getBasicTreeByParentUid(configPageUid) as Array<GoogleConfigNode>;
    return selectPrimaryGoogleAccountLabel(readGoogleLinkedCalendarsFromConfigTree(tree));
  } catch {
    return "";
  }
}

let cachedGoogleCalendarAccountOptions: Array<GoogleCalendarAccountOption> | null = null;
let googleCalendarAccountOptionsPromise: Promise<Array<GoogleCalendarAccountOption>> | null = null;

async function loadGoogleCalendarAccountOptions(): Promise<Array<GoogleCalendarAccountOption>> {
  let oauthAccountLabels: Array<string> = [];
  try {
    const { default: getOauthAccounts } = await import("roamjs-components/util/getOauthAccounts");
    oauthAccountLabels = getOauthAccounts("google");
  } catch {
    oauthAccountLabels = [];
  }

  const runtimeOptions = selectGoogleCalendarAccountOptions(
    readGoogleLinkedCalendarsFromRuntimeSettings(),
    oauthAccountLabels,
  );
  if (runtimeOptions.length) {
    return runtimeOptions;
  }

  try {
    const [{ default: getBasicTreeByParentUid }, { default: getPageUidByPageTitle }] =
      await Promise.all([
        import("roamjs-components/queries/getBasicTreeByParentUid"),
        import("roamjs-components/queries/getPageUidByPageTitle"),
      ]);
    const configPageUid = getPageUidByPageTitle("roam/js/google");
    if (!configPageUid) {
      return [];
    }
    const tree = getBasicTreeByParentUid(configPageUid) as Array<GoogleConfigNode>;
    return selectGoogleCalendarAccountOptions(
      readGoogleLinkedCalendarsFromConfigTree(tree),
      oauthAccountLabels,
    );
  } catch {
    return [];
  }
}

export async function listGoogleCalendarAccountOptions(): Promise<
  Array<GoogleCalendarAccountOption>
> {
  if (cachedGoogleCalendarAccountOptions?.length) {
    return cachedGoogleCalendarAccountOptions;
  }
  if (!googleCalendarAccountOptionsPromise) {
    googleCalendarAccountOptionsPromise = loadGoogleCalendarAccountOptions()
      .then((options) => {
        if (options.length) {
          cachedGoogleCalendarAccountOptions = options;
        }
        return options;
      })
      .finally(() => {
        googleCalendarAccountOptionsPromise = null;
      });
  }
  return googleCalendarAccountOptionsPromise;
}

export function resolveNestedBlockReferences(
  text: string,
  resolveBlockReference: BlockReferenceResolver = defaultResolveBlockReference,
  maxDepth = 8,
): string {
  let output = text;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    let sawReference = false;
    const next = output.replaceAll(BLOCK_REFERENCE_UID_REGEX, (_match, uid: string) => {
      sawReference = true;
      return resolveBlockReference(uid) ?? "";
    });
    output = next;
    if (!sawReference) {
      break;
    }
  }
  return output;
}

export function formatCalendarEventSummary(
  blockText: string,
  resolveBlockReference: BlockReferenceResolver = defaultResolveBlockReference,
): string {
  let summary = resolveNestedBlockReferences(blockText, resolveBlockReference);
  summary = summary.replaceAll(QUERY_MACRO_REGEX, " ");
  summary = summary.replaceAll(FENCED_CODE_REGEX, " ");
  summary = summary.replace(UNCLOSED_FENCE_START_REGEX, " ");
  summary = summary.replaceAll(/`([^`]*)`/gu, "$1");
  summary = summary.replaceAll(MARKDOWN_LINK_TO_ROAM_REF_REGEX, "$1");
  summary = summary.replaceAll(MARKDOWN_LINK_REGEX, "$1");
  summary = summary.replaceAll(ROAM_COMMAND_REGEX, " ");
  summary = summary.replaceAll(HASHTAG_TOKEN_REGEX, "$1");
  summary = stripTaskMarker(summary);
  summary = summary.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/u, "");
  if (DATALOG_QUERY_LINE_REGEX.test(summary)) {
    return "(Untitled)";
  }
  summary = summary.replace(PAGE_REFERENCE_REGEX, " ");
  summary = summary.replace(BLOCK_REFERENCE_REGEX, " ");
  summary = summary.replaceAll(/\*\*(.+?)\*\*/gu, "$1");
  summary = summary.replaceAll(/__(.+?)__/gu, "$1");
  summary = summary.replaceAll(/\^\^(.+?)\^\^/gu, "$1");
  summary = summary.replaceAll(/~~(.+?)~~/gu, "$1");
  summary = summary.replace(WHITESPACE_REGEX, " ").trim();
  summary = summary.replace(/^[-:;,.!?]+/u, "").trim();
  if (!summary) {
    return "(Untitled)";
  }
  return `${summary[0].toUpperCase()}${summary.slice(1)}`;
}

/**
 * Get an OAuth access token for Google Calendar from the RoamJS Google extension's
 * stored credentials. Handles token refresh if expired.
 */
async function getAccessToken(accountLabel?: string | null): Promise<string> {
  const { default: getOauth } = await import("roamjs-components/util/getOauth");
  const requestedAccountLabel = normalizeString(accountLabel);
  if (requestedAccountLabel) {
    const requestedRaw = getOauth("google", requestedAccountLabel);
    if (!requestedRaw || requestedRaw === "{}") {
      throw new Error(`Google Calendar account not available: ${requestedAccountLabel}`);
    }
    return getFreshAccessTokenFromRaw(requestedRaw);
  }

  const preferredAccountLabel = await resolvePreferredGoogleAccountLabel();
  const preferredRaw = preferredAccountLabel ? getOauth("google", preferredAccountLabel) : "{}";
  const raw = preferredRaw !== "{}" ? preferredRaw : getOauth("google");
  if (!raw || raw === "{}") {
    throw new Error(
      "Google Calendar not authenticated. Install and sign into the RoamJS Google extension.",
    );
  }

  return getFreshAccessTokenFromRaw(raw);
}

async function getFreshAccessTokenFromRaw(raw: string): Promise<string> {
  const parsed = JSON.parse(raw) as GoogleOauthRecord;
  const issuedAt = parsed.node?.time ? new Date(parsed.node.time).getTime() : Number.NaN;
  const tokenAgeSeconds = Number.isFinite(issuedAt) ? (Date.now() - issuedAt) / 1000 : Infinity;

  if (tokenAgeSeconds <= parsed.expires_in) {
    return parsed.access_token;
  }

  const { default: apiPost } = await import("roamjs-components/util/apiPost");
  const refreshed = await apiPost({
    anonymous: true,
    data: { grant_type: "refresh_token", refresh_token: parsed.refresh_token },
    domain: "https://roamjs.com",
    path: "google-auth",
  });
  if (!refreshed || typeof refreshed !== "object") {
    throw new Error("Failed to refresh Google Calendar token.");
  }
  const accessToken = (refreshed as { access_token?: unknown }).access_token;
  if (typeof accessToken !== "string") {
    throw new Error("Failed to refresh Google Calendar token.");
  }
  return accessToken;
}

/**
 * Format a Date to RFC 3339 for the Google Calendar API.
 */
function toRFC3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/**
 * Create a Google Calendar event on the user's primary calendar.
 * Returns the htmlLink for the created event.
 */
export async function createEvent(
  summary: string,
  blockUid: string,
  startDate: Date,
  durationMinutes: number,
  googleAccountLabel?: string | null,
): Promise<{ htmlLink: string }> {
  const token = await getAccessToken(googleAccountLabel);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
  const cleanedSummary = formatCalendarEventSummary(summary);

  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    body: JSON.stringify({
      description: `((${blockUid}))`,
      end: { dateTime: toRFC3339(endDate) },
      start: { dateTime: toRFC3339(startDate) },
      summary: cleanedSummary,
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Google Calendar API error (${response.status}): ${text}`);
  }

  const result = (await response.json()) as { htmlLink?: string };
  return { htmlLink: result.htmlLink ?? "" };
}
