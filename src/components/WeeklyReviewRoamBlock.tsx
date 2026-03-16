import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { setBlockViewType } from "../roam-ui-utils";

const EDITOR_INPUT_RETRY_ATTEMPTS = 90;
const MAX_FOCUS_RETRY_ATTEMPTS = 120;
const EMBED_CLICK_TARGET_SELECTORS = [
  ".rm-block__input",
  ".rm-block-main .rm-block-text",
  ".rm-block-main",
  ".roam-block",
  ".roam-block-container",
  "[data-uid]",
] as const;
export const WEEKLY_REVIEW_BLOCK_INPUT_SELECTOR = ".rm-block-input, .rm-block__input";

interface RoamFocusLocation {
  "block-uid": string;
  "window-id"?: string;
}

interface RoamFocusInput {
  location: RoamFocusLocation;
  selection?: {
    end: number;
    start: number;
  };
}

export interface WeeklyReviewRoamBlockHandle {
  cancelPendingFocus: () => void;
  focusEditor: () => boolean;
  getContainer: () => HTMLDivElement | null;
}

export interface WeeklyReviewRoamBlockProps {
  className?: string;
  containerRef?: React.Ref<HTMLDivElement | null>;
  loadingPlaceholderMode?: "always" | "initial-only" | "never";
  onBlurOutside?: (uid: string) => void;
  onContentReady?: () => void;
  preservePreviousContentOnUidChange?: boolean;
  style?: React.CSSProperties;
  suppressChildControlNavigation?: boolean;
  uid: string;
}

function setMaybeRef<T>(ref: React.Ref<T | null> | undefined, value: T | null): void {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as React.MutableRefObject<T | null>).current = value;
}

export function asHtmlElement(value: EventTarget | null): HTMLElement | null {
  if (value == null || typeof value !== "object" || !("nodeType" in value)) {
    return null;
  }
  return value.nodeType === Node.ELEMENT_NODE ? (value as HTMLElement) : null;
}

export function isWeeklyReviewEditableElement(element: Element | null): element is HTMLElement {
  if (element == null || element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  const htmlElement = element as HTMLElement;
  if (
    htmlElement.isContentEditable ||
    htmlElement.classList.contains("rm-block-input") ||
    htmlElement.classList.contains("rm-block__input")
  ) {
    return true;
  }
  const tagName = htmlElement.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function isWeeklyReviewBlockEditorElement(element: Element | null): element is HTMLElement {
  return Boolean(
    element &&
    isWeeklyReviewEditableElement(element) &&
    (element.classList.contains("rm-block-input") || element.classList.contains("rm-block__input")),
  );
}

export function shouldRetainFocusedBlockEditor(args: {
  activeElement: Element | null;
  container: HTMLElement | null;
}): args is { activeElement: HTMLElement; container: HTMLElement } {
  const { activeElement, container } = args;
  return Boolean(
    container &&
    activeElement &&
    container.contains(activeElement) &&
    isWeeklyReviewBlockEditorElement(activeElement),
  );
}

function isDomNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

function isElementNode(value: unknown): value is Element {
  return isDomNode(value) && value.nodeType === Node.ELEMENT_NODE;
}

export function shouldSuppressChildControlNavigation(args: {
  container: HTMLElement | null;
  rootUid: string | null;
  suppressChildControlNavigation?: boolean;
  target: EventTarget | null;
}): boolean {
  const { container, rootUid, suppressChildControlNavigation = true, target } = args;
  if (!suppressChildControlNavigation) {
    return false;
  }
  if (!container || !rootUid || !isElementNode(target)) {
    return false;
  }
  const targetElement = asHtmlElement(target);
  if (!targetElement || !container.contains(targetElement)) {
    return false;
  }
  const targetBlockElement = targetElement.closest<HTMLElement>("[data-uid]");
  const targetUid = targetBlockElement?.getAttribute("data-uid");
  return Boolean(targetUid && targetUid !== rootUid);
}

function moveCaretToEndIfInputLike(element: HTMLElement): void {
  if (!("value" in element)) {
    return;
  }
  const inputLike = element as HTMLElement & {
    setSelectionRange?: (start: number, end: number) => void;
    value?: unknown;
  };
  if (typeof inputLike.value !== "string") {
    return;
  }
  const end = inputLike.value.length;
  inputLike.setSelectionRange?.(end, end);
}

function isViewModeBlockInput(element: HTMLElement): boolean {
  return (
    element.classList.contains("rm-block__input") &&
    !element.classList.contains("rm-block-input") &&
    !element.isContentEditable
  );
}

function getEmbedClickTarget(container: HTMLElement): HTMLElement | null {
  for (const selector of EMBED_CLICK_TARGET_SELECTORS) {
    const match = container.querySelector<HTMLElement>(selector);
    if (match) {
      return match;
    }
  }

  return asHtmlElement(container.firstElementChild);
}

function dispatchSyntheticClickSequence(element: HTMLElement): void {
  element.focus?.();
  element.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }),
  );
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, cancelable: true }));
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }));
}

