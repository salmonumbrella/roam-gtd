import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { unstable_batchedUpdates } from "react-dom";

import type { WeeklyReviewRoamBlockHandle } from "../components/WeeklyReviewRoamBlock";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import {
  inferTriageCounterActionFromBlock,
  resolveCounterActionFromSnapshot,
  resolveCounterActionFromSync,
  type TriageCounterAction,
} from "../triage/step-logic";
import type { TodoItem } from "../types";
import {
  createInboxZeroWriteQueue,
  recordProcessedAdvance,
  resolveInboxZeroAdvance,
  resolveInboxZeroGoBack,
  resolveMissingCurrentItemUid,
  resolveUnexpectedCurrentUidAfterItemsChange,
  syncProcessedSnapshotsWithLiveItems,
} from "./runtime";

const BLUR_SETTLE_DELAY_MS = 90;
const PULL_RETRY_DELAY_MS = 80;
const REFRESH_DELAY_MS = 300;

interface UseInboxZeroStepRuntimeArgs {
  cacheFormStateRef: MutableRefObject<(uid: string) => void>;
  embedBlockRef: RefObject<WeeklyReviewRoamBlockHandle | null>;
  embedContainerRef: RefObject<HTMLDivElement>;
  goBackRef?: MutableRefObject<(() => void) | null>;
  items: Array<TodoItem>;
  leftPanelRef: RefObject<HTMLDivElement>;
  onAdvance: () => void;
  onAtEndChange?: (atEnd: boolean) => void;
  onIndexChange?: (index: number) => void;
  onProgressChange?: (current: number, total: number) => void;
  restoreFormStateRef: MutableRefObject<(uid?: string) => void>;
  setPendingDelegateUidRef: MutableRefObject<(uid: string | null) => void>;
  setShowDelegatePromptRef: MutableRefObject<(value: boolean) => void>;
  settings: GtdSettings;
  skipItemRef?: MutableRefObject<(() => void) | null>;
  store: ReturnType<typeof createGtdStore>;
  triageRootRef: RefObject<HTMLDivElement>;
}

interface UseInboxZeroStepRuntimeResult {
  advanceWithExpectedRemoval: (targetUid?: string, fallbackText?: string) => void;
  currentCounterAction: TriageCounterAction | null;
  currentItem: TodoItem | null;
  currentItemRef: MutableRefObject<TodoItem | null>;
  currentItemText: string;
  currentItemUid: string | null;
  currentItemUidRef: MutableRefObject<string | null>;
  displayPosition: number;
  enqueueWrite: (task: () => Promise<void>) => void;
  focusBlockEditor: () => boolean;
  handleMissingCurrentItem: (missingUid?: string) => void;
  mountedRef: MutableRefObject<boolean>;
  pullLatestBlockString: (uid: string, fallback?: string) => Promise<string>;
  rememberCounterAction: (uid: string, action: TriageCounterAction) => void;
  scheduleInboxRefreshForUid: (uid: string | null | undefined) => void;
  sessionTotal: number;
  setCounterAction: (uid: string, action: TriageCounterAction | null) => void;
  suppressCounterSyncRef: MutableRefObject<boolean>;
  syncCounterActionForUidRef: MutableRefObject<
    ((uid: string, fallback?: string) => Promise<void>) | null
  >;
}

function buildItemsSignature(items: Array<TodoItem>): string {
  return items.map((item) => item.uid).join("|");
}

