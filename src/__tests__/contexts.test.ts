import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  primeDailyNoteSearchCache,
  primePageTitleSearchSupport,
  resetContextSearchCaches,
  searchDailyNotePages,
  searchPages,
  searchPagesAsync,
} from "../contexts";
import { parseRoamDate } from "../date-utils";

interface MockSearchResult {
  ":block/uid": string;
  ":node/title": string;
}

function stubRoamApi({
  asyncSearchImpl,
  dailyNoteUidRows = [],
  installAsyncSearch = true,
  qImpl,
  searchImpl,
  searchResultsByQuery = {},
  useFast = true,
}: {
  asyncSearchImpl?: ReturnType<typeof vi.fn>;
  dailyNoteUidRows?: Array<[string]>;
  installAsyncSearch?: boolean;
  qImpl?: ReturnType<typeof vi.fn>;
  searchImpl?: ReturnType<typeof vi.fn>;
  searchResultsByQuery?: Record<string, Array<MockSearchResult>>;
  useFast?: boolean;
}): {
  asyncSearch: ReturnType<typeof vi.fn>;
  fastQ: ReturnType<typeof vi.fn>;
  q: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
} {
  const q = qImpl ?? vi.fn(() => dailyNoteUidRows);
  const fastQ = vi.fn((query: string, ...inputs: Array<unknown>) => q(query, ...inputs));
  const search =
    searchImpl ??
    vi.fn(({ "search-str": searchStr }: { "search-str": string }) => {
      return searchResultsByQuery[searchStr] ?? [];
    });
  const asyncSearch =
    asyncSearchImpl ??
    vi.fn(async ({ "search-str": searchStr }: { "search-str": string }) => {
      return searchResultsByQuery[searchStr] ?? [];
    });
  const data: Record<string, unknown> = {
    q,
    search,
  };
  if (installAsyncSearch) {
    data.async = { search: asyncSearch };
  }
  if (useFast) {
    data.fast = { q: fastQ };
  }
  vi.stubGlobal("window", {
    roamAlphaAPI: {
      data,
    },
  });
  return { asyncSearch, fastQ, q, search };
}

