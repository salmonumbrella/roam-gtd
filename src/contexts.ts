import { runRoamQuery } from "./data";

export interface ContextEntry {
  title: string;
  uid: string;
}

interface RoamSearchResult {
  ":block/uid": string;
  ":node/title": string;
}

interface RoamSearchOptions {
  "hide-code-blocks"?: boolean;
  limit?: number;
  pull?: string | Array<string>;
  "search-blocks"?: boolean;
  "search-pages"?: boolean;
  "search-str": string;
}

interface RoamAPI {
  roamAlphaAPI: {
    data: {
      async?: {
        search?: (opts: RoamSearchOptions) => Promise<Array<RoamSearchResult>>;
      };
      fast?: { q: (query: string, ...inputs: Array<unknown>) => Array<Array<unknown>> };
      q?: (
        query: string,
        ...inputs: ReadonlyArray<string | number | boolean | string[]>
      ) => ReadonlyArray<ReadonlyArray<string | number>>;
      search: (opts: RoamSearchOptions) => Array<RoamSearchResult>;
    };
  };
}

const DAILY_NOTE_UID_QUERY = `[:find ?uid :where [?page :block/uid ?uid] [?page :log/id _]]`;
const DAILY_NOTE_UID_SUBSET_QUERY = `[:find ?uid :in $ [?uid ...] :where [?page :block/uid ?uid] [?page :log/id _]]`;
const PAGE_TITLE_REGEX_QUERY = `[:find ?uid ?title
  :in $ ?pattern
  :where
    [?page :node/title ?title]
    [?page :block/uid ?uid]
    [(re-pattern ?pattern) ?rp]
    [(re-find ?rp ?title)]]`;
const DEFAULT_MAX_RESULTS = 48;
const PAGE_SEARCH_PROBE = "a";
let cachedDailyNoteDayKey = "";
let cachedKnownNonDailyNoteUids = new Set<string>();
let cachedDailyNoteUids: Set<string> | null = null;
let pageTitleSearchSupportWarmup: Promise<void> | null = null;
let supportsSearchOptions: boolean | null = null;

function api(): RoamAPI {
  return window as unknown as RoamAPI;
}

function buildDayCacheKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function tryRunRoamSearchWithOptions(opts: RoamSearchOptions): Array<RoamSearchResult> | null {
  const search = api().roamAlphaAPI.data.search;
  if (supportsSearchOptions === false) {
    return null;
  }
  try {
    const results = search(opts);
    supportsSearchOptions = true;
    return results;
  } catch {
    supportsSearchOptions = false;
    return null;
  }
}

async function tryRunRoamAsyncSearchWithOptions(
  opts: RoamSearchOptions,
): Promise<Array<RoamSearchResult> | null> {
  const search = api().roamAlphaAPI.data.async?.search;
  if (typeof search !== "function") {
    return null;
  }
  try {
    return await search(opts);
  } catch {
    return null;
  }
}

function escapeRegexLiteral(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function buildPageTitleSubstringPattern(query: string): string {
  return `(?i)${escapeRegexLiteral(query.trim())}`;
}

function buildPageTitlePrefixPattern(query: string): string {
  return `(?i)^${escapeRegexLiteral(query.trim())}`;
}

function buildPageTitleBoundaryPattern(query: string): string {
  return `(?i)(?:^|[\\s/_.-])${escapeRegexLiteral(query.trim())}`;
}

function isBoundaryCharacter(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  return /[\s/_.-]/u.test(value);
}

function comparePageTitleMatches(left: ContextEntry, right: ContextEntry, query: string): number {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const score = (title: string): readonly [number, number, number, string] => {
    const normalizedTitle = title.toLocaleLowerCase();
    const index = normalizedTitle.indexOf(normalizedQuery);
    const safeIndex = index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    if (normalizedTitle === normalizedQuery) {
      return [0, 0, title.length, normalizedTitle];
    }
    if (normalizedTitle.startsWith(normalizedQuery)) {
      return [1, 0, title.length, normalizedTitle];
    }
    if (index >= 0 && isBoundaryCharacter(normalizedTitle[index - 1])) {
      return [2, safeIndex, title.length, normalizedTitle];
    }
    return [3, safeIndex, title.length, normalizedTitle];
  };

  const leftScore = score(left.title);
  const rightScore = score(right.title);
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] < rightScore[index]) {
      return -1;
    }
    if (leftScore[index] > rightScore[index]) {
      return 1;
    }
  }
  return left.uid.localeCompare(right.uid);
}

