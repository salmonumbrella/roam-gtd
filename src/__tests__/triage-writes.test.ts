import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOrderedChildren } = vi.hoisted(() => ({
  getOrderedChildren: vi.fn(),
}));

vi.mock("../graph-utils", () => ({
  getOrderedChildren,
}));

import {
  clearDueDateChild,
  getCurrentDueDateValue,
  upsertContextChild,
  upsertDueDateChild,
  type OrderedChild,
} from "../triage/writes";

describe("triage writes", () => {
  let createBlock: ReturnType<typeof vi.fn>;
  let deleteBlock: ReturnType<typeof vi.fn>;
  let updateBlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createBlock = vi.fn(() => Promise.resolve());
    deleteBlock = vi.fn(() => Promise.resolve());
    getOrderedChildren.mockReset();
    getOrderedChildren.mockReturnValue([]);
    updateBlock = vi.fn(() => Promise.resolve());
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        createBlock,
        data: {
          q: vi.fn(() => []),
        },
        deleteBlock,
        updateBlock,
        util: {
          generateUID: vi.fn(() => "generated-uid"),
        },
      },
    };
  });

  it("reads the current due date value from an existing due child", () => {
    getOrderedChildren.mockReturnValue([
      { order: 0, string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
    ]);

    expect(getCurrentDueDateValue("parent-uid")).toBe("March 26th, 2026");
  });

  it("returns an empty due date when there is no due child", () => {
    expect(getCurrentDueDateValue("parent-uid")).toBe("");
  });

  it("creates a Due:: child and marks it side-view", async () => {
    const callback = vi.fn();

    const result = await upsertDueDateChild("parent-uid", "March 26th, 2026", callback, []);

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Due:: [[March 26th, 2026]]", uid: "generated-uid" },
      location: { order: "last", "parent-uid": "parent-uid" },
    });
    expect(updateBlock).toHaveBeenCalledWith({
      block: { "block-view-type": "side", uid: "generated-uid" },
    });
    expect(callback).toHaveBeenCalledWith("parent-uid", "March 26th, 2026");
    expect(result).toEqual([
      { order: 0, string: "Due:: [[March 26th, 2026]]", uid: "generated-uid" },
    ]);
  });

  it("returns existing children and clears the persisted date when the new due date is blank", async () => {
    const callback = vi.fn();
    const children: Array<OrderedChild> = [{ order: 0, string: "Keep me", uid: "child-uid" }];

    const result = await upsertDueDateChild("parent-uid", "   ", callback, children);

    expect(callback).toHaveBeenCalledWith("parent-uid", "");
    expect(createBlock).not.toHaveBeenCalled();
    expect(result).toEqual(children);
  });

  it("updates an existing due child and preserves inline hashtags", async () => {
    const callback = vi.fn();
    const children: Array<OrderedChild> = [
      { order: 0, string: "Due:: [[March 20th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
      { order: 1, string: "Other child", uid: "other-uid" },
    ];

    const result = await upsertDueDateChild("parent-uid", "March 26th, 2026", callback, children);

    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { "block-view-type": "side", uid: "due-uid" },
    });
    expect(callback).toHaveBeenCalledWith("parent-uid", "March 26th, 2026");
    expect(result).toEqual([
      { order: 0, string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
      { order: 1, string: "Other child", uid: "other-uid" },
    ]);
  });

  it("clears a Due:: child but preserves hashtag children inline", async () => {
    const children: Array<OrderedChild> = [
      { order: 0, string: "Due:: [[March 26th, 2026]] #[[Office]] #urgent", uid: "due-uid" },
    ];
    const callback = vi.fn();

    const result = await clearDueDateChild("parent-uid", callback, children);

    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "#[[Office]] #urgent", uid: "due-uid" },
    });
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith("parent-uid", "");
    expect(result).toEqual([{ order: 0, string: "#[[Office]] #urgent", uid: "due-uid" }]);
  });

  it("deletes a bare Due:: child when no tags remain to preserve", async () => {
    const callback = vi.fn();
    const children: Array<OrderedChild> = [
      { order: 0, string: "Due:: [[March 26th, 2026]]", uid: "due-uid" },
    ];

    const result = await clearDueDateChild("parent-uid", callback, children);

    expect(deleteBlock).toHaveBeenCalledWith({ block: { uid: "due-uid" } });
    expect(callback).toHaveBeenCalledWith("parent-uid", "");
    expect(result).toEqual([]);
  });

  it("returns the original children when clearing a missing due child", async () => {
    const callback = vi.fn();
    const children: Array<OrderedChild> = [{ order: 0, string: "Other child", uid: "child-uid" }];

    const result = await clearDueDateChild("parent-uid", callback, children);

    expect(callback).toHaveBeenCalledWith("parent-uid", "");
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(result).toEqual(children);
  });

  it("appends context to the Due:: line and removes redundant context-only children", async () => {
    const children: Array<OrderedChild> = [
      { order: 0, string: "Due:: [[March 26th, 2026]]", uid: "due-uid" },
      { order: 1, string: "#[[Office]]", uid: "context-only-uid" },
    ];
    const callback = vi.fn();

    const result = await upsertContextChild("parent-uid", "Office", callback, children);

    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { string: "Due:: [[March 26th, 2026]] #[[Office]]", uid: "due-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { "block-view-type": "side", uid: "due-uid" },
    });
    expect(deleteBlock).toHaveBeenCalledWith({ block: { uid: "context-only-uid" } });
    expect(callback).toHaveBeenCalledWith("parent-uid", "March 26th, 2026");
    expect(result).toEqual([
      { order: 0, string: "Due:: [[March 26th, 2026]] #[[Office]]", uid: "due-uid" },
    ]);
  });

  it("does not rewrite the due child when it already contains the requested context", async () => {
    const callback = vi.fn();
    const children: Array<OrderedChild> = [
      { order: 0, string: "Due:: [[March 26th, 2026]] #Office", uid: "due-uid" },
    ];

    const result = await upsertContextChild("parent-uid", "Office", callback, children);

    expect(updateBlock).toHaveBeenCalledWith({
      block: { "block-view-type": "side", uid: "due-uid" },
    });
    expect(callback).not.toHaveBeenCalled();
    expect(result).toEqual(children);
  });

  it("creates a standalone context child at the top when no due line exists", async () => {
    const result = await upsertContextChild("parent-uid", "Office", vi.fn(), []);

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "#[[Office]]", uid: "generated-uid" },
      location: { order: 0, "parent-uid": "parent-uid" },
    });
    expect(result).toEqual([{ order: 0, string: "#[[Office]]", uid: "generated-uid" }]);
  });

  it("returns existing children when the context value is blank or already exists", async () => {
    const children: Array<OrderedChild> = [{ order: 0, string: "#[[Office]]", uid: "context-uid" }];

    await expect(upsertContextChild("parent-uid", "   ", vi.fn(), children)).resolves.toEqual(
      children,
    );
    await expect(upsertContextChild("parent-uid", "Office", vi.fn(), children)).resolves.toEqual(
      children,
    );
    expect(createBlock).not.toHaveBeenCalled();
  });
});
