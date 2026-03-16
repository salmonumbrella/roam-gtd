import type { GtdSettings } from "../settings";

const ELEMENT_NODE_TYPE = 1;

export type InboxShortcutAction =
  | "delegate"
  | "done"
  | "focus"
  | "project"
  | "reference"
  | "someday"
  | "submit"
  | "up"
  | "watch";

function isElementInsideGtdDialog(element: Element | null): element is HTMLElement {
  return Boolean(element && element.closest(".roam-gtd-dialog"));
}

function getActiveReviewStepKey(): string | null {
  if (typeof document.querySelector !== "function") {
    return null;
  }
  const reviewBody = document.querySelector<HTMLElement>(
    ".roam-gtd-review-dialog .bp3-dialog-body[data-step-key]",
  );
  return reviewBody?.dataset.stepKey ?? null;
}

function normalizeShortcutKey(key: string): string {
  return key.trim().toLowerCase();
}

function isNativeTextEditingShortcut(event: KeyboardEvent): boolean {
  if (event.altKey) {
    return false;
  }
  const key = normalizeShortcutKey(event.key);
  if (event.metaKey || event.ctrlKey) {
    if (key === "a" || key === "c" || key === "v" || key === "x" || key === "y" || key === "z") {
      return true;
    }
  }
  if (event.ctrlKey && !event.metaKey) {
    if (
      key === "b" ||
      key === "f" ||
      key === "e" ||
      key === "a" ||
      key === "d" ||
      key === "h" ||
      key === "k" ||
      key === "w" ||
      key === "n" ||
      key === "p" ||
      key === "t"
    ) {
      return true;
    }
  }
  return false;
}

function isNativeBlockEditingShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || event.shiftKey) {
    return false;
  }
  const key = normalizeShortcutKey(event.key);
  return event.ctrlKey && !event.metaKey && key === "i";
}

export function getInboxActionForSingleKey(
  key: string,
  settings: Pick<
    GtdSettings,
    "hotkeyDelegate" | "hotkeyDone" | "hotkeyProject" | "hotkeySomeday" | "hotkeyWatch"
  >,
): InboxShortcutAction | null {
  const normalizedKey = normalizeShortcutKey(key);
  if (!normalizedKey) {
    return null;
  }
  const mappings: Array<readonly [string, InboxShortcutAction]> = [
    [settings.hotkeyWatch, "watch"],
    [settings.hotkeyDelegate, "delegate"],
    [settings.hotkeySomeday, "someday"],
    [settings.hotkeyProject, "project"],
    [settings.hotkeyDone, "done"],
  ];
  const userKeys = new Set(mappings.map(([mappedKey]) => mappedKey).filter(Boolean));
  if (!userKeys.has("u")) {
    mappings.push(["u", "up"]);
  }
  if (!userKeys.has("r")) {
    mappings.push(["r", "reference"]);
  }
  for (const [mappedKey, action] of mappings) {
    if (mappedKey && normalizedKey === mappedKey) {
      return action;
    }
  }
  return null;
}