function dedupePageTitleRows(rows: ReadonlyArray<ReadonlyArray<unknown>>): Array<ContextEntry> {
  const deduped = new Map<string, ContextEntry>();
  for (const row of rows) {
    const [uid, title] = row;
    if (typeof uid !== "string" || typeof title !== "string") {
      continue;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      continue;
    }
    const key = trimmedTitle.toLocaleLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, { title: trimmedTitle, uid });
    }
  }
  return Array.from(deduped.values());
}

function runPageTitleRegexQueryByPattern(pattern: string): Array<ContextEntry> {
  return dedupePageTitleRows(runRoamQuery(PAGE_TITLE_REGEX_QUERY, pattern));
}

function mergePageTitleMatches(...groups: Array<Array<ContextEntry>>): Array<ContextEntry> {
  const deduped = new Map<string, ContextEntry>();
  for (const group of groups) {
    for (const match of group) {
      const key = match.title.toLocaleLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, match);
      }
    }
  }
  return Array.from(deduped.values());
}

function rankPageTitleMatches(matches: Array<ContextEntry>, query: string): Array<ContextEntry> {
  return matches.sort((left, right) => comparePageTitleMatches(left, right, query));
}

function runPageTitleRegexQuery(query: string, maxResults: number): Array<ContextEntry> {
  const prefixMatches = runPageTitleRegexQueryByPattern(buildPageTitlePrefixPattern(query));
  if (prefixMatches.length >= maxResults) {
    return rankPageTitleMatches(prefixMatches, query).slice(0, maxResults);
  }

  const boundaryMatches = runPageTitleRegexQueryByPattern(buildPageTitleBoundaryPattern(query));
  const prioritizedMatches = mergePageTitleMatches(prefixMatches, boundaryMatches);
  if (prioritizedMatches.length >= maxResults) {
    return rankPageTitleMatches(prioritizedMatches, query).slice(0, maxResults);
  }

  const substringMatches = runPageTitleRegexQueryByPattern(buildPageTitleSubstringPattern(query));
  return rankPageTitleMatches(
    mergePageTitleMatches(prioritizedMatches, substringMatches),
    query,
  ).slice(0, maxResults);
}

function dedupeSearchResults(
  results: Array<RoamSearchResult>,
  maxResults: number,
): Array<ContextEntry> {
  const seenTitles = new Set<string>();
  const deduped: Array<ContextEntry> = [];
  for (const result of results) {
    const title = result[":node/title"]?.trim();
    const uid = result[":block/uid"];
    if (!title || !uid) {
      continue;
    }
    const key = title.toLowerCase();
    if (seenTitles.has(key)) {
      continue;
    }
    seenTitles.add(key);
    deduped.push({ title, uid });
    if (deduped.length >= maxResults) {
      break;
    }
  }
  return deduped;
}

function searchPageTitles(query: string, maxResults: number): Array<ContextEntry> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const advancedResults = tryRunRoamSearchWithOptions({
    limit: Math.max(1, Math.min(1000, maxResults)),
    pull: [":node/title", ":block/uid"],
    "search-blocks": false,
    "search-pages": true,
    "search-str": trimmed,
  });
  if (!advancedResults) {
    return runPageTitleRegexQuery(trimmed, maxResults);
  }
  return dedupeSearchResults(advancedResults, maxResults);
}

async function searchPageTitlesAsync(
  query: string,
  maxResults: number,
): Promise<Array<ContextEntry>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const advancedResults = await tryRunRoamAsyncSearchWithOptions({
    limit: Math.max(1, Math.min(1000, maxResults)),
    pull: [":node/title", ":block/uid"],
    "search-blocks": false,
    "search-pages": true,
    "search-str": trimmed,
  });
  if (!advancedResults) {
    return searchPageTitles(trimmed, maxResults);
  }
  return dedupeSearchResults(advancedResults, maxResults);
}

function refreshDailyNoteUidCache(now: Date): Set<string> {
  const rows = runRoamQuery(DAILY_NOTE_UID_QUERY);
  const nextCache = new Set<string>();
  for (const row of rows) {
    const uid = row[0];
    if (typeof uid === "string") {
      nextCache.add(uid);
    }
  }
  cachedDailyNoteDayKey = buildDayCacheKey(now);
  cachedKnownNonDailyNoteUids = new Set();
  cachedDailyNoteUids = nextCache;
  return cachedDailyNoteUids;
}

