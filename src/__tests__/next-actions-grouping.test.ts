import { afterEach, describe, expect, it, vi } from "vitest";

import { groupNextActionsByContext, isNoContextGroup } from "../planning/next-actions-grouping";
import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

const SETTINGS = TEST_SETTINGS;

function todo(uid: string, text: string): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Page",
    text,
    uid,
  };
}

describe("groupNextActionsByContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("groups by first non-workflow hashtag and keeps no-context tasks last", () => {
    const groups = groupNextActionsByContext(
      [
        todo("u1", "{{[[TODO]]}} one #up #Home"),
        todo("u2", "{{[[TODO]]}} two #up #[[Home]]"),
        todo("u3", "{{[[TODO]]}} three #up #Office"),
        todo("u4", "{{[[TODO]]}} four #up"),
      ],
      SETTINGS,
    );

    expect(groups.map((group) => group.label)).toEqual(["Home", "Office", ""]);
    expect(groups[0]?.items.map((item) => item.uid)).toEqual(["u1", "u2"]);
    expect(groups[1]?.items.map((item) => item.uid)).toEqual(["u3"]);
    expect(groups[2]?.items.map((item) => item.uid)).toEqual(["u4"]);
    expect(isNoContextGroup(groups[2]!)).toBe(true);
  });

  it("ignores all workflow tags when choosing grouping context", () => {
    const groups = groupNextActionsByContext(
      [todo("u1", "{{[[TODO]]}} one #UP #watch #delegated #someday #Calls")],
      SETTINGS,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Calls");
    expect(isNoContextGroup(groups[0]!)).toBe(false);
  });

  it("uses left-to-right hashtag order and supports unicode simple hashtags", () => {
    const groups = groupNextActionsByContext(
      [
        todo("u1", "{{[[TODO]]}} one #up #Office #[[Home]]"),
        todo("u2", "{{[[TODO]]}} two #up #家"),
      ],
      SETTINGS,
    );
    expect(groups.map((group) => group.label)).toEqual(["Office", "家"]);
    expect(groups[0]?.items.map((item) => item.uid)).toEqual(["u1"]);
    expect(groups[1]?.items.map((item) => item.uid)).toEqual(["u2"]);
  });

  it("falls back to direct-child hashtags when parent TODO has no context tag", () => {
    const q = vi.fn((query: string, uid: string) => {
      if (!query.includes(":find ?order ?child-string")) {
        return [];
      }
      if (uid === "u1") {
        return [
          [0, "prep #Home"],
          [1, "then #Computer"],
        ];
      }
      if (uid === "u2") {
        return [[0, "plain child without tags"]];
      }
      return [];
    });

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: { q },
      },
    });

    const groups = groupNextActionsByContext(
      [todo("u1", "{{[[TODO]]}} one #up"), todo("u2", "{{[[TODO]]}} two #up")],
      SETTINGS,
    );

    expect(groups.map((group) => group.label)).toEqual(["Home", ""]);
    expect(groups[0]?.items.map((item) => item.uid)).toEqual(["u1"]);
    expect(groups[1]?.items.map((item) => item.uid)).toEqual(["u2"]);
  });

  it("ignores hashtags that only appear inside child code blocks", () => {
    const q = vi.fn((query: string, uid: string) => {
      if (!query.includes(":find ?order ?child-string")) {
        return [];
      }
      if (uid === "u1") {
        return [
          [0, "```js\n#Home\n```"],
          [1, "`#Computer`"],
          [2, "no tags here"],
        ];
      }
      return [];
    });

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: { q },
      },
    });

    const groups = groupNextActionsByContext([todo("u1", "{{[[TODO]]}} one #up")], SETTINGS);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("");
    expect(isNoContextGroup(groups[0]!)).toBe(true);
  });
});
