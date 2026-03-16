import React, { useEffect, useRef, useState } from "react";

const ELEMENT_NODE = 1;

type WeeklyReviewNativeRenderBlockInput = {
  el: HTMLElement;
  open?: boolean;
  "open?"?: boolean;
  uid: string;
  "zoom-path?": boolean;
  zoomPath?: boolean;
} & Record<string, unknown>;

export interface WeeklyReviewNativeBlockProps {
  className?: string;
  open?: boolean;
  style?: React.CSSProperties;
  uid: string;
}

export function getWeeklyReviewNativeBlockRenderInput(args: {
  el: HTMLElement;
  open?: boolean;
  uid: string;
}): WeeklyReviewNativeRenderBlockInput {
  const { el, open, uid } = args;
  return {
    el,
    ...(typeof open === "boolean" ? { open, "open?": open } : {}),
    uid,
    "zoom-path?": false,
    zoomPath: false,
  };
}

function isElementNode(node: Node | null): node is Element {
  return node?.nodeType === ELEMENT_NODE;
}

function containsAttributeRef(node: Node | null): boolean {
  if (!isElementNode(node)) {
    return false;
  }
  const element = node as Partial<Pick<Element, "matches" | "querySelector">>;
  return (
    (typeof element.matches === "function" && element.matches("span.rm-attr-ref")) ||
    (typeof element.querySelector === "function" &&
      element.querySelector("span.rm-attr-ref") !== null)
  );
}

export function shouldRefreshAttributeSelectForMutations(
  mutations: ReadonlyArray<Pick<MutationRecord, "addedNodes" | "removedNodes" | "target">>,
): boolean {
  return mutations.some((mutation) => {
    if (containsAttributeRef(mutation.target)) {
      return true;
    }
    return (
      Array.from(mutation.addedNodes).some((node) => containsAttributeRef(node)) ||
      Array.from(mutation.removedNodes).some((node) => containsAttributeRef(node))
    );
  });
}

export function WeeklyReviewNativeBlock({
  className,
  open,
  style,
  uid,
}: WeeklyReviewNativeBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let contentObserver: MutationObserver | null = new MutationObserver(() => {
      if (container.querySelector(".rm-block-main")) {
        setShowSkeleton(false);
        contentObserver?.disconnect();
        contentObserver = null;
      }
    });
    contentObserver.observe(container, { childList: true, subtree: true });

    let mutationObserver: MutationObserver | null = null;
    let retriggering = false;
    let refreshTimeoutId: number | null = null;

    // Full refresh: reload attribute definitions and recreate the workbench observer.
    // Used on initial render only — expensive because it rescans the entire document.
    const scheduleAttributeSelectRefresh = () => {
      const refreshAttributeSelect = window.roamjs?.extension?.workbench?.refreshAttributeSelect;
      if (typeof refreshAttributeSelect !== "function" || refreshTimeoutId !== null) {
        return;
      }
      refreshTimeoutId = window.setTimeout(() => {
        refreshTimeoutId = null;
        if (containerRef.current === container) {
          refreshAttributeSelect();
        }
      }, 0);
    };

    // Fast retrigger: when Roam's renderBlock re-renders content (e.g. after a
    // status change via the workbench attribute-select), the old rm-attr-ref spans
    // (with their attribute-select buttons) are destroyed and new bare spans are
    // created. The workbench's MutationObserver on document.body may miss these new
    // spans if they arrive as descendants of a replaced subtree rather than as direct
    // addedNodes. Re-inserting the unprocessed spans makes them appear as direct
    // additions that the observer reliably detects, eliminating the visible blink.
    const retriggerUnprocessedAttributeRefs = () => {
      const unprocessed = container.querySelectorAll(
        "span.rm-attr-ref:not([data-roamjs-attribute-select])",
      );
      if (unprocessed.length === 0) {
        return;
      }
      retriggering = true;
      for (const span of unprocessed) {
        const parent = span.parentNode;
        if (parent) {
          const next = span.nextSibling;
          parent.removeChild(span);
          parent.insertBefore(span, next);
        }
      }
      window.setTimeout(() => {
        retriggering = false;
      }, 0);
    };

    mutationObserver = new MutationObserver((mutations) => {
      if (retriggering) {
        return;
      }
      if (shouldRefreshAttributeSelectForMutations(mutations)) {
        retriggerUnprocessedAttributeRefs();
      }
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    });

    container.replaceChildren();
    const timeoutId = window.setTimeout(() => {
      if (containerRef.current === container) {
        window.roamAlphaAPI.ui.components.renderBlock(
          getWeeklyReviewNativeBlockRenderInput({ el: container, open, uid }),
        );
        scheduleAttributeSelectRefresh();
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      contentObserver?.disconnect();
      mutationObserver?.disconnect();
      if (refreshTimeoutId !== null) {
        window.clearTimeout(refreshTimeoutId);
      }
      setShowSkeleton(true);
      container.replaceChildren();
    };
  }, [open, uid]);

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      {showSkeleton ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
          {["75%", "60%", "50%", "65%"].map((width) => (
            <div key={width} style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <div
                className="gtd-skeleton"
                style={{ borderRadius: 3, flexShrink: 0, height: 16, width: 16 }}
              />
              <div className="gtd-skeleton" style={{ borderRadius: 4, height: 16, width }} />
            </div>
          ))}
        </div>
      ) : null}
      <div ref={containerRef} />
    </div>
  );
}