describe("contexts search helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetContextSearchCaches();
    vi.unstubAllGlobals();
  });

  it("searchPages dedupes results by title and respects maxResults", () => {
    const { search } = stubRoamApi({
      searchResultsByQuery: {
        Home: [
          { ":block/uid": "uid-home", ":node/title": "Home" },
          { ":block/uid": "uid-home-duplicate", ":node/title": "Home" },
          { ":block/uid": "uid-homepod", ":node/title": "Homepod" },
          { ":block/uid": "uid-homework", ":node/title": "Homework" },
        ],
      },
    });

    const result = searchPages(" Home ", 2);

    expect(search).toHaveBeenCalledWith({
      limit: 2,
      pull: [":node/title", ":block/uid"],
      "search-blocks": false,
      "search-pages": true,
      "search-str": "Home",
    });
    expect(result).toEqual([
      { title: "Home", uid: "uid-home" },
      { title: "Homepod", uid: "uid-homepod" },
    ]);
  });

  it("searchPagesAsync prefers async search when available", async () => {
    const { asyncSearch, search } = stubRoamApi({
      searchResultsByQuery: {
        Home: [
          { ":block/uid": "uid-home", ":node/title": "Home" },
          { ":block/uid": "uid-homepod", ":node/title": "Homepod" },
        ],
      },
    });

    const result = await searchPagesAsync(" Home ", 2);

    expect(asyncSearch).toHaveBeenCalledWith({
      limit: 2,
      pull: [":node/title", ":block/uid"],
      "search-blocks": false,
      "search-pages": true,
      "search-str": "Home",
    });
    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual([
      { title: "Home", uid: "uid-home" },
      { title: "Homepod", uid: "uid-homepod" },
    ]);
  });

  it("searchPages falls back to the page-title query when advanced search options are unsupported", () => {
    const requests: Array<Record<string, unknown>> = [];
    const q = vi.fn((query: string, ...inputs: Array<unknown>) => {
      if (!query.includes("(re-pattern ?pattern) ?rp")) {
        return dailyNoteUidRows;
      }
      const pattern = inputs[0];
      if (
        pattern === "(?i)^Home" ||
        pattern === String.raw`(?i)(?:^|[\s/_.-])Home` ||
        pattern === "(?i)Home"
      ) {
        return [
          ["uid-home", "Home"],
          ["uid-homework", "Homework"],
        ];
      }
      return [];
    });
    const search = vi.fn((opts: Record<string, unknown>) => {
      requests.push(opts);
      throw new Error("Unsupported options");
    });
    const dailyNoteUidRows: Array<[string]> = [];
    stubRoamApi({ dailyNoteUidRows, qImpl: q, searchImpl: search });

    const first = searchPages("Home", 8);
    const second = searchPages("Home", 8);

    expect(first).toEqual([
      { title: "Home", uid: "uid-home" },
      { title: "Homework", uid: "uid-homework" },
    ]);
    expect(second).toEqual([
      { title: "Home", uid: "uid-home" },
      { title: "Homework", uid: "uid-homework" },
    ]);
    expect(search).toHaveBeenCalledTimes(1);
    expect(requests.filter((r) => "search-pages" in r)).toHaveLength(1);
    expect(q).toHaveBeenCalledTimes(6);
  });

  it("searchPages stops at the prefix query when it already has enough matches", () => {
    const q = vi.fn((query: string, ...inputs: Array<unknown>) => {
      if (!query.includes("(re-pattern ?pattern) ?rp")) {
        return [];
      }
      const pattern = inputs[0];
      if (pattern === "(?i)^pro") {
        return [
          ["uid-program", "Program"],
          ["uid-productivity", "Productivity"],
          ["uid-pro", "Pro"],
        ];
      }
      throw new Error(`Unexpected pattern: ${String(pattern)}`);
    });
    const search = vi.fn(() => {
      throw new Error("Unsupported options");
    });
    stubRoamApi({ qImpl: q, searchImpl: search });

    const result = searchPages("pro", 2);

    expect(result).toEqual([
      { title: "Pro", uid: "uid-pro" },
      { title: "Program", uid: "uid-program" },
    ]);
    expect(q).toHaveBeenCalledTimes(1);
    expect(q).toHaveBeenCalledWith(
      expect.stringContaining("(re-pattern ?pattern) ?rp"),
      "(?i)^pro",
    );
  });

  it("searchPages ranks exact and prefix matches ahead of boundary and loose substrings", () => {
    const q = vi.fn((query: string, ...inputs: Array<unknown>) => {
      if (!query.includes("(re-pattern ?pattern) ?rp")) {
        return [];
      }
      const pattern = inputs[0];
      if (pattern === "(?i)^pro") {
        return [
          ["uid-program", "Program"],
          ["uid-productivity", "Productivity"],
          ["uid-pro", "Pro"],
        ];
      }
      if (pattern === String.raw`(?i)(?:^|[\s/_.-])pro`) {
        return [["uid-loyalty", "Acme/Loyalty Program"]];
      }
      if (pattern === "(?i)pro") {
        return [["uid-profile", "Profile"]];
      }
      return [];
    });
    const search = vi.fn(() => {
      throw new Error("Unsupported options");
    });
    stubRoamApi({ qImpl: q, searchImpl: search });

    const result = searchPages("pro", 5);

    expect(result).toEqual([
      { title: "Pro", uid: "uid-pro" },
      { title: "Profile", uid: "uid-profile" },
      { title: "Program", uid: "uid-program" },
      { title: "Productivity", uid: "uid-productivity" },
      { title: "Acme/Loyalty Program", uid: "uid-loyalty" },
    ]);
  });

  it("primePageTitleSearchSupport probes sync advanced search support only once", async () => {
    const search = vi.fn(() => {
      throw new Error("Unsupported options");
    });
    stubRoamApi({ installAsyncSearch: false, searchImpl: search });

    await primePageTitleSearchSupport();
    await primePageTitleSearchSupport();
    searchPages("Home", 8);

    expect(search).toHaveBeenCalledTimes(1);
  });

  it("primePageTitleSearchSupport probes async advanced search support only once", async () => {
    const asyncSearch = vi.fn(async () => []);
    stubRoamApi({ asyncSearchImpl: asyncSearch });

    await Promise.all([primePageTitleSearchSupport(), primePageTitleSearchSupport()]);

    expect(asyncSearch).toHaveBeenCalledTimes(1);
  });

  it("searchDailyNotePages caches :log/id lookup and filters to today+ daily notes", () => {
    const { fastQ } = stubRoamApi({
      dailyNoteUidRows: [["uid-today"], ["uid-future"], ["uid-past"]],
      searchResultsByQuery: {
        march: [
          { ":block/uid": "uid-past", ":node/title": "February 28th, 2026" },
          { ":block/uid": "uid-today", ":node/title": "March 2nd, 2026" },
          { ":block/uid": "uid-future", ":node/title": "March 5th, 2026" },
          { ":block/uid": "uid-future-duplicate", ":node/title": "March 5th, 2026" },
        ],
      },
    });

    const first = searchDailyNotePages("march", parseRoamDate, 12);
    const second = searchDailyNotePages("march", parseRoamDate, 12);

    expect(first).toEqual(["March 2nd, 2026", "March 5th, 2026"]);
    expect(second).toEqual(["March 2nd, 2026", "March 5th, 2026"]);
    expect(fastQ).toHaveBeenCalledTimes(1);
  });

  it("primeDailyNoteSearchCache preloads and reuses the cache", () => {
    const { fastQ } = stubRoamApi({
      dailyNoteUidRows: [["uid-today"]],
    });

    primeDailyNoteSearchCache();
    primeDailyNoteSearchCache();

    expect(fastQ).toHaveBeenCalledTimes(1);
  });

  it("searchDailyNotePages extends cached daily-note UIDs for newly-created pages", () => {
    const q = vi.fn((query: string) => {
      if (query.includes(":in $ [?uid ...]")) {
        return [["uid-new"]];
      }
      return [["uid-today"]];
    });
    const { fastQ } = stubRoamApi({
      qImpl: q,
      searchResultsByQuery: {
        march: [
          { ":block/uid": "uid-today", ":node/title": "March 2nd, 2026" },
          { ":block/uid": "uid-new", ":node/title": "March 8th, 2026" },
        ],
      },
    });

    const result = searchDailyNotePages("march", parseRoamDate, 12);

    expect(result).toEqual(["March 2nd, 2026", "March 8th, 2026"]);
    expect(fastQ).toHaveBeenCalledTimes(2);
  });

  it("searchDailyNotePages remembers non-daily UIDs to avoid repeated subset queries", () => {
    const q = vi.fn((query: string) => {
      if (query.includes(":in $ [?uid ...]")) {
        return [];
      }
      return [["uid-today"]];
    });
    const { fastQ } = stubRoamApi({
      qImpl: q,
      searchResultsByQuery: {
        march: [{ ":block/uid": "uid-not-daily", ":node/title": "Home" }],
      },
    });

    const first = searchDailyNotePages("march", parseRoamDate, 12);
    const second = searchDailyNotePages("march", parseRoamDate, 12);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(fastQ).toHaveBeenCalledTimes(2);
  });

  it("searchDailyNotePages falls back to data.q when fast.q is unavailable", () => {
    const { q } = stubRoamApi({
      dailyNoteUidRows: [["uid-today"]],
      searchResultsByQuery: {
        march: [{ ":block/uid": "uid-today", ":node/title": "March 2nd, 2026" }],
      },
      useFast: false,
    });

    const result = searchDailyNotePages("march", parseRoamDate, 12);

    expect(result).toEqual(["March 2nd, 2026"]);
    expect(q).toHaveBeenCalledTimes(1);
  });
});
