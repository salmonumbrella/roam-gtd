import { resolveProcessedSnapshot } from "../triage/step-logic";
import type { TodoItem } from "../types";

export interface InboxZeroProcessedState {
  processedPredecessor: Map<string, string>;
  processedSnapshotsByUid: Record<string, TodoItem>;
  processedUidStack: Array<string>;
}

interface CreateInboxZeroWriteQueueArgs {
  onError?: (error: unknown) => void;
}

interface ResolveInboxZeroAdvanceArgs {
  backViewUid: string | null;
  currentUid: string | null;
  items: Array<TodoItem>;
  processedUidStack: Array<string>;
}

interface ResolveInboxZeroAdvanceResult {
  nextBackViewUid: string | null;
  nextCurrentUid: string | null;
  restoreFormStateUid?: string;
}

interface RecordProcessedAdvanceArgs {
  backViewUid: string | null;
  currentItem: TodoItem | null;
  fallbackText?: string;
  items: Array<TodoItem>;
  nextCurrentUid: string | null;
  processedState: InboxZeroProcessedState;
  targetUid?: string;
}

interface ResolveInboxZeroGoBackArgs {
  backViewUid: string | null;
  currentUid: string | null;
  items: Array<TodoItem>;
  processedPredecessor: Map<string, string>;
  processedUidStack: Array<string>;
}

interface ResolveInboxZeroGoBackResult {
  nextBackViewUid: string | null;
  nextCurrentUid: string | null;
  restoreFormStateUid: string;
}

interface ResolveUnexpectedCurrentUidAfterItemsChangeArgs {
  backViewUid: string | null;
  currentUid: string | null;
  newItems: Array<TodoItem>;
  oldItems: Array<TodoItem>;
  processedUidStack: Array<string>;
}

const DEFAULT_QUEUE_ERROR_HANDLER = (error: unknown): void => {
  // eslint-disable-next-line no-console -- best-effort background write logging
  console.warn("[RoamGTD] Background write failed", error);
};

export function createInboxZeroWriteQueue(args: CreateInboxZeroWriteQueueArgs = {}) {
  const onError = args.onError ?? DEFAULT_QUEUE_ERROR_HANDLER;
  const queue: Array<() => Promise<void>> = [];
  let draining = false;

  const drain = (): void => {
    if (draining) {
      return;
    }
    draining = true;
    void (async () => {
      try {
        while (queue.length > 0) {
          const task = queue.shift()!;
          try {
            await task();
          } catch (error) {
            onError(error);
          }
        }
      } finally {
        draining = false;
      }
    })();
  };

  return {
    drain,
    enqueue(task: () => Promise<void>): void {
      queue.push(task);
      drain();
    },
    getPendingCount(): number {
      return queue.length;
    },
    isDraining(): boolean {
      return draining;
    },
  };
}

export function resolveInboxZeroAdvance(
  args: ResolveInboxZeroAdvanceArgs,
): ResolveInboxZeroAdvanceResult {
  const { backViewUid, currentUid, items, processedUidStack } = args;
  if (backViewUid) {
    const currentBackIndex = processedUidStack.lastIndexOf(backViewUid);
    if (currentBackIndex >= 0 && currentBackIndex < processedUidStack.length - 1) {
      const nextBackViewUid = processedUidStack[currentBackIndex + 1];
      return {
        nextBackViewUid,
        nextCurrentUid: currentUid,
        restoreFormStateUid: nextBackViewUid,
      };
    }
    return {
      nextBackViewUid: null,
      nextCurrentUid: currentUid,
    };
  }

  const currentIndex = items.findIndex((item) => item.uid === currentUid);
  return {
    nextBackViewUid: null,
    nextCurrentUid: currentIndex >= 0 ? (items[currentIndex + 1]?.uid ?? null) : null,
  };
}

export function recordProcessedAdvance(args: RecordProcessedAdvanceArgs): InboxZeroProcessedState {
  const {
    backViewUid,
    currentItem,
    fallbackText = "",
    items,
    nextCurrentUid,
    processedState,
  } = args;
  const targetUid = args.targetUid ?? currentItem?.uid ?? null;
  if (!targetUid || backViewUid) {
    return processedState;
  }

  const snapshot = resolveProcessedSnapshot(targetUid, items, currentItem, fallbackText);
  const nextProcessedPredecessor = new Map(processedState.processedPredecessor);
  if (nextCurrentUid && nextCurrentUid !== targetUid) {
    nextProcessedPredecessor.set(nextCurrentUid, targetUid);
  }

  return {
    processedPredecessor: nextProcessedPredecessor,
    processedSnapshotsByUid: {
      ...processedState.processedSnapshotsByUid,
      [targetUid]: snapshot,
    },
    processedUidStack: [...processedState.processedUidStack, targetUid],
  };
}

