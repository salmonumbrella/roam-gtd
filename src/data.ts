import type { QueryDef } from "./queries";
import type { TodoItem, TopGoalEntry } from "./types";

export type RoamQueryInput =
  | string
  | number
  | boolean
  | string[]
  | Array<readonly [string, number]>;
type RoamQueryResult = ReadonlyArray<ReadonlyArray<unknown>> | Array<Array<unknown>>;
type AsyncRoamQueryResult = Promise<RoamQueryResult>;

function shouldLogTimings(): boolean {
  const timingWindow = globalThis.window as
    | (Window & { __ROAM_GTD_DEBUG_TIMINGS?: boolean })
    | undefined;
  return timingWindow?.__ROAM_GTD_DEBUG_TIMINGS === true;
}

function summarizeQuery(query: string): string {
  return query.replaceAll(/\s+/g, " ").trim().slice(0, 120);
}

function logQueryTiming(startedAt: number, query: string, rowCount: number): void {
  if (!shouldLogTimings()) {
    return;
  }
  // eslint-disable-next-line no-console -- opt-in debug timings for query profiling
  console.debug("[RoamGTD][timing]", {
    durationMs: Math.max(0, Date.now() - startedAt),
    label: "query",
    querySummary: summarizeQuery(query),
    rowCount,
  });
}

export function computeAgeDays(createdTime: number, now: number = Date.now()): number {
  const diff = now - createdTime;
  if (diff <= 0) {
    return 0;
  }
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export function normalizeTodoRow(
  row: readonly [string, string, string, number],
  deferredDate: string | null = null,
): TodoItem {
  const [uid, text, pageTitle, createdTime] = row;
  return {
    ageDays: computeAgeDays(createdTime),
    createdTime,
    deferredDate,
    pageTitle,
    text,
    uid,
  };
}

export function parseGoalText(fullText: string, attrName: string): string {
  const prefix = `${attrName}::`;
  if (!fullText.startsWith(prefix)) {
    return "";
  }
  return fullText.slice(prefix.length).trim();
}

export function normalizeTopGoalRow(
  row: readonly [string, string, string],
  attrName: string,
): TopGoalEntry {
  return {
    goal: parseGoalText(row[1], attrName),
    pageTitle: row[2],
    text: row[1],
    uid: row[0],
  };
}

export type QueryRow = ReadonlyArray<string | number>;

export function runRoamQuery(query: string, ...inputs: Array<RoamQueryInput>): RoamQueryResult {
  const data = window.roamAlphaAPI.data as {
    async?: {
      fast?: {
        q?: (query: string, ...inputs: Array<RoamQueryInput>) => AsyncRoamQueryResult;
      };
      q?: (query: string, ...inputs: Array<RoamQueryInput>) => AsyncRoamQueryResult;
    };
    fast?: { q?: (query: string, ...inputs: Array<RoamQueryInput>) => RoamQueryResult };
    q?: (query: string, ...inputs: Array<RoamQueryInput>) => RoamQueryResult;
  };
  if (typeof data.fast?.q === "function") {
    return data.fast.q(query, ...inputs);
  }
  if (typeof data.q === "function") {
    return data.q(query, ...inputs);
  }
  return [];
}

async function runRoamQueryAsync(
  query: string,
  ...inputs: Array<RoamQueryInput>
): Promise<RoamQueryResult> {
  const data = window.roamAlphaAPI.data as {
    async?: {
      fast?: {
        q?: (query: string, ...inputs: Array<RoamQueryInput>) => AsyncRoamQueryResult;
      };
      q?: (query: string, ...inputs: Array<RoamQueryInput>) => AsyncRoamQueryResult;
    };
  };
  if (typeof data.async?.fast?.q === "function") {
    try {
      return await data.async.fast.q(query, ...inputs);
    } catch {
      // Fall back to sync queries if Roam exposes async q but rejects at runtime.
    }
  }
  if (typeof data.async?.q === "function") {
    try {
      return await data.async.q(query, ...inputs);
    } catch {
      // Fall back to sync queries if Roam exposes async q but rejects at runtime.
    }
  }
  return runRoamQuery(query, ...inputs);
}

export async function executeQuery(queryDef: QueryDef): Promise<Array<QueryRow>> {
  const { inputs, query } = queryDef;
  return executeRawQuery(query, ...inputs);
}

export async function executeRawQuery(
  query: string,
  ...inputs: Array<RoamQueryInput>
): Promise<Array<QueryRow>> {
  const startedAt = Date.now();
  try {
    const result = await runRoamQueryAsync(query, ...inputs);
    const rows: Array<QueryRow> = [];
    for (const row of result) {
      if (!Array.isArray(row)) {
        continue;
      }
      const valid = row.every(
        (value: unknown) => typeof value === "string" || typeof value === "number",
      );
      if (valid) {
        rows.push(row as QueryRow);
      }
    }
    logQueryTiming(startedAt, query, rows.length);
    return rows;
  } catch (error) {
    // eslint-disable-next-line no-console -- surface query failures for debugging
    console.warn("[RoamGTD] Query failed:", error);
    return [];
  }
}

export function pullEntities<T extends object>(
  pattern: string,
  entityIds: Array<number>,
): Array<T> {
  const data = window.roamAlphaAPI.data as unknown as {
    pull_many?: (pattern: string, eids: Array<number>) => Array<T | null>;
  };
  if (typeof data.pull_many !== "function") {
    return [];
  }
  try {
    const results = data.pull_many(pattern, entityIds);
    return results.filter((r): r is T => r != null);
  } catch {
    // eslint-disable-next-line no-console -- surface pull failures for debugging
    console.warn("[RoamGTD] pull_many failed");
    return [];
  }
}
