import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeAgeDays,
  executeQuery,
  executeRawQuery,
  normalizeTodoRow,
  parseGoalText,
} from "../data";

describe("normalizeTodoRow", () => {
  it("extracts row fields", () => {
    const row: readonly [string, string, string, number] = [
      "abc123",
      "{{[[TODO]]}} Buy groceries #up",
      "Daily Tasks",
      1_707_900_000_000,
    ];
    const item = normalizeTodoRow(row);
    expect(item.uid).toBe("abc123");
    expect(item.text).toBe("{{[[TODO]]}} Buy groceries #up");
    expect(item.pageTitle).toBe("Daily Tasks");
    expect(item.createdTime).toBe(1_707_900_000_000);
    expect(item.deferredDate).toBeNull();
    expect(typeof item.ageDays).toBe("number");
  });

  it("uses provided deferred date", () => {
    const row: readonly [string, string, string, number] = [
      "abc123",
      "{{[[TODO]]}} Call Bob #up #urgent [[Project X]]",
      "Tasks",
      1_707_900_000_000,
    ];
    const item = normalizeTodoRow(row, "February 20th, 2026");
    expect(item.deferredDate).toBe("February 20th, 2026");
  });
});

describe("parseGoalText", () => {
  it("extracts goal text", () => {
    expect(parseGoalText("Top Goal:: Ship MVP", "Top Goal")).toBe("Ship MVP");
  });

  it("trims goal text", () => {
    expect(parseGoalText("Top Goal::   Review PRs   ", "Top Goal")).toBe("Review PRs");
  });

  it("returns empty when prefix missing", () => {
    expect(parseGoalText("Top Goal", "Top Goal")).toBe("");
  });
});

describe("computeAgeDays", () => {
  it("computes day difference", () => {
    const now = 2000 * 24 * 60 * 60 * 1000;
    const old = now - 3 * 24 * 60 * 60 * 1000;
    expect(computeAgeDays(old, now)).toBe(3);
  });

  it("clamps negative values to zero", () => {
    const now = 1000;
    expect(computeAgeDays(2000, now)).toBe(0);
  });
});

describe("executeQuery", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        data: {
          async: undefined,
          fast: undefined,
          q: vi.fn(),
        },
      },
    };
  });

  it("skips rows containing non-string non-number values instead of dropping columns", async () => {
    const mockQ = vi.fn().mockReturnValue([
      ["uid1", "text1", "page1", 100],
      ["uid2", null, "page2", 200],
      ["uid3", "text3", "page3", 300],
    ]);
    (window as unknown as Record<string, { data: { q: unknown } }>).roamAlphaAPI.data.q = mockQ;

    const result = await executeQuery({ inputs: [], query: "test" });
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe("uid1");
    expect(result[1][0]).toBe("uid3");
  });

  it("prefers fast.q when available", async () => {
    const fastQ = vi.fn().mockReturnValue([["uid-fast", "text", "page", 1]]);
    const fallbackQ = vi.fn().mockReturnValue([["uid-fallback", "text", "page", 2]]);
    (
      window as unknown as Record<
        string,
        { data: { async?: unknown; fast?: { q: typeof fastQ }; q: typeof fallbackQ } }
      >
    ).roamAlphaAPI.data = {
      async: undefined,
      fast: { q: fastQ },
      q: fallbackQ,
    };

    const result = await executeQuery({ inputs: [], query: "test" });

    expect(fastQ).toHaveBeenCalledTimes(1);
    expect(fallbackQ).not.toHaveBeenCalled();
    expect(result[0]?.[0]).toBe("uid-fast");
  });

  it("prefers async.fast.q when available", async () => {
    const asyncFastQ = vi.fn().mockResolvedValue([["uid-async-fast", "text", "page", 1]]);
    const fastQ = vi.fn().mockReturnValue([["uid-fast", "text", "page", 2]]);
    const fallbackQ = vi.fn().mockReturnValue([["uid-fallback", "text", "page", 3]]);
    (
      window as unknown as Record<
        string,
        {
          data: {
            async?: { fast?: { q: typeof asyncFastQ } };
            fast?: { q: typeof fastQ };
            q: typeof fallbackQ;
          };
        }
      >
    ).roamAlphaAPI.data = {
      async: { fast: { q: asyncFastQ } },
      fast: { q: fastQ },
      q: fallbackQ,
    };

    const result = await executeQuery({ inputs: [], query: "test" });

    expect(asyncFastQ).toHaveBeenCalledTimes(1);
    expect(fastQ).not.toHaveBeenCalled();
    expect(fallbackQ).not.toHaveBeenCalled();
    expect(result[0]?.[0]).toBe("uid-async-fast");
  });

  it("falls back to sync fast.q when async.fast.q rejects", async () => {
    const asyncFastQ = vi.fn().mockRejectedValue(new Error("async failed"));
    const fastQ = vi.fn().mockReturnValue([["uid-fast", "text", "page", 2]]);
    const fallbackQ = vi.fn().mockReturnValue([["uid-fallback", "text", "page", 3]]);
    (
      window as unknown as Record<
        string,
        {
          data: {
            async?: { fast?: { q: typeof asyncFastQ } };
            fast?: { q: typeof fastQ };
            q: typeof fallbackQ;
          };
        }
      >
    ).roamAlphaAPI.data = {
      async: { fast: { q: asyncFastQ } },
      fast: { q: fastQ },
      q: fallbackQ,
    };

    const result = await executeQuery({ inputs: [], query: "test" });

    expect(asyncFastQ).toHaveBeenCalledTimes(1);
    expect(fastQ).toHaveBeenCalledTimes(1);
    expect(fallbackQ).not.toHaveBeenCalled();
    expect(result[0]?.[0]).toBe("uid-fast");
  });
});

