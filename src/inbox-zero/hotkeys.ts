import { useEffect, type MutableRefObject, type RefObject } from "react";

import { SCHEDULE_POPOVER_ID } from "../components/SchedulePopover";
import { isWeeklyReviewBlockEditorElement } from "../components/WeeklyReviewRoamBlock";
import type { InboxShortcutAction as ReviewShortcutAction } from "../review/shortcuts";
import {
  acceptAutocompleteSelectionOnTab,
  focusTriageTabStop,
  getEnabledTriageTabOrder,
  getNextTriageTabStop,
  isAutocompleteFieldElement,
  resolveAutocompleteContextTabStop,
  type TriageTabStop,
} from "../triage/form-helpers";

type StepOneTabStop = TriageTabStop | "back" | "next" | "process";

export type InboxZeroShortcutCommand =
  | { type: "noop" }
  | { type: "handledNoop" }
  | { type: "focusBlock" }
  | { type: "focusProject" }
  | { type: "submit" }
  | { type: "openDelegatePrompt"; uid: string }
  | { action: ReviewShortcutAction; type: "workflowAction"; uid: string };

export type InboxZeroAutocompleteEscapeCommand =
  | { type: "noop" }
  | { rememberedStop: TriageTabStop | null; type: "closeAutocomplete" };

export type InboxZeroTabCommand =
  | { type: "noop" }
  | {
      acceptAutocompleteSelection: boolean;
      clearRememberedStop: boolean;
      currentStop: TriageTabStop | null;
      targetStop: TriageTabStop;
      type: "focusStop";
    };

interface ResolveInboxZeroShortcutCommandArgs {
  action: ReviewShortcutAction;
  currentItemUid: string | null;
  showDelegatePrompt: boolean;
}

interface ResolveInboxZeroAutocompleteEscapeCommandArgs {
  activeStop: TriageTabStop | null;
  isAutocompleteField: boolean;
  isTrusted: boolean;
  key: string;
}

interface ResolveInboxZeroTabCommandArgs {
  activeInsideDialog?: boolean;
  activeIsBodyOrAbsent?: boolean;
  activeStop: TriageTabStop | null;
  altKey: boolean;
  ctrlKey: boolean;
  enabledTabOrder: Array<TriageTabStop>;
  isBlockEditor: boolean;
  isForeignTextEntry: boolean;
  isInsideSchedulePopover: boolean;
  key: string;
  lastTabStop: TriageTabStop | null;
  metaKey: boolean;
  selectedEmbedOwnsTab: boolean;
  shiftKey: boolean;
  showDelegatePrompt: boolean;
}