function asHtmlElement(element: Element | null): HTMLElement | null {
  if (element == null || element.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  return element as HTMLElement;
}

function isDomNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

function isEditableActiveElement(element: HTMLElement | null): boolean {
  return Boolean(
    element &&
    (element.isContentEditable ||
      element.tagName === "TEXTAREA" ||
      element.classList.contains("rm-block-input")),
  );
}

export function blockExists(uid: string): boolean {
  const data = window.roamAlphaAPI.data.pull("[:block/uid]", [":block/uid", uid]);
  return Boolean(data?.[":block/uid"]);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export function useInboxZeroStepRuntime(
  args: UseInboxZeroStepRuntimeArgs,
): UseInboxZeroStepRuntimeResult {
  const {
    cacheFormStateRef,
    embedBlockRef,
    embedContainerRef,
    goBackRef,
    items,
    leftPanelRef,
    onAdvance,
    onAtEndChange,
    onIndexChange,
    onProgressChange,
    restoreFormStateRef,
    setPendingDelegateUidRef,
    setShowDelegatePromptRef,
    settings,
    skipItemRef,
    store,
    triageRootRef,
  } = args;

  const [currentUid, setCurrentUid] = useState<string | null>(items[0]?.uid ?? null);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [backViewUid, setBackViewUid] = useState<string | null>(null);
  const [counterActionsByUid, setCounterActionsByUid] = useState<
    Record<string, TriageCounterAction>
  >({});
  const [processedSnapshotsByUid, setProcessedSnapshotsByUid] = useState<Record<string, TodoItem>>(
    {},
  );
  const initialStepOneFocusRef = useRef(false);
  const mountedRef = useRef(true);
  const suppressCounterSyncRef = useRef(false);
  const skipInFlightRef = useRef(false);
  const currentUidRef = useRef<string | null>(items[0]?.uid ?? null);
  const backViewUidRef = useRef<string | null>(null);
  const processedUidStackRef = useRef<Array<string>>([]);
  const processedPredecessorRef = useRef(new Map<string, string>());
  const currentItemRef = useRef<TodoItem | null>(null);
  const currentItemUidRef = useRef<string | null>(null);
  const syncCounterActionForUidRef = useRef<typeof syncCounterActionForUid>(null!);
  const lastItemsRef = useRef(items);
  const lastItemsSignatureRef = useRef(buildItemsSignature(items));
  const writeQueueRef = useRef(
    createInboxZeroWriteQueue({
      onError: (error) => {
        // eslint-disable-next-line no-console -- background write failure should not block triage UI
        console.warn("[RoamGTD] Background write failed", error);
      },
    }),
  );

  const currentIndex = currentUid ? items.findIndex((item) => item.uid === currentUid) : -1;
  const effectiveIndex = currentIndex >= 0 ? currentIndex : Math.max(0, items.length - 1);
  const liveItem = items[effectiveIndex] ?? null;
  const currentItem = backViewUid
    ? (items.find((item) => item.uid === backViewUid) ??
      processedSnapshotsByUid[backViewUid] ??
      null)
    : liveItem;
  const currentItemUid = currentItem?.uid ?? null;
  const currentItemText = currentItem?.text ?? "";
  const currentCounterAction = currentItemUid
    ? (counterActionsByUid[currentItemUid] ?? null)
    : null;
  const atEnd = items.length === 0 || effectiveIndex >= items.length - 1;

  const setCounterAction = useCallback((uid: string, action: TriageCounterAction | null): void => {
    setCounterActionsByUid((current) => {
      if (action === null) {
        if (!(uid in current)) {
          return current;
        }
        const next = { ...current };
        delete next[uid];
        return next;
      }
      if (current[uid] === action) {
        return current;
      }
      return { ...current, [uid]: action };
    });
  }, []);

  const rememberCounterAction = useCallback(
    (uid: string, action: TriageCounterAction): void => {
      setCounterAction(uid, action);
    },
    [setCounterAction],
  );

  useEffect(() => {
    onAtEndChange?.(atEnd);
  }, [atEnd, onAtEndChange]);

  useEffect(() => {
    onIndexChange?.(displayPosition);
  }, [displayPosition, onIndexChange]);

  useEffect(() => {
    if (!onProgressChange) {
      return;
    }
    const total = sessionTotal > 0 ? sessionTotal : items.length;
    const current = total > 0 ? Math.min(displayPosition + 1, total) : 0;
    onProgressChange(current, total);
  }, [displayPosition, items.length, onProgressChange, sessionTotal]);

  useEffect(() => {
    if (sessionTotal === 0 && items.length > 0) {
      setSessionTotal(items.length);
    }
  }, [items.length, sessionTotal]);

  useEffect(() => {
    if (currentUidRef.current === null && items.length > 0) {
      const firstUid = items[0].uid;
      currentUidRef.current = firstUid;
      setCurrentUid(firstUid);
    }
  }, [items]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(
    () => () => {
      embedBlockRef.current?.cancelPendingFocus();
    },
    [embedBlockRef],
  );

  useEffect(() => {
    embedBlockRef.current?.cancelPendingFocus();
  }, [currentItemUid, embedBlockRef]);

  const focusBlockEditor = useCallback((): boolean => {
    if (!currentItemUid) {
      return false;
    }
    return embedBlockRef.current?.focusEditor() ?? false;
  }, [currentItemUid, embedBlockRef]);

  useEffect(() => {
    if (!currentItemUid || initialStepOneFocusRef.current) {
      return;
    }
    initialStepOneFocusRef.current = true;
    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    const focusRootIfNeeded = () => {
      const triageRoot = triageRootRef.current;
      const reviewDialog = document.querySelector<HTMLElement>(".roam-gtd-review-dialog");
      if (!triageRoot || !reviewDialog) {
        return;
      }
      const activeElement = asHtmlElement(document.activeElement);
      if (activeElement && reviewDialog.contains(activeElement)) {
        return;
      }
      triageRoot.focus();
    };

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(focusRootIfNeeded);
    });

    return () => {
      if (firstFrameId !== null) {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [currentItemUid, triageRootRef]);

  const advanceToNext = useCallback(
    (
      refresh = false,
      advanceResult = resolveInboxZeroAdvance({
        backViewUid: backViewUidRef.current,
        currentUid: currentUidRef.current,
        items: lastItemsRef.current,
        processedUidStack: processedUidStackRef.current,
      }),
    ) => {
      const cacheUid = backViewUidRef.current ?? currentItemUidRef.current;
      if (cacheUid) {
        cacheFormStateRef.current(cacheUid);
      }
      if (advanceResult.restoreFormStateUid) {
        currentItemUidRef.current = advanceResult.restoreFormStateUid;
        restoreFormStateRef.current(advanceResult.restoreFormStateUid);
      } else {
        restoreFormStateRef.current(undefined);
      }
      currentUidRef.current = advanceResult.nextCurrentUid;
      currentItemUidRef.current = advanceResult.nextBackViewUid ?? advanceResult.nextCurrentUid;
      unstable_batchedUpdates(() => {
        setPendingDelegateUidRef.current(null);
        setShowDelegatePromptRef.current(false);
        setCurrentUid(advanceResult.nextCurrentUid);
        setBackViewUid(advanceResult.nextBackViewUid);
        setDisplayPosition((position) => position + 1);
      });
      if (refresh) {
        onAdvance();
      }
    },
    [
      cacheFormStateRef,
      onAdvance,
      restoreFormStateRef,
      setPendingDelegateUidRef,
      setShowDelegatePromptRef,
    ],
  );

  const advanceWithExpectedRemoval = useCallback(
    (targetUid?: string, fallbackText = "") => {
      const advanceResult = resolveInboxZeroAdvance({
        backViewUid: backViewUidRef.current,
        currentUid: currentUidRef.current,
        items: lastItemsRef.current,
        processedUidStack: processedUidStackRef.current,
      });
      const nextProcessedState = recordProcessedAdvance({
        backViewUid: backViewUidRef.current,
        currentItem: currentItemRef.current,
        fallbackText,
        items: lastItemsRef.current,
        nextCurrentUid: advanceResult.nextCurrentUid,
        processedState: {
          processedPredecessor: processedPredecessorRef.current,
          processedSnapshotsByUid,
          processedUidStack: processedUidStackRef.current,
        },
        targetUid,
      });
      processedUidStackRef.current = nextProcessedState.processedUidStack;
      processedPredecessorRef.current = nextProcessedState.processedPredecessor;
      unstable_batchedUpdates(() => {
        setProcessedSnapshotsByUid(nextProcessedState.processedSnapshotsByUid);
        advanceToNext(false, advanceResult);
      });
    },
    [advanceToNext, processedSnapshotsByUid],
  );

  const scheduleInboxRefreshForUid = useCallback(
    (_uid: string | null | undefined): void => {
      store.scheduleRefresh(settings, REFRESH_DELAY_MS, { scope: "inboxOnly" });
    },
    [settings, store],
  );

  const handleMissingCurrentItem = useCallback(
    (missingUid?: string) => {
      if (missingUid) {
        setCounterAction(missingUid, null);
      }

      const nextUid =
        backViewUidRef.current && currentUidRef.current
          ? currentUidRef.current
          : resolveMissingCurrentItemUid({
              currentUid: currentUidRef.current,
              items: lastItemsRef.current,
            });
      backViewUidRef.current = null;
      currentUidRef.current = nextUid;
      currentItemUidRef.current = nextUid;
      restoreFormStateRef.current(undefined);
      unstable_batchedUpdates(() => {
        setBackViewUid(null);
        setCurrentUid(nextUid);
        setPendingDelegateUidRef.current(null);
        setShowDelegatePromptRef.current(false);
      });
      scheduleInboxRefreshForUid(missingUid);
    },
    [
      restoreFormStateRef,
      scheduleInboxRefreshForUid,
      setCounterAction,
      setPendingDelegateUidRef,
      setShowDelegatePromptRef,
    ],
  );

  const pullLatestBlockString = useCallback(async (uid: string, fallback = ""): Promise<string> => {
    let blockString = fallback;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const data = window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid]);
      blockString = data?.[":block/string"] ?? "";
      if (blockString.length > 0) {
        break;
      }
      if (!mountedRef.current) {
        return blockString;
      }
      await sleep(PULL_RETRY_DELAY_MS);
    }
    return blockString;
  }, []);

  const syncCounterActionForUid = useCallback(
    async (uid: string, fallback = ""): Promise<void> => {
      if (!blockExists(uid)) {
        setCounterAction(uid, null);
        return;
      }
      const blockString = await pullLatestBlockString(uid, fallback);
      if (!mountedRef.current) {
        return;
      }
      const inferredAction = inferTriageCounterActionFromBlock(blockString, settings);
      setCounterActionsByUid((current) => {
        const nextAction = resolveCounterActionFromSync(current[uid], inferredAction);
        if (nextAction === null) {
          if (!(uid in current)) {
            return current;
          }
          const next = { ...current };
          delete next[uid];
          return next;
        }
        if (current[uid] === nextAction) {
          return current;
        }
        return { ...current, [uid]: nextAction };
      });
    },
    [pullLatestBlockString, setCounterAction, settings],
  );

  useLayoutEffect(() => {
    currentUidRef.current = currentUid;
    backViewUidRef.current = backViewUid;
    currentItemRef.current = currentItem;
    currentItemUidRef.current = currentItemUid;
    syncCounterActionForUidRef.current = syncCounterActionForUid;
  }, [backViewUid, currentItem, currentItemUid, currentUid, syncCounterActionForUid]);

  const handleSkipCurrent = useCallback(() => {
    if (skipInFlightRef.current) {
      return;
    }

    const targetItem = currentItem;
    if (!targetItem) {
      advanceToNext();
      return;
    }
    if (!blockExists(targetItem.uid)) {
      handleMissingCurrentItem(targetItem.uid);
      return;
    }

    skipInFlightRef.current = true;
    const activeElement = asHtmlElement(document.activeElement);
    const shouldBlurActiveEditor = isEditableActiveElement(activeElement);

    advanceToNext();
    window.requestAnimationFrame(() => {
      skipInFlightRef.current = false;
    });

    void (async () => {
      if (shouldBlurActiveEditor && activeElement?.isConnected) {
        activeElement.blur();
        await sleep(BLUR_SETTLE_DELAY_MS);
        if (!mountedRef.current) {
          return;
        }
      }
      await syncCounterActionForUid(targetItem.uid, targetItem.text);
    })();
  }, [advanceToNext, currentItem, handleMissingCurrentItem, syncCounterActionForUid]);

  useEffect(() => {
    if (skipItemRef) {
      skipItemRef.current = () => {
        void handleSkipCurrent();
      };
    }
    return () => {
      if (skipItemRef) {
        skipItemRef.current = null;
      }
    };
  }, [handleSkipCurrent, skipItemRef]);

  useEffect(() => {
    let syncTimeoutId: number | null = null;
    const scheduleCounterSync = (delayMs = 80): void => {
      if (syncTimeoutId !== null) {
        window.clearTimeout(syncTimeoutId);
      }
      syncTimeoutId = window.setTimeout(() => {
        syncTimeoutId = null;
        const uid = currentItemUidRef.current;
        if (uid) {
          const item = currentItemRef.current;
          void syncCounterActionForUidRef.current(uid, item?.text ?? "");
        }
      }, delayMs);
    };

    const onEmbedInteraction = (event: Event): void => {
      if (suppressCounterSyncRef.current) {
        return;
      }
      const container = embedContainerRef.current;
      const target = event.target;
      if (!container || !isDomNode(target) || !container.contains(target)) {
        return;
      }
      scheduleCounterSync();
    };

    document.addEventListener("focusout", onEmbedInteraction, true);
    document.addEventListener("click", onEmbedInteraction, true);
    return () => {
      if (syncTimeoutId !== null) {
        window.clearTimeout(syncTimeoutId);
      }
      document.removeEventListener("focusout", onEmbedInteraction, true);
      document.removeEventListener("click", onEmbedInteraction, true);
    };
  }, [embedContainerRef]);

  useEffect(() => {
    if (!currentItemUid) {
      return;
    }

    const snapshotUid = currentItemUid;
    const fallbackText = currentItemText;

    setCounterActionsByUid((current) => {
      const nextAction = resolveCounterActionFromSnapshot(
        current[snapshotUid],
        fallbackText,
        settings,
      );
      if (nextAction === null) {
        if (!(snapshotUid in current)) {
          return current;
        }
        const next = { ...current };
        delete next[snapshotUid];
        return next;
      }
      if (current[snapshotUid] === nextAction) {
        return current;
      }
      return { ...current, [snapshotUid]: nextAction };
    });

    const syncTimeoutId = window.setTimeout(() => {
      void syncCounterActionForUid(snapshotUid, fallbackText);
    }, 140);
    return () => {
      window.clearTimeout(syncTimeoutId);
    };
  }, [currentItemText, currentItemUid, settings, syncCounterActionForUid]);

  useEffect(() => {
    if (!currentItemUid) {
      return;
    }
    const snapshotUid = currentItemUid;
    const fallbackText = currentItemText;

    const onWindowFocus = () => {
      if (!blockExists(snapshotUid)) {
        handleMissingCurrentItem(snapshotUid);
        return;
      }
      void syncCounterActionForUid(snapshotUid, fallbackText);
    };

    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [currentItemText, currentItemUid, handleMissingCurrentItem, syncCounterActionForUid]);

  useEffect(() => {
    if (goBackRef) {
      goBackRef.current = () => {
        const uid = currentItemUidRef.current;
        if (uid) {
          cacheFormStateRef.current(uid);
        }
        const goBackResult = resolveInboxZeroGoBack({
          backViewUid: backViewUidRef.current,
          currentUid: currentUidRef.current,
          items: lastItemsRef.current,
          processedPredecessor: processedPredecessorRef.current,
          processedUidStack: processedUidStackRef.current,
        });
        if (!goBackResult) {
          return;
        }
        currentItemUidRef.current = goBackResult.restoreFormStateUid;
        currentUidRef.current = goBackResult.nextCurrentUid;
        restoreFormStateRef.current(goBackResult.restoreFormStateUid);
        unstable_batchedUpdates(() => {
          setCurrentUid(goBackResult.nextCurrentUid);
          setBackViewUid(goBackResult.nextBackViewUid);
          setDisplayPosition((position) => Math.max(0, position - 1));
        });
      };
    }
    return () => {
      if (goBackRef) {
        goBackRef.current = null;
      }
    };
  }, [cacheFormStateRef, goBackRef, restoreFormStateRef]);

  useLayoutEffect(() => {
    const nextSignature = buildItemsSignature(items);
    if (nextSignature !== lastItemsSignatureRef.current) {
      const newUid = resolveUnexpectedCurrentUidAfterItemsChange({
        backViewUid: backViewUidRef.current,
        currentUid: currentUidRef.current,
        newItems: items,
        oldItems: lastItemsRef.current,
        processedUidStack: processedUidStackRef.current,
      });
      if (newUid !== undefined) {
        currentUidRef.current = newUid;
        currentItemUidRef.current = newUid;
        setCurrentUid(newUid);
      }
      lastItemsSignatureRef.current = nextSignature;
    }

    setProcessedSnapshotsByUid((current) => syncProcessedSnapshotsWithLiveItems(current, items));

    lastItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    leftPanelRef.current?.scrollTo({ top: 0 });
  }, [currentItem?.uid, leftPanelRef]);

  return {
    advanceWithExpectedRemoval,
    currentCounterAction,
    currentItem,
    currentItemRef,
    currentItemText,
    currentItemUid,
    currentItemUidRef,
    displayPosition,
    enqueueWrite: (task) => {
      writeQueueRef.current.enqueue(task);
    },
    focusBlockEditor,
    handleMissingCurrentItem,
    mountedRef,
    pullLatestBlockString,
    rememberCounterAction,
    scheduleInboxRefreshForUid,
    sessionTotal,
    setCounterAction,
    suppressCounterSyncRef,
    syncCounterActionForUidRef,
  };
}