describe("executeRawQuery", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        data: {
          async: undefined,
          fast: undefined,
          q: vi.fn(),
        },
      },
    };
  });

  it("prefers async.fast.q for ad hoc queries", async () => {
    const asyncFastQ = vi.fn().mockResolvedValue([["todo-1", "Alice"]]);
    const fastQ = vi.fn().mockReturnValue([["todo-2", "Bob"]]);
    const fallbackQ = vi.fn().mockReturnValue([["todo-3", "Carol"]]);
    (
      window as unknown as Record<
        string,
        {
          data: {
            async?: { fast?: { q: typeof asyncFastQ } };
            fast?: { q: typeof fastQ };
            q: typeof fallbackQ;
          };
        }
      >
    ).roamAlphaAPI.data = {
      async: { fast: { q: asyncFastQ } },
      fast: { q: fastQ },
      q: fallbackQ,
    };

    const result = await executeRawQuery("test-query", ["todo-1"], ["people"]);

    expect(asyncFastQ).toHaveBeenCalledTimes(1);
    expect(fastQ).not.toHaveBeenCalled();
    expect(fallbackQ).not.toHaveBeenCalled();
    expect(result).toEqual([["todo-1", "Alice"]]);
  });

  it("filters invalid rows for ad hoc queries", async () => {
    const mockQ = vi.fn().mockReturnValue([
      ["todo-1", "Alice"],
      ["todo-2", { name: "Bob" }],
      ["todo-3", "Carol"],
    ]);
    (window as unknown as Record<string, { data: { q: unknown } }>).roamAlphaAPI.data.q = mockQ;

    const result = await executeRawQuery("test-query", ["todo-1"], ["people"]);

    expect(result).toEqual([
      ["todo-1", "Alice"],
      ["todo-3", "Carol"],
    ]);
  });

  it("logs query timings when debug timings are enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1042);
    const timingWindow = window as Window &
      typeof globalThis & {
        __ROAM_GTD_DEBUG_TIMINGS?: boolean;
        roamAlphaAPI: { data: { q: (query: string) => Array<Array<string>> } };
      };
    timingWindow.__ROAM_GTD_DEBUG_TIMINGS = true;
    timingWindow.roamAlphaAPI.data.q = vi.fn(() => [["todo-1", "Alice"]]);

    try {
      await executeRawQuery("[:find ?todo :where [?todo :block/uid]]");
      expect(debugSpy).toHaveBeenCalledWith(
        "[RoamGTD][timing]",
        expect.objectContaining({
          durationMs: 42,
          label: "query",
          rowCount: 1,
        }),
      );
    } finally {
      delete timingWindow.__ROAM_GTD_DEBUG_TIMINGS;
      debugSpy.mockRestore();
      nowSpy.mockRestore();
    }
  });
});
