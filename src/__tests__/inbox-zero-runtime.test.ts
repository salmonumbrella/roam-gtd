import { describe, expect, it, vi } from "vitest";

import {
  createInboxZeroWriteQueue,
  recordProcessedAdvance,
  resolveInboxZeroAdvance,
  resolveInboxZeroGoBack,
  resolveUnexpectedCurrentUidAfterItemsChange,
  syncProcessedSnapshotsWithLiveItems,
} from "../inbox-zero/runtime";
import type { TodoItem } from "../types";

function makeItem(uid: string, text = `Task ${uid}`): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: `Page ${uid}`,
    text,
    uid,
  };
}

describe("inbox zero runtime helpers", () => {
  it("serializes queued background writes", async () => {
    const events: Array<string> = [];
    let releaseFirst: (() => void) | null = null;
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = createInboxZeroWriteQueue();

    queue.enqueue(async () => {
      events.push("first:start");
      await firstDone;
      events.push("first:end");
    });
    queue.enqueue(async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    releaseFirst!();
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("records processed snapshots and predecessor links when advancing from the live list", () => {
    const processedState = recordProcessedAdvance({
      backViewUid: null,
      currentItem: makeItem("todo-1"),
      fallbackText: "{{[[TODO]]}} draft",
      items: [makeItem("todo-1"), makeItem("todo-2")],
      nextCurrentUid: "todo-2",
      processedState: {
        processedPredecessor: new Map<string, string>(),
        processedSnapshotsByUid: {},
        processedUidStack: [],
      },
      targetUid: "todo-1",
    });

    expect(processedState.processedUidStack).toEqual(["todo-1"]);
    expect(processedState.processedPredecessor.get("todo-2")).toBe("todo-1");
    expect(processedState.processedSnapshotsByUid["todo-1"]).toMatchObject({
      text: "Task todo-1",
      uid: "todo-1",
    });
  });

  it("resolves forward navigation through processed back-view history", () => {
    expect(
      resolveInboxZeroAdvance({
        backViewUid: "todo-1",
        currentUid: "todo-3",
        items: [makeItem("todo-3")],
        processedUidStack: ["todo-1", "todo-2"],
      }),
    ).toEqual({
      nextBackViewUid: "todo-2",
      nextCurrentUid: "todo-3",
      restoreFormStateUid: "todo-2",
    });
  });

  it("prefers processed predecessors when navigating back", () => {
    expect(
      resolveInboxZeroGoBack({
        backViewUid: null,
        currentUid: "todo-2",
        items: [makeItem("todo-2"), makeItem("todo-3")],
        processedPredecessor: new Map([["todo-2", "todo-1"]]),
        processedUidStack: ["todo-1"],
      }),
    ).toEqual({
      nextBackViewUid: "todo-1",
      nextCurrentUid: "todo-2",
      restoreFormStateUid: "todo-1",
    });
  });

  it("repositions the cursor when the current live item disappears unexpectedly", () => {
    expect(
      resolveUnexpectedCurrentUidAfterItemsChange({
        backViewUid: null,
        currentUid: "todo-2",
        newItems: [makeItem("todo-1"), makeItem("todo-3")],
        oldItems: [makeItem("todo-1"), makeItem("todo-2"), makeItem("todo-3")],
        processedUidStack: [],
      }),
    ).toBe("todo-3");
  });

  it("refreshes stored snapshots with live item data without dropping them", () => {
    const nextSnapshots = syncProcessedSnapshotsWithLiveItems(
      {
        "todo-1": makeItem("todo-1", "Old text"),
      },
      [makeItem("todo-1", "New text")],
    );

    expect(nextSnapshots["todo-1"]).toMatchObject({
      text: "New text",
      uid: "todo-1",
    });
  });

  it("reports queued write failures through the provided error hook", async () => {
    const onError = vi.fn();
    const queue = createInboxZeroWriteQueue({ onError });

    queue.enqueue(async () => {
      throw new Error("boom");
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