function focusRenderedBlockInput(
  container: HTMLElement,
  options: {
    attemptsLeft?: number;
    onExhausted?: () => void;
    shouldContinue?: () => boolean;
  } = {},
): void {
  const attemptsLeft = options.attemptsLeft ?? EDITOR_INPUT_RETRY_ATTEMPTS;
  const shouldContinue = options.shouldContinue ?? (() => true);
  if (!shouldContinue()) {
    return;
  }
  const input = container.querySelector<HTMLElement>(WEEKLY_REVIEW_BLOCK_INPUT_SELECTOR);
  if (input) {
    if (isViewModeBlockInput(input)) {
      if (attemptsLeft <= 0) {
        options.onExhausted?.();
        return;
      }
      dispatchSyntheticClickSequence(input);
      window.requestAnimationFrame(() =>
        focusRenderedBlockInput(container, {
          attemptsLeft: attemptsLeft - 1,
          onExhausted: options.onExhausted,
          shouldContinue,
        }),
      );
      return;
    }
    input.focus();
    moveCaretToEndIfInputLike(input);
    return;
  }
  if (attemptsLeft <= 0) {
    options.onExhausted?.();
    return;
  }
  window.requestAnimationFrame(() =>
    focusRenderedBlockInput(container, {
      attemptsLeft: attemptsLeft - 1,
      onExhausted: options.onExhausted,
      shouldContinue,
    }),
  );
}

function trySetRoamBlockFocus(uid: string): void {
  const ui = window.roamAlphaAPI.ui as typeof window.roamAlphaAPI.ui & {
    setBlockFocusAndSelection?: (input: RoamFocusInput) => Promise<void> | void;
  };
  const setBlockFocusAndSelection = ui.setBlockFocusAndSelection;
  if (typeof setBlockFocusAndSelection !== "function") {
    return;
  }

  const blockData = window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", uid]);
  const blockText = blockData?.[":block/string"] ?? "";
  const caret = blockText.length;
  try {
    const maybePromise = setBlockFocusAndSelection({
      location: { "block-uid": uid },
      selection: {
        end: caret,
        start: caret,
      },
    });
    if (maybePromise && typeof (maybePromise as PromiseLike<void>).then === "function") {
      void (maybePromise as Promise<void>).catch(() => {
        // Ignore focus failures in the fallback path.
      });
    }
  } catch {
    // Ignore focus failures in the fallback path.
  }
}

export const WeeklyReviewRoamBlock = React.forwardRef<
  WeeklyReviewRoamBlockHandle,
  WeeklyReviewRoamBlockProps
