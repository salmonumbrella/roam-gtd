import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import { SCHEDULE_POPOVER_ID } from "../components/SchedulePopover";
import {
  acceptAutocompleteSelectionOnTab,
  focusTriageTabStop,
  getEnabledTriageTabOrder,
  getNextTriageTabStop,
  isAutocompleteFieldElement,
  resolveAutocompleteContextTabStop,
  type TriageTabStop,
} from "../triage/form-helpers";

interface UseWorkflowProcessPopoverKeyboardArgs {
  anchorElement: HTMLElement | null;
  isOpen: boolean;
  onCancel: () => void;
  popoverRef: MutableRefObject<HTMLDivElement | null>;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}

type WorkflowProcessKeyboardEvent = KeyboardEvent & {
  roamGtdSyntheticEscape?: boolean;
};

function asHtmlElement(value: EventTarget | null): HTMLElement | null {
  return value &&
    typeof value === "object" &&
    "nodeType" in value &&
    value.nodeType === Node.ELEMENT_NODE
    ? (value as HTMLElement)
    : null;
}

export function useWorkflowProcessPopoverKeyboard({
  anchorElement,
  isOpen,
  onCancel,
  popoverRef,
  rootRef,
}: UseWorkflowProcessPopoverKeyboardArgs) {
  const lastTabStopRef = useRef<TriageTabStop | null>(null);

  const rememberTabStop = useCallback((tabStop: TriageTabStop) => {
    lastTabStopRef.current = tabStop;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (popoverRef.current?.contains(target)) {
        return;
      }
      if (anchorElement?.contains(target)) {
        return;
      }
      if ((target as Element).closest?.(".roamjs-autocomplete-input")) {
        return;
      }
      onCancel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorElement, isOpen, onCancel, popoverRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onFieldKeyDown = (event: KeyboardEvent): void => {
      const activeElement = document.activeElement;
      if (!isAutocompleteFieldElement(activeElement)) {
        return;
      }

      if ((event as WorkflowProcessKeyboardEvent).roamGtdSyntheticEscape) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const tabStop = resolveAutocompleteContextTabStop(activeElement);
        if (tabStop) {
          rememberTabStop(tabStop);
        }
        const syntheticEscapeEvent = new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }) as WorkflowProcessKeyboardEvent;
        syntheticEscapeEvent.roamGtdSyntheticEscape = true;
        activeElement.dispatchEvent(syntheticEscapeEvent);
        activeElement.blur();
        rootRef.current?.focus();
        return;
      }

      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      const key = event.key.toLowerCase();
      const mappedKey =
        key === "n" || key === "j" ? "ArrowDown" : key === "p" || key === "k" ? "ArrowUp" : null;
      if (!mappedKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: mappedKey,
        }),
      );
    };

    document.addEventListener("keydown", onFieldKeyDown, true);
    return () => document.removeEventListener("keydown", onFieldKeyDown, true);
  }, [isOpen, rememberTabStop, rootRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onTabKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const reviewDialog = document.querySelector<HTMLElement>(".roam-gtd-review-dialog");
      if (!reviewDialog) {
        return;
      }

      const active = asHtmlElement(document.activeElement);
      const eventTarget = asHtmlElement(event.target);
      const activeInsideRoot = Boolean(active && popoverRef.current?.contains(active));
      const targetInsideRoot = Boolean(eventTarget && popoverRef.current?.contains(eventTarget));
      if (!activeInsideRoot && !targetInsideRoot) {
        return;
      }

      const schedulePopover = document.getElementById(SCHEDULE_POPOVER_ID);
      if (
        (active && schedulePopover?.contains(active)) ||
        (eventTarget && schedulePopover?.contains(eventTarget))
      ) {
        return;
      }

      let activeStop = active ? resolveAutocompleteContextTabStop(active) : null;
      if (!activeStop) {
        if (lastTabStopRef.current) {
          activeStop = lastTabStopRef.current;
          lastTabStopRef.current = null;
        } else if (active && !reviewDialog.contains(active)) {
          return;
        }
      }

      const tabOrder = getEnabledTriageTabOrder();
      if (tabOrder.length === 0) {
        return;
      }
      const targetStop = getNextTriageTabStop(activeStop, event.shiftKey, tabOrder);
      if (!targetStop) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!event.shiftKey) {
        acceptAutocompleteSelectionOnTab(activeStop);
      }
      focusTriageTabStop(targetStop);
    };

    window.addEventListener("keydown", onTabKeyDown, true);
    return () => window.removeEventListener("keydown", onTabKeyDown, true);
  }, [isOpen, popoverRef]);

  return {
    rememberTabStop,
  };
}