function getDailyNoteUidCache(now: Date = new Date()): Set<string> {
  if (cachedDailyNoteUids && cachedDailyNoteDayKey === buildDayCacheKey(now)) {
    return cachedDailyNoteUids;
  }
  return refreshDailyNoteUidCache(now);
}

function mergeMissingDailyNoteUids(
  candidateUids: Array<string>,
  dailyNoteUids: Set<string>,
): Set<string> {
  const missingUids = [
    ...new Set(
      candidateUids.filter(
        (uid) => uid && !dailyNoteUids.has(uid) && !cachedKnownNonDailyNoteUids.has(uid),
      ),
    ),
  ];
  if (missingUids.length === 0) {
    return dailyNoteUids;
  }
  const rows = runRoamQuery(DAILY_NOTE_UID_SUBSET_QUERY, missingUids);
  const matchedUids = new Set<string>();
  for (const row of rows) {
    const uid = row[0];
    if (typeof uid === "string") {
      dailyNoteUids.add(uid);
      matchedUids.add(uid);
    }
  }
  for (const uid of missingUids) {
    if (!matchedUids.has(uid)) {
      cachedKnownNonDailyNoteUids.add(uid);
    }
  }
  return dailyNoteUids;
}

export function primeDailyNoteSearchCache(now: Date = new Date()): void {
  getDailyNoteUidCache(now);
}

export function primePageTitleSearchSupport(): Promise<void> {
  if (supportsSearchOptions !== null) {
    return Promise.resolve();
  }
  if (pageTitleSearchSupportWarmup) {
    return pageTitleSearchSupportWarmup;
  }
  const opts: RoamSearchOptions = {
    limit: 1,
    pull: [":node/title", ":block/uid"],
    "search-blocks": false,
    "search-pages": true,
    "search-str": PAGE_SEARCH_PROBE,
  };
  const asyncSearch = api().roamAlphaAPI.data.async?.search;
  if (typeof asyncSearch === "function") {
    const warmup = asyncSearch(opts)
      .then(() => {
        supportsSearchOptions = true;
      })
      .catch(() => {
        if (supportsSearchOptions === null) {
          void tryRunRoamSearchWithOptions(opts);
        }
      })
      .finally(() => {
        if (pageTitleSearchSupportWarmup === warmup) {
          pageTitleSearchSupportWarmup = null;
        }
      });
    pageTitleSearchSupportWarmup = warmup;
    return warmup;
  }
  void tryRunRoamSearchWithOptions(opts);
  return Promise.resolve();
}

export function resetContextSearchCaches(): void {
  cachedDailyNoteDayKey = "";
  cachedKnownNonDailyNoteUids = new Set();
  cachedDailyNoteUids = null;
  pageTitleSearchSupportWarmup = null;
  supportsSearchOptions = null;
}

/** Search pages using Roam's native search (same ranking as `[[]]`). */
export function searchPages(
  query: string,
  maxResults: number = DEFAULT_MAX_RESULTS,
): Array<ContextEntry> {
  return searchPageTitles(query, maxResults);
}

export async function searchPagesAsync(
  query: string,
  maxResults: number = DEFAULT_MAX_RESULTS,
): Promise<Array<ContextEntry>> {
  return searchPageTitlesAsync(query, maxResults);
}

/** Search daily note pages (`:log/id`) from today onward. */
export function searchDailyNotePages(
  query: string,
  parseDate: (title: string) => Date | null,
  maxResults: number = DEFAULT_MAX_RESULTS,
): Array<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const results = searchPageTitles(trimmed, maxResults * 2).map((result) => ({
    ":block/uid": result.uid,
    ":node/title": result.title,
  }));
  if (results.length === 0) {
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyNoteUids = mergeMissingDailyNoteUids(
    results.map((result) => result[":block/uid"]),
    getDailyNoteUidCache(today),
  );
  const seenTitles = new Set<string>();
  const filtered: Array<string> = [];
  for (const result of results) {
    const uid = result[":block/uid"];
    const title = result[":node/title"]?.trim();
    if (!uid || !title || !dailyNoteUids.has(uid)) {
      continue;
    }
    const key = title.toLowerCase();
    if (seenTitles.has(key)) {
      continue;
    }
    const date = parseDate(title);
    if (date === null || date < today) {
      continue;
    }
    seenTitles.add(key);
    filtered.push(title);
    if (filtered.length >= maxResults) {
      break;
    }
  }
  return filtered;
}