export function resolveMissingCurrentItemUid(args: {
  currentUid: string | null;
  items: Array<TodoItem>;
}): string | null {
  const { currentUid, items } = args;
  const currentIndex = items.findIndex((item) => item.uid === currentUid);
  if (currentIndex >= 0) {
    return items[currentIndex + 1]?.uid ?? items[Math.max(0, currentIndex - 1)]?.uid ?? null;
  }
  return items.at(-1)?.uid ?? null;
}

export function resolveInboxZeroGoBack(
  args: ResolveInboxZeroGoBackArgs,
): ResolveInboxZeroGoBackResult | null {
  const { backViewUid, currentUid, items, processedPredecessor, processedUidStack } = args;
  if (backViewUid) {
    const currentBackIndex = processedUidStack.lastIndexOf(backViewUid);
    if (currentBackIndex > 0) {
      const previousUid = processedUidStack[currentBackIndex - 1];
      return {
        nextBackViewUid: previousUid,
        nextCurrentUid: currentUid,
        restoreFormStateUid: previousUid,
      };
    }
    return null;
  }

  const predecessor = currentUid ? processedPredecessor.get(currentUid) : undefined;
  if (predecessor && processedUidStack.includes(predecessor)) {
    return {
      nextBackViewUid: predecessor,
      nextCurrentUid: currentUid,
      restoreFormStateUid: predecessor,
    };
  }

  const currentIndex = items.findIndex((item) => item.uid === currentUid);
  if (currentIndex > 0) {
    const previousItem = items[currentIndex - 1];
    if (processedUidStack.includes(previousItem.uid)) {
      return {
        nextBackViewUid: previousItem.uid,
        nextCurrentUid: currentUid,
        restoreFormStateUid: previousItem.uid,
      };
    }
    return {
      nextBackViewUid: null,
      nextCurrentUid: previousItem.uid,
      restoreFormStateUid: previousItem.uid,
    };
  }

  const lastProcessedUid = processedUidStack.at(-1);
  if (!lastProcessedUid) {
    return null;
  }

  return {
    nextBackViewUid: lastProcessedUid,
    nextCurrentUid: currentUid,
    restoreFormStateUid: lastProcessedUid,
  };
}

export function resolveUnexpectedCurrentUidAfterItemsChange(
  args: ResolveUnexpectedCurrentUidAfterItemsChangeArgs,
): string | null | undefined {
  const { backViewUid, currentUid, newItems, oldItems, processedUidStack } = args;
  if (
    !currentUid ||
    backViewUid ||
    newItems.some((item) => item.uid === currentUid) ||
    processedUidStack.includes(currentUid)
  ) {
    return undefined;
  }

  const oldIndex = oldItems.findIndex((item) => item.uid === currentUid);
  const clampedIndex = oldIndex >= 0 ? Math.min(oldIndex, newItems.length - 1) : 0;
  return newItems[clampedIndex]?.uid ?? null;
}

export function syncProcessedSnapshotsWithLiveItems(
  currentSnapshotsByUid: Record<string, TodoItem>,
  items: Array<TodoItem>,
): Record<string, TodoItem> {
  let nextSnapshotsByUid: Record<string, TodoItem> | null = null;

  for (const uid of Object.keys(currentSnapshotsByUid)) {
    const liveItem = items.find((item) => item.uid === uid);
    if (!liveItem) {
      continue;
    }
    const existingSnapshot = (nextSnapshotsByUid ?? currentSnapshotsByUid)[uid];
    if (
      existingSnapshot.uid === liveItem.uid &&
      existingSnapshot.ageDays === liveItem.ageDays &&
      existingSnapshot.deferredDate === liveItem.deferredDate &&
      existingSnapshot.createdTime === liveItem.createdTime &&
      existingSnapshot.text === liveItem.text &&
      existingSnapshot.pageTitle === liveItem.pageTitle
    ) {
      continue;
    }
    nextSnapshotsByUid ??= { ...currentSnapshotsByUid };
    nextSnapshotsByUid[uid] = { ...liveItem };
  }

  return nextSnapshotsByUid ?? currentSnapshotsByUid;
}