interface GetInboxZeroDueDateRemapKeyArgs {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

interface UseInboxZeroHotkeysArgs {
  currentItemUidRef: MutableRefObject<string | null>;
  embedContainerRef: RefObject<HTMLDivElement>;
  handleShortcutAction: (action: ReviewShortcutAction) => boolean;
  lastTabStopRef: MutableRefObject<TriageTabStop | null>;
  showDelegatePrompt: boolean;
  suppressCounterSyncRef: MutableRefObject<boolean>;
  triageRootRef: RefObject<HTMLDivElement>;
}

function asHtmlElement(element: Element | null): HTMLElement | null {
  if (element == null || element.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  return element as HTMLElement;
}

function isTextEntryElement(element: Element | null): boolean {
  const htmlElement = asHtmlElement(element);
  if (!htmlElement) {
    return false;
  }
  if (
    htmlElement.classList.contains("rm-block-input") ||
    htmlElement.classList.contains("rm-block__input")
  ) {
    return true;
  }
  return (
    htmlElement.tagName === "INPUT" ||
    htmlElement.tagName === "TEXTAREA" ||
    htmlElement.tagName === "SELECT"
  );
}

export function resolveInboxZeroShortcutCommand(
  args: ResolveInboxZeroShortcutCommandArgs,
): InboxZeroShortcutCommand {
  const { action, currentItemUid, showDelegatePrompt } = args;

  if (action === "focus") {
    if (showDelegatePrompt) {
      return { type: "handledNoop" };
    }
    if (!currentItemUid) {
      return { type: "noop" };
    }
    return { type: "focusBlock" };
  }

  if (action === "submit") {
    return { type: "submit" };
  }

  if (!currentItemUid) {
    return { type: "noop" };
  }

  if (action === "delegate") {
    return {
      type: "openDelegatePrompt",
      uid: currentItemUid,
    };
  }

  if (action === "project") {
    return { type: "focusProject" };
  }

  return {
    action,
    type: "workflowAction",
    uid: currentItemUid,
  };
}

export function resolveInboxZeroAutocompleteEscapeCommand(
  args: ResolveInboxZeroAutocompleteEscapeCommandArgs,
): InboxZeroAutocompleteEscapeCommand {
  const { activeStop, isAutocompleteField, isTrusted, key } = args;
  if (key !== "Escape" || !isTrusted || !isAutocompleteField) {
    return { type: "noop" };
  }
  return {
    rememberedStop: activeStop,
    type: "closeAutocomplete",
  };
}

export function resolveInboxZeroTabCommand(
  args: ResolveInboxZeroTabCommandArgs,
): InboxZeroTabCommand {
  const {
    activeInsideDialog = false,
    activeIsBodyOrAbsent = false,
    activeStop,
    altKey,
    ctrlKey,
    enabledTabOrder,
    isBlockEditor,
    isForeignTextEntry,
    isInsideSchedulePopover,
    key,
    lastTabStop,
    metaKey,
    selectedEmbedOwnsTab,
    shiftKey,
    showDelegatePrompt,
  } = args;

  if (key !== "Tab" || ctrlKey || metaKey || altKey || showDelegatePrompt) {
    return { type: "noop" };
  }

  if (
    isInsideSchedulePopover ||
    isBlockEditor ||
    selectedEmbedOwnsTab ||
    enabledTabOrder.length === 0
  ) {
    return { type: "noop" };
  }

  let currentStop = activeStop;
  let clearRememberedStop = false;
  if (!currentStop) {
    if (lastTabStop) {
      currentStop = lastTabStop;
      clearRememberedStop = true;
    } else if (activeIsBodyOrAbsent) {
      currentStop = null;
    } else if (!activeInsideDialog || isForeignTextEntry) {
      return { type: "noop" };
    }
  }

  const targetStop = getNextTriageTabStop(currentStop, shiftKey, enabledTabOrder);
  if (!targetStop) {
    return { type: "noop" };
  }

  return {
    acceptAutocompleteSelection: !shiftKey,
    clearRememberedStop,
    currentStop,
    targetStop,
    type: "focusStop",
  };
}

export function getInboxZeroDueDateRemapKey(
  args: GetInboxZeroDueDateRemapKeyArgs,
): "ArrowDown" | "ArrowUp" | null {
  const { altKey, ctrlKey, key, metaKey, shiftKey } = args;
  if (altKey || shiftKey || (!ctrlKey && !metaKey)) {
    return null;
  }

  const normalizedKey = key.toLowerCase();
  if (normalizedKey === "n" || normalizedKey === "j") {
    return "ArrowDown";
  }
  if (normalizedKey === "p" || normalizedKey === "k") {
    return "ArrowUp";
  }
  return null;
}

export function getStepOneTabOrder(): Array<TriageTabStop> {
  return ["context", "calendar", "delegate", "project"];
}

export function getNextStepOneTabStop(
  currentStop: StepOneTabStop | null,
  reverse = false,
  tabOrder: Array<StepOneTabStop> = getStepOneTabOrder(),
): StepOneTabStop | null {
  return getNextTriageTabStop(
    currentStop as TriageTabStop | null,
    reverse,
    tabOrder as Array<TriageTabStop>,
  ) as StepOneTabStop | null;
}

export function useInboxZeroHotkeys(args: UseInboxZeroHotkeysArgs): void {
  const {
    currentItemUidRef,
    embedContainerRef,
    handleShortcutAction,
    lastTabStopRef,
    showDelegatePrompt,
    suppressCounterSyncRef,
    triageRootRef,
  } = args;

  useEffect(() => {
    const extensionWindow = window as Window & {
      __roamGtdHandleInboxShortcut?: ((action: ReviewShortcutAction) => boolean) | null;
      __roamGtdPendingInboxShortcut?: ReviewShortcutAction | null;
    };

    const dispatchShortcut = (action: ReviewShortcutAction): boolean => {
      const command = resolveInboxZeroShortcutCommand({
        action,
        currentItemUid: currentItemUidRef.current,
        showDelegatePrompt,
      });

      switch (command.type) {
        case "handledNoop":
          return true;
        case "noop":
          return false;
        case "focusBlock":
          return handleShortcutAction("focus");
        case "focusProject":
          return handleShortcutAction("project");
        case "submit":
          return handleShortcutAction("submit");
        case "openDelegatePrompt":
          return handleShortcutAction("delegate");
        case "workflowAction":
          return handleShortcutAction(command.action);
      }
    };

    extensionWindow.__roamGtdHandleInboxShortcut = dispatchShortcut;
    let frameId: number | undefined;
    if (extensionWindow.__roamGtdPendingInboxShortcut) {
      const pendingAction = extensionWindow.__roamGtdPendingInboxShortcut;
      frameId = window.requestAnimationFrame(() => {
        if (dispatchShortcut(pendingAction)) {
          extensionWindow.__roamGtdPendingInboxShortcut = null;
        }
      });
    }

    return () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
      if (extensionWindow.__roamGtdHandleInboxShortcut === dispatchShortcut) {
        extensionWindow.__roamGtdHandleInboxShortcut = null;
      }
    };
  }, [currentItemUidRef, handleShortcutAction, showDelegatePrompt]);

  useEffect(() => {
    const onDueDateKeyDown = (event: KeyboardEvent): void => {
      const activeElement = document.activeElement;
      if (!isAutocompleteFieldElement(activeElement)) {
        return;
      }

      const escapeCommand = resolveInboxZeroAutocompleteEscapeCommand({
        activeStop: resolveAutocompleteContextTabStop(activeElement),
        isAutocompleteField: true,
        isTrusted: event.isTrusted,
        key: event.key,
      });
      if (escapeCommand.type === "closeAutocomplete") {
        event.preventDefault();
        event.stopPropagation();
        lastTabStopRef.current = escapeCommand.rememberedStop;
        suppressCounterSyncRef.current = true;
        activeElement.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Escape",
          }),
        );
        activeElement.blur();
        const triageRoot = triageRootRef.current;
        if (triageRoot) {
          window.requestAnimationFrame(() => {
            triageRoot.focus();
            suppressCounterSyncRef.current = false;
          });
        } else {
          suppressCounterSyncRef.current = false;
        }
        return;
      }

      const mappedKey = getInboxZeroDueDateRemapKey({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
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

    document.addEventListener("keydown", onDueDateKeyDown, true);
    return () => document.removeEventListener("keydown", onDueDateKeyDown, true);
  }, [lastTabStopRef, suppressCounterSyncRef, triageRootRef]);

  useEffect(() => {
    const onStepOneTabKeyDown = (event: KeyboardEvent): void => {
      const reviewDialog = document.querySelector<HTMLElement>(".roam-gtd-review-dialog");
      if (!reviewDialog) {
        return;
      }

      const activeElement = asHtmlElement(document.activeElement);
      const eventTarget =
        event.target != null && (event.target as Node).nodeType === Node.ELEMENT_NODE
          ? (event.target as Node as HTMLElement)
          : null;
      const schedulePopover = document.getElementById(SCHEDULE_POPOVER_ID);
      const activeInsideSchedulePopover = Boolean(
        activeElement && schedulePopover?.contains(activeElement),
      );
      const targetInsideSchedulePopover = Boolean(
        eventTarget && schedulePopover?.contains(eventTarget),
      );
      const hasSelectedEmbedBlock = Boolean(
        document.querySelector(
          ".roam-gtd-triage-left .block-highlight-blue, .roam-gtd-triage-left .block-highlight-yellow",
        ),
      );
      const selectedEmbedOwnsTab =
        hasSelectedEmbedBlock &&
        (!activeElement ||
          activeElement === document.body ||
          Boolean(embedContainerRef.current?.contains(activeElement)));
      const command = resolveInboxZeroTabCommand({
        activeInsideDialog: Boolean(activeElement && reviewDialog.contains(activeElement)),
        activeIsBodyOrAbsent: !activeElement || activeElement === document.body,
        activeStop: activeElement ? resolveAutocompleteContextTabStop(activeElement) : null,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        enabledTabOrder: getEnabledTriageTabOrder(),
        isBlockEditor: Boolean(activeElement && isWeeklyReviewBlockEditorElement(activeElement)),
        isForeignTextEntry: Boolean(
          activeElement &&
          (!reviewDialog.contains(activeElement) ||
            (isTextEntryElement(activeElement) &&
              !isWeeklyReviewBlockEditorElement(activeElement))),
        ),
        isInsideSchedulePopover: activeInsideSchedulePopover || targetInsideSchedulePopover,
        key: event.key,
        lastTabStop: lastTabStopRef.current,
        metaKey: event.metaKey,
        selectedEmbedOwnsTab,
        shiftKey: event.shiftKey,
        showDelegatePrompt,
      });
      if (command.type !== "focusStop") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      suppressCounterSyncRef.current = true;
      if (command.clearRememberedStop) {
        lastTabStopRef.current = null;
      }
      if (command.acceptAutocompleteSelection) {
        acceptAutocompleteSelectionOnTab(command.currentStop);
      }
      focusTriageTabStop(command.targetStop);
      window.requestAnimationFrame(() => {
        suppressCounterSyncRef.current = false;
      });
    };

    window.addEventListener("keydown", onStepOneTabKeyDown, true);
    return () => window.removeEventListener("keydown", onStepOneTabKeyDown, true);
  }, [embedContainerRef, lastTabStopRef, showDelegatePrompt, suppressCounterSyncRef]);
}
