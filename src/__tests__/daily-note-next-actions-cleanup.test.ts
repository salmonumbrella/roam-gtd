import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteBlock: vi.fn(async (_uid: string) => undefined),
}));

vi.mock("roamjs-components/writes/deleteBlock", () => ({
  default: mocks.deleteBlock,
}));

import {
  clearGeneratedNextActionArtifacts,
  clearLegacyGeneratedSubtrees,
  hasOnlyBlockRefChildren,
  hasOnlyNextActionRefChildren,
  hasOnlyScheduledRefChildren,
  isGeneratedContextHeading,
} from "../planning/daily-note-next-actions/cleanup";
import { TEST_SETTINGS } from "./fixtures";

describe("daily-note next actions cleanup helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteBlock.mockImplementation(async (_uid: string) => undefined);
  });

  it("recognizes generated context headings", () => {
    expect(isGeneratedContextHeading("No context")).toBe(true);
    expect(isGeneratedContextHeading("#Home")).toBe(true);
    expect(isGeneratedContextHeading("Manual note")).toBe(false);
  });

  it("detects generated block-ref subtrees", () => {
    const deps = {
      getOrderedChildren: vi.fn((uid: string) =>
        uid === "group-1"
          ? [
              { order: 0, string: "((a))", uid: "a" },
              { order: 1, string: "((b))", uid: "b" },
            ]
          : [],
      ),
    };

    expect(hasOnlyBlockRefChildren("group-1", deps)).toBe(true);
    expect(hasOnlyBlockRefChildren("missing", deps)).toBe(false);
  });

  it("detects generated scheduled and next-action wrappers", () => {
    const childMap = new Map([
      ["scheduled-wrapper", [{ order: 0, string: "((due-child))", uid: "ref-1" }]],
      ["next-wrapper", [{ order: 0, string: "((todo-uid))", uid: "ref-2" }]],
    ]);
    const stringMap = new Map([
      ["due-child", "Due:: [[February 25th, 2026]]"],
      ["todo-uid", "{{[[TODO]]}} next #up"],
    ]);
    const deps = {
      getBlockStringByUid: (uid: string) => stringMap.get(uid) ?? null,
      getOrderedChildren: (uid: string) => childMap.get(uid) ?? [],
    };

    expect(hasOnlyScheduledRefChildren("scheduled-wrapper", deps)).toBe(true);
    expect(hasOnlyNextActionRefChildren("next-wrapper", TEST_SETTINGS, deps)).toBe(true);
  });

  it("clears legacy/generated wrappers in a fixed order", async () => {
    const childrenByParent = new Map<string, Array<{ order: number; string: string; uid: string }>>(
      [
        [
          "plans",
          [
            { order: 0, string: "Next Actions", uid: "section" },
            { order: 1, string: "#Home", uid: "group" },
            { order: 2, string: "((project-uid))", uid: "project-wrapper" },
            { order: 3, string: "{{[[TODO]]}} ((scheduled-parent))", uid: "scheduled-wrapper" },
          ],
        ],
        [
          "section",
          [{ order: 0, string: "roam-gtd::next-actions-generated", uid: "generated-root" }],
        ],
        ["group", [{ order: 0, string: "((todo-uid))", uid: "group-child" }]],
        ["project-wrapper", [{ order: 0, string: "((todo-uid))", uid: "project-child" }]],
        [
          "scheduled-wrapper",
          [{ order: 0, string: "((scheduled-child))", uid: "scheduled-child-ref" }],
        ],
      ],
    );
    const strings = new Map([
      ["todo-uid", "{{[[TODO]]}} next #up"],
      ["project-uid", "Project:: Ship launch"],
      ["scheduled-parent", "Call bank"],
      ["scheduled-child", "Reminder:: [[February 25th, 2026]]"],
    ]);

    const deps = {
      getBlockStringByUid: (uid: string) => strings.get(uid) ?? null,
      getOrderedChildren: (uid: string) => childrenByParent.get(uid) ?? [],
    };
    const parentByChild = new Map<string, string>();
    for (const [parentUid, children] of childrenByParent.entries()) {
      for (const child of children) {
        parentByChild.set(child.uid, parentUid);
      }
    }

    mocks.deleteBlock.mockImplementation(async (uid: string) => {
      const parentUid = parentByChild.get(uid);
      if (!parentUid) {
        return;
      }
      const children = childrenByParent.get(parentUid) ?? [];
      childrenByParent.set(
        parentUid,
        children.filter((child) => child.uid !== uid),
      );
      parentByChild.delete(uid);
    });

    await clearLegacyGeneratedSubtrees(
      "plans",
      "Next Actions",
      "roam-gtd::next-actions-generated",
      deps,
    );
    await clearGeneratedNextActionArtifacts(
      "plans",
      TEST_SETTINGS,
      { generatedRootText: "roam-gtd::next-actions-generated", sectionBlockText: "Next Actions" },
      deps,
    );

    expect(mocks.deleteBlock.mock.calls.map(([uid]) => uid)).toEqual([
      "generated-root",
      "section",
      "group",
      "project-wrapper",
      "scheduled-wrapper",
    ]);
  });
});