>(function WeeklyReviewRoamBlock(
  {
    className,
    containerRef,
    loadingPlaceholderMode = "always",
    onBlurOutside,
    onContentReady,
    preservePreviousContentOnUidChange = false,
    style,
    suppressChildControlNavigation = true,
    uid,
  },
  forwardedRef,
) {
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const focusRequestIdRef = useRef(0);
  const focusRetryFrameRef = useRef<number | null>(null);
  const renderToken = useMemo(() => Symbol(uid), [uid]);
  const [hasRenderedContent, setHasRenderedContent] = useState(false);
  const [loadedRenderToken, setLoadedRenderToken] = useState<symbol | null>(null);
  const isContentReady = loadedRenderToken === renderToken;
  const showSkeleton =
    loadingPlaceholderMode !== "never" &&
    !isContentReady &&
    (loadingPlaceholderMode === "always" || !hasRenderedContent);

  useEffect(() => {
    if (isContentReady && onContentReady) {
      onContentReady();
    }
  }, [isContentReady]); // eslint-disable-line react-hooks/exhaustive-deps -- fire once on transition

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerElRef.current = node;
      setMaybeRef(containerRef, node);
    },
    [containerRef],
  );

  const cancelPendingFocus = useCallback(() => {
    focusRequestIdRef.current += 1;
    if (focusRetryFrameRef.current !== null) {
      window.cancelAnimationFrame(focusRetryFrameRef.current);
      focusRetryFrameRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      cancelPendingFocus();
    },
    [cancelPendingFocus],
  );

  useEffect(() => {
    const container = containerElRef.current;
    return () => {
      container?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    cancelPendingFocus();
  }, [cancelPendingFocus, uid]);

  useEffect(() => {
    const onPointerDown = (): void => {
      cancelPendingFocus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [cancelPendingFocus]);

  const focusEditor = useCallback((): boolean => {
    const container = containerElRef.current;
    if (!container || !uid) {
      return false;
    }

    cancelPendingFocus();

    const requestId = focusRequestIdRef.current + 1;
    focusRequestIdRef.current = requestId;
    const isStale = (): boolean => focusRequestIdRef.current !== requestId;

    const attemptFocus = (attemptsLeft: number): void => {
      if (isStale()) {
        return;
      }
      const activeElement = asHtmlElement(document.activeElement);
      if (shouldRetainFocusedBlockEditor({ activeElement, container })) {
        moveCaretToEndIfInputLike(activeElement as HTMLElement);
        return;
      }
      if (activeElement && isWeeklyReviewBlockEditorElement(activeElement)) {
        if (!container.contains(activeElement)) {
          activeElement.blur();
        }
      }

      const existingInput = container.querySelector<HTMLElement>(
        WEEKLY_REVIEW_BLOCK_INPUT_SELECTOR,
      );
      if (existingInput) {
        if (
          activeElement &&
          activeElement !== existingInput &&
          isWeeklyReviewEditableElement(activeElement)
        ) {
          activeElement.blur();
        }
        if (isViewModeBlockInput(existingInput)) {
          dispatchSyntheticClickSequence(existingInput);
          focusRenderedBlockInput(container, {
            attemptsLeft: MAX_FOCUS_RETRY_ATTEMPTS,
            onExhausted: () => {
              if (!isStale()) {
                trySetRoamBlockFocus(uid);
              }
            },
            shouldContinue: () => !isStale(),
          });
          return;
        }
        existingInput.focus();
        moveCaretToEndIfInputLike(existingInput);
        return;
      }

      const clickTarget = getEmbedClickTarget(container);
      if (!clickTarget) {
        if (attemptsLeft <= 0) {
          trySetRoamBlockFocus(uid);
          focusRenderedBlockInput(container, {
            attemptsLeft: MAX_FOCUS_RETRY_ATTEMPTS,
            onExhausted: () => {
              if (!isStale()) {
                trySetRoamBlockFocus(uid);
              }
            },
            shouldContinue: () => !isStale(),
          });
          return;
        }
        focusRetryFrameRef.current = window.requestAnimationFrame(() => {
          focusRetryFrameRef.current = null;
          attemptFocus(attemptsLeft - 1);
        });
        return;
      }

      dispatchSyntheticClickSequence(clickTarget);
      focusRenderedBlockInput(container, {
        attemptsLeft: MAX_FOCUS_RETRY_ATTEMPTS,
        onExhausted: () => {
          if (!isStale()) {
            trySetRoamBlockFocus(uid);
          }
        },
        shouldContinue: () => !isStale(),
      });
    };

    focusRetryFrameRef.current = window.requestAnimationFrame(() => {
      focusRetryFrameRef.current = null;
      attemptFocus(MAX_FOCUS_RETRY_ATTEMPTS);
    });
    return true;
  }, [cancelPendingFocus, uid]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      cancelPendingFocus,
      focusEditor,
      getContainer: () => containerElRef.current,
    }),
    [cancelPendingFocus, focusEditor],
  );

  useEffect(() => {
    const container = containerElRef.current;
    if (!container) {
      return;
    }
    const renderHost = document.createElement("div");
    if (!preservePreviousContentOnUidChange) {
      container.replaceChildren();
    }
    container.append(renderHost);
    const renderBlockInput = {
      el: renderHost,
      uid,
      "zoom-path?": false,
      zoomPath: false,
    } as { el: HTMLElement; uid: string; "zoom-path?": boolean } & Record<string, unknown>;
    let renderHostIsReady = false;
    const observer = new MutationObserver(() => {
      if (renderHost.querySelector(".rm-block-main")) {
        renderHostIsReady = true;
        for (const child of Array.from(container.children)) {
          if (child !== renderHost) {
            child.remove();
          }
        }
        setLoadedRenderToken(renderToken);
        setHasRenderedContent(true);
        observer.disconnect();
      }
    });
    observer.observe(renderHost, { childList: true, subtree: true });

    // Non-outline block-view-types (e.g. "side", "tabs") prevent children from
    // rendering in embedded blocks. Temporarily force outline mode so child
    // blocks are visible and editable, then restore the original on cleanup.
    let originalViewType: string | null = null;
    let isCancelled = false;
    const blockData = window.roamAlphaAPI.data.pull("[:block/view-type]", [":block/uid", uid]);
    const viewType = (blockData as Record<string, string> | null)?.[":block/view-type"];
    const needsViewTypeReset = viewType != null && viewType !== ":outline";

    let renderTimeoutId: number | undefined;
    if (needsViewTypeReset) {
      originalViewType = viewType.replace(/^:/, "") as string;
      void setBlockViewType(uid, "outline").then(() => {
        if (!isCancelled && containerElRef.current === container) {
          renderTimeoutId = window.setTimeout(() => {
            if (!isCancelled && containerElRef.current === container) {
              window.roamAlphaAPI.ui.components.renderBlock(renderBlockInput);
            }
          }, 0);
        }
      });
    } else {
      renderTimeoutId = window.setTimeout(() => {
        if (!isCancelled && containerElRef.current === container) {
          window.roamAlphaAPI.ui.components.renderBlock(renderBlockInput);
        }
      }, 0);
    }

    return () => {
      isCancelled = true;
      if (renderTimeoutId != null) {
        window.clearTimeout(renderTimeoutId);
      }
      observer.disconnect();
      if (!preservePreviousContentOnUidChange || !renderHostIsReady) {
        renderHost.remove();
      }
      if (originalViewType) {
        void setBlockViewType(uid, originalViewType as "side" | "tabs" | "vertical" | "horizontal");
      }
    };
  }, [preservePreviousContentOnUidChange, renderToken, uid]);

  useEffect(() => {
    const handleSuppressedChildControlNavigation = (event: Event): void => {
      if (
        !shouldSuppressChildControlNavigation({
          container: containerElRef.current,
          rootUid: uid,
          suppressChildControlNavigation,
          target: event.target,
        })
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    window.addEventListener("pointerdown", handleSuppressedChildControlNavigation, true);
    window.addEventListener("mousedown", handleSuppressedChildControlNavigation, true);
    window.addEventListener("click", handleSuppressedChildControlNavigation, true);
    return () => {
      window.removeEventListener("pointerdown", handleSuppressedChildControlNavigation, true);
      window.removeEventListener("mousedown", handleSuppressedChildControlNavigation, true);
      window.removeEventListener("click", handleSuppressedChildControlNavigation, true);
    };
  }, [suppressChildControlNavigation, uid]);

  useEffect(() => {
    if (!onBlurOutside) {
      return;
    }
    const container = containerElRef.current;
    if (!container) {
      return;
    }

    const timeoutIds = new Set<number>();
    const handleFocusOut = (event: FocusEvent): void => {
      const targetElement = asHtmlElement(event.target);
      if (!targetElement || !container.contains(targetElement)) {
        return;
      }
      if (!container.querySelector(WEEKLY_REVIEW_BLOCK_INPUT_SELECTOR)) {
        return;
      }
      const nextTarget = asHtmlElement(event.relatedTarget);
      if (nextTarget && container.contains(nextTarget)) {
        return;
      }
      const timeoutId = window.setTimeout(() => {
        timeoutIds.delete(timeoutId);
        onBlurOutside(uid);
      }, 0);
      timeoutIds.add(timeoutId);
    };

    container.addEventListener("focusout", handleFocusOut, true);
    return () => {
      container.removeEventListener("focusout", handleFocusOut, true);
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      timeoutIds.clear();
    };
  }, [onBlurOutside, uid]);

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      {showSkeleton ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
          <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <div
              className="gtd-skeleton"
              style={{ borderRadius: 3, flexShrink: 0, height: 16, width: 16 }}
            />
            <div className="gtd-skeleton" style={{ borderRadius: 4, height: 16, width: "70%" }} />
          </div>
          <div
            className="gtd-skeleton"
            style={{ borderRadius: 4, height: 16, marginLeft: 24, width: "55%" }}
          />
        </div>
      ) : null}
      <div ref={setContainerRef} />
    </div>
  );
});
