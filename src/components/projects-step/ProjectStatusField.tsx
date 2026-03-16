import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getNextStatusMenuIndex,
  getStatusBadgeSelectState,
  parseStatusTag,
} from "../../projects-step/support";
import type { ProjectSummary } from "../../types";
import { asHtmlElement } from "../WeeklyReviewRoamBlock";

function getNormalizedKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function StatusBadge({ label }: { label: string }) {
  const tag = parseStatusTag(label);
  if (tag) {
    return (
      <span
        className="gtd-status-badge rm-page-ref rm-page-ref--tag"
        data-link-uid=""
        data-tag={tag.dataTag}
        style={{ pointerEvents: "none" }}
        tabIndex={-1}
      >
        {tag.displayLabel}
      </span>
    );
  }

  return (
    <span
      className="bp3-tag bp3-minimal gtd-status-badge"
      style={{
        alignItems: "center",
        color: "#A5A5A5",
        display: "inline-flex",
        fontSize: 11,
        fontWeight: 600,
        justifyContent: "center",
        letterSpacing: 0.3,
      }}
    >
      {label}
    </span>
  );
}

export function ProjectStatusField({
  buttonRef,
  emptyLabel,
  onChangeStatus,
  onFocusButton,
  onRequestAdvanceFocus,
  onRequestDismissFocus,
  options,
  project,
}: {
  buttonRef?: (node: HTMLButtonElement | null) => void;
  emptyLabel: string;
  onChangeStatus: (project: ProjectSummary, nextStatus: string) => boolean;
  onFocusButton?: () => void;
  onRequestAdvanceFocus?: (direction: "backward" | "forward") => void;
  onRequestDismissFocus?: () => void;
  options: Array<string>;
  project: ProjectSummary;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonElementRef = useRef<HTMLButtonElement | null>(null);
  const optionButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { badgeLabel, selectOptions, selectValue } = useMemo(
    () =>
      getStatusBadgeSelectState({
        options,
        status: project.statusText,
        unknownLabel: emptyLabel,
      }),
    [emptyLabel, options, project.statusText],
  );
  const [highlightedIndex, setHighlightedIndex] = useState(() => {
    const selectedIndex = selectOptions.findIndex((option) => option.value === selectValue);
    return selectedIndex >= 0 ? selectedIndex : 0;
  });

  useEffect(() => {
    optionButtonRefs.current.length = selectOptions.length;
  }, [selectOptions.length]);

  const syncHighlightedIndex = useCallback(() => {
    const selectedIndex = selectOptions.findIndex((option) => option.value === selectValue);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [selectOptions, selectValue]);

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      optionButtonRefs.current[highlightedIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [highlightedIndex, isOpen]);

  const setButtonNode = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonElementRef.current = node;
      buttonRef?.(node);
    },
    [buttonRef],
  );

  const focusButton = useCallback(() => {
    window.requestAnimationFrame(() => {
      buttonElementRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      const target = asHtmlElement(event.target);
      if (target && containerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const activeElement = asHtmlElement(document.activeElement);
      if (activeElement && !containerRef.current?.contains(activeElement)) {
        return;
      }

      const normalizedKey = getNormalizedKey(event.key);
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (normalizedKey === "p" || normalizedKey === "k")
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setHighlightedIndex((current) =>
          getNextStatusMenuIndex(current, selectOptions.length, "backward"),
        );
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (normalizedKey === "n" || normalizedKey === "j")
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setHighlightedIndex((current) =>
          getNextStatusMenuIndex(current, selectOptions.length, "forward"),
        );
        return;
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, selectOptions.length]);

  const handleSelectStatus = useCallback(
    (nextStatus: string) => {
      setIsOpen(false);
      onChangeStatus(project, nextStatus);
    },
    [onChangeStatus, project],
  );

  const moveHighlightedOption = useCallback(
    (direction: "backward" | "forward") => {
      setHighlightedIndex((current) =>
        getNextStatusMenuIndex(current, selectOptions.length, direction),
      );
    },
    [selectOptions.length],
  );

  const handleOptionKeyboardSelect = useCallback(
    (optionValue: string, focusTarget: "button" | "dismiss") => {
      handleSelectStatus(optionValue);
      if (focusTarget === "dismiss") {
        onRequestDismissFocus?.();
        return;
      }
      focusButton();
    },
    [focusButton, handleSelectStatus, onRequestDismissFocus],
  );

  const handleButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Tab") {
        event.preventDefault();
        onRequestAdvanceFocus?.(event.shiftKey ? "backward" : "forward");
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        if (selectOptions.length === 0) {
          return;
        }
        syncHighlightedIndex();
        setIsOpen(true);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (selectOptions.length === 0) {
          return;
        }
        setHighlightedIndex(selectOptions.length - 1);
        setIsOpen(true);
      }
    },
    [onRequestAdvanceFocus, selectOptions.length, syncHighlightedIndex],
  );

  const handleOptionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, optionIndex: number, optionValue: string) => {
      const normalizedKey = getNormalizedKey(event.key);
      const moveBackward =
        ((event.ctrlKey || event.metaKey) && (normalizedKey === "p" || normalizedKey === "k")) ||
        event.key === "ArrowUp";
      const moveForward =
        ((event.ctrlKey || event.metaKey) && (normalizedKey === "n" || normalizedKey === "j")) ||
        event.key === "ArrowDown";

      if (moveBackward) {
        event.preventDefault();
        moveHighlightedOption("backward");
        return;
      }
      if (moveForward) {
        event.preventDefault();
        moveHighlightedOption("forward");
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        handleOptionKeyboardSelect(optionValue, event.shiftKey ? "button" : "dismiss");
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleOptionKeyboardSelect(optionValue, "dismiss");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        focusButton();
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setHighlightedIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setHighlightedIndex(selectOptions.length - 1);
        return;
      }
      if (optionIndex < 0 || optionIndex >= selectOptions.length) {
        return;
      }
    },
    [focusButton, handleOptionKeyboardSelect, moveHighlightedOption, selectOptions.length],
  );

  return (
    <div className="gtd-project-status" ref={containerRef}>
      <button
        className="bp3-button bp3-minimal bp3-small gtd-project-top-control"
        data-open={isOpen ? "true" : "false"}
        onClick={() => {
          if (selectOptions.length === 0) {
            return;
          }
          syncHighlightedIndex();
          setIsOpen((current) => !current);
        }}
        onFocus={onFocusButton}
        onKeyDown={handleButtonKeyDown}
        ref={setButtonNode}
        type="button"
      >
        <StatusBadge label={badgeLabel} />
      </button>
      {isOpen && selectOptions.length > 0 ? (
        <div className="gtd-project-status-menu" role="menu">
          {selectOptions.map((option, optionIndex) => (
            <button
              className="gtd-project-status-option"
              data-highlighted={optionIndex === highlightedIndex ? "true" : "false"}
              data-selected={option.value === selectValue ? "true" : "false"}
              key={option.value}
              onClick={() => {
                handleSelectStatus(option.value);
                onRequestDismissFocus?.();
              }}
              onKeyDown={(event) => handleOptionKeyDown(event, optionIndex, option.value)}
              ref={(node) => {
                optionButtonRefs.current[optionIndex] = node;
              }}
              role="menuitemradio"
              type="button"
            >
              <StatusBadge label={option.label} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