export function createReviewShortcutKeyDownHandler(args: {
  dispatchInboxShortcut: (action: InboxShortcutAction) => void;
  getActiveReviewOverlayCount: () => number;
  getCachedSettings: () => Pick<
    GtdSettings,
    "hotkeyDelegate" | "hotkeyDone" | "hotkeyProject" | "hotkeySomeday" | "hotkeyWatch"
  >;
}): (event: KeyboardEvent) => void {
  const { dispatchInboxShortcut, getActiveReviewOverlayCount, getCachedSettings } = args;

  return (event: KeyboardEvent): void => {
    if (getActiveReviewOverlayCount() === 0) {
      return;
    }

    // Let native clipboard and select-all shortcuts pass through immediately
    // without any processing overhead.
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      "acvx".includes(event.key.toLowerCase())
    ) {
      return;
    }

    const activeElement = document.activeElement;
    const eventTarget =
      event.target != null && (event.target as Node).nodeType === ELEMENT_NODE_TYPE
        ? (event.target as HTMLElement)
        : null;
    const activeHtmlEl =
      activeElement != null && activeElement.nodeType === ELEMENT_NODE_TYPE
        ? (activeElement as HTMLElement)
        : null;
    const activeInDialog = activeHtmlEl?.closest(".roam-gtd-dialog") != null;
    const activeBlockIsEditing =
      activeInDialog &&
      (activeHtmlEl.classList.contains("rm-block-input") || activeHtmlEl.isContentEditable);
    const activeTextIsEditing =
      activeBlockIsEditing ||
      (activeInDialog &&
        (activeHtmlEl.tagName === "INPUT" ||
          activeHtmlEl.tagName === "TEXTAREA" ||
          activeHtmlEl.tagName === "SELECT"));
    const activeElementIsInDialog = activeInDialog;
    const eventTargetIsInDialog = isElementInsideGtdDialog(eventTarget);
    const activeReviewStepKey = getActiveReviewStepKey();
    const shouldDispatchInboxShortcut = activeReviewStepKey === "inbox";

    const isSubmitShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      (event.key === "Enter" || event.key === "NumpadEnter");
    const isFocusShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key === "Enter" || event.key === "NumpadEnter");
    const isNavigationModifierShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      (event.code === "BracketLeft" ||
        event.code === "BracketRight" ||
        event.key === "[" ||
        event.key === "]");
    const normalizedModifierKey = normalizeShortcutKey(event.key);
    const isAutocompleteCtrlNavigationShortcut =
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      (normalizedModifierKey === "n" ||
        normalizedModifierKey === "j" ||
        normalizedModifierKey === "p" ||
        normalizedModifierKey === "k") &&
      activeTextIsEditing;
    const isCopyShortcut =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      normalizedModifierKey === "c";
    if (isCopyShortcut && (activeTextIsEditing || activeBlockIsEditing)) {
      return;
    }
    const shouldAllowNativeTextEditingShortcut =
      activeTextIsEditing && isNativeTextEditingShortcut(event);
    const shouldAllowNativeBlockEditingShortcut =
      activeBlockIsEditing && isNativeBlockEditingShortcut(event);
    if (shouldAllowNativeTextEditingShortcut || shouldAllowNativeBlockEditingShortcut) {
      return;
    }
    const isUnhandledModifierShortcut =
      (event.metaKey || event.ctrlKey || event.altKey) &&
      !isSubmitShortcut &&
      !isFocusShortcut &&
      !isNavigationModifierShortcut &&
      !isAutocompleteCtrlNavigationShortcut;
    if (
      isUnhandledModifierShortcut &&
      (eventTargetIsInDialog || activeElementIsInDialog || activeElement === document.body)
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    if (isSubmitShortcut) {
      if (!shouldDispatchInboxShortcut || activeBlockIsEditing) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      dispatchInboxShortcut("submit");
      return;
    }

    if (isFocusShortcut) {
      if (!shouldDispatchInboxShortcut || activeBlockIsEditing) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      dispatchInboxShortcut("focus");
      return;
    }

    const isPlainSingleKey =
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.length === 1;
    if (isPlainSingleKey) {
      if (event.repeat) {
        return;
      }
      const activeHtmlElement =
        activeElement != null && activeElement.nodeType === ELEMENT_NODE_TYPE
          ? (activeElement as HTMLElement)
          : null;
      if (
        activeHtmlElement &&
        activeHtmlElement !== document.body &&
        activeHtmlElement.closest(".roam-gtd-dialog") == null
      ) {
        return;
      }
      if (activeTextIsEditing) {
        return;
      }
      const action = getInboxActionForSingleKey(event.key, getCachedSettings());
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      dispatchInboxShortcut(action);
    }
  };
}
