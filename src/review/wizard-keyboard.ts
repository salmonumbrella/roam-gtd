import { isOpenTaskText, parseTaskMarker, replaceTaskMarker, stripTaskMarker } from "../task-text";

export interface ReviewWizardKeyboardEventLike {
  altKey: boolean;
  code?: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  preventDefault: () => void;
  shiftKey: boolean;
  stopImmediatePropagation: () => void;
  stopPropagation: () => void;
}

export interface ReviewWizardNavigationShortcut {
  direction: "back" | "forward";
  isModifierShortcut: boolean;
}

export type ReviewWizardArchiveCommand =
  | { type: "noop" }
  | { type: "reconcileFocusedUiBlock"; uid: string }
  | {
      hideOptimistically: boolean;
      nextText: string;
      type: "toggleArchive";
      uid: string;
    };

interface ResolveReviewWizardArchiveCommandArgs {
  activeElement: Element | null;
  blockString: string;
  event: ReviewWizardKeyboardEventLike;
  focusedBlockUidFromUi: string | null;
  getFocusedModalBlockUid: (activeElement: Element | null) => string | null;
  isWorkflowStepActive: boolean;
  reviewDialog: HTMLElement | null;
}

interface DispatchReviewWizardArchiveKeydownArgs extends ResolveReviewWizardArchiveCommandArgs {
  onReconcileFocusedUiBlock: (uid: string) => void;
  onToggleArchive: (
    command: Extract<ReviewWizardArchiveCommand, { type: "toggleArchive" }>,
  ) => void;
}

interface DispatchReviewWizardNavigationArgs {
  activeElement: Element | null;
  event: ReviewWizardKeyboardEventLike;
  isEditableElement: (element: Element | null) => boolean;
}

interface DispatchReviewWizardNavigationKeydownArgs extends DispatchReviewWizardNavigationArgs {
  onNavigateBack: () => void;
  onNavigateForward: () => void;
}

function isElementNode(value: Element | null): value is HTMLElement {
  return Boolean(
    value &&
    typeof value === "object" &&
    "nodeType" in value &&
    (value as { nodeType?: unknown }).nodeType === 1,
  );
}

function isArchiveShortcutTarget(element: HTMLElement): boolean {
  return Boolean(
    element.classList.contains("rm-block-input") ||
    element.classList.contains("rm-block__input") ||
    element.tagName === "TEXTAREA" ||
    element.closest(".rm-block-input, .rm-block__input, textarea"),
  );
}

function consumeKeyboardEvent(event: ReviewWizardKeyboardEventLike): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function toggleReviewWizardArchivedMarker(text: string): string {
  return parseTaskMarker(text) === "archived"
    ? stripTaskMarker(text)
        .replaceAll(/\s{2,}/g, " ")
        .trim()
    : replaceTaskMarker(text, "archived");
}

export function resolveReviewWizardArchiveCommand(
  args: ResolveReviewWizardArchiveCommandArgs,
): ReviewWizardArchiveCommand {
  const {
    activeElement,
    blockString,
    event,
    focusedBlockUidFromUi,
    getFocusedModalBlockUid,
    isWorkflowStepActive,
    reviewDialog,
  } = args;

  if (
    event.key !== "Enter" ||
    !event.shiftKey ||
    !(event.metaKey || event.ctrlKey) ||
    event.altKey
  ) {
    return { type: "noop" };
  }

  if (!reviewDialog || !isElementNode(activeElement) || !reviewDialog.contains(activeElement)) {
    return { type: "noop" };
  }

  if (!isArchiveShortcutTarget(activeElement)) {
    return { type: "noop" };
  }

  const blockUid = focusedBlockUidFromUi ?? getFocusedModalBlockUid(activeElement);
  if (!blockUid) {
    return { type: "noop" };
  }

  if (focusedBlockUidFromUi) {
    return {
      type: "reconcileFocusedUiBlock",
      uid: blockUid,
    };
  }

  if (!blockString.trim()) {
    return { type: "noop" };
  }

  const nextText = toggleReviewWizardArchivedMarker(blockString);
  return {
    hideOptimistically: isWorkflowStepActive && !isOpenTaskText(nextText),
    nextText,
    type: "toggleArchive",
    uid: blockUid,
  };
}

export function dispatchReviewWizardArchiveKeydown(
  args: DispatchReviewWizardArchiveKeydownArgs,
): ReviewWizardArchiveCommand {
  const command = resolveReviewWizardArchiveCommand(args);
  if (command.type === "reconcileFocusedUiBlock") {
    args.onReconcileFocusedUiBlock(command.uid);
    return command;
  }
  if (command.type !== "toggleArchive") {
    return command;
  }

  consumeKeyboardEvent(args.event);
  args.onToggleArchive(command);
  return command;
}

export function resolveReviewWizardNavigationShortcut(
  event: Pick<
    ReviewWizardKeyboardEventLike,
    "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
): ReviewWizardNavigationShortcut | null {
  const hasNavModifier = (event.metaKey || event.ctrlKey) && !event.altKey;
  if (hasNavModifier && (event.code === "BracketLeft" || event.key === "[")) {
    return { direction: "back", isModifierShortcut: true };
  }
  if (hasNavModifier && (event.code === "BracketRight" || event.key === "]")) {
    return { direction: "forward", isModifierShortcut: true };
  }
  if (
    event.key === "ArrowLeft" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    return { direction: "back", isModifierShortcut: false };
  }
  if (
    event.key === "ArrowRight" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    return { direction: "forward", isModifierShortcut: false };
  }
  return null;
}

export function dispatchReviewWizardNavigationKeydown(
  args: DispatchReviewWizardNavigationKeydownArgs,
): boolean {
  const shortcut = resolveReviewWizardNavigationShortcut(args.event);
  if (!shortcut) {
    return false;
  }

  if (!shortcut.isModifierShortcut && args.isEditableElement(args.activeElement)) {
    return false;
  }

  consumeKeyboardEvent(args.event);
  if (shortcut.direction === "back") {
    args.onNavigateBack();
    return true;
  }
  args.onNavigateForward();
  return true;
}

export function dispatchReviewWizardNavigationKeyup(
  args: DispatchReviewWizardNavigationArgs,
): boolean {
  const shortcut = resolveReviewWizardNavigationShortcut(args.event);
  if (!shortcut) {
    return false;
  }

  if (!shortcut.isModifierShortcut && args.isEditableElement(args.activeElement)) {
    return false;
  }

  consumeKeyboardEvent(args.event);
  return true;
}

export const getReviewWizardNavigationShortcut = resolveReviewWizardNavigationShortcut;
export const toggleReviewWizardArchivedText = toggleReviewWizardArchivedMarker;
