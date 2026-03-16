import type { ScheduleIntent } from "../components/SchedulePopover";
import { formatRoamDate } from "../date-utils";

export const CONTEXT_AUTOCOMPLETE_ID = "gtd-context-autocomplete";
export const DELEGATE_AUTOCOMPLETE_ID = "gtd-delegate-autocomplete";
export const CALENDAR_BUTTON_ID = "gtd-calendar-button";
export const PROJECT_AUTOCOMPLETE_ID = "gtd-project-autocomplete";

export const CONTEXT_SEARCH_DEBOUNCE_MS = 80;
export const CONTEXT_SEARCH_MAX_RESULTS = 12;
export const CONTEXT_SEARCH_CACHE_LIMIT = 192;

const AUTOCOMPLETE_MENU_PROXIMITY_PX = 56;

const AUTOCOMPLETE_FIELD_IDS = new Set([
  CONTEXT_AUTOCOMPLETE_ID,
  DELEGATE_AUTOCOMPLETE_ID,
  PROJECT_AUTOCOMPLETE_ID,
]);

export type TriageTabStop = "calendar" | "context" | "delegate" | "project";

function formatDueDateTooltipTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function asHtmlElement(element: Element | null): HTMLElement | null {
  if (element == null || element.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  return element as HTMLElement;
}

function isHtmlInputElement(element: Element | null): element is HTMLInputElement {
  return element != null && element.nodeType === Node.ELEMENT_NODE && element.tagName === "INPUT";
}

function isVisibleElement(element: HTMLElement): boolean {
  if (element.getClientRects().length === 0) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function isEnabledControlElement(element: HTMLElement | null): element is HTMLElement {
  if (!element || !isVisibleElement(element)) {
    return false;
  }
  if (
    "disabled" in element &&
    Boolean((element as HTMLButtonElement | HTMLInputElement).disabled)
  ) {
    return false;
  }
  return true;
}

function getAutocompleteResultContainers(): Array<HTMLElement> {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      ".rm-autocomplete__results, .roamjs-autocomplete-input .bp3-menu",
    ),
  );
}

function getAutocompleteResultContainerForInput(input: HTMLInputElement): HTMLElement | null {
  const wrapper = input.closest(".rm-autocomplete__wrapper");
  const wrapperResults = wrapper?.querySelector<HTMLElement>(".rm-autocomplete__results");
  if (wrapperResults && wrapperResults.childElementCount > 0 && isVisibleElement(wrapperResults)) {
    return wrapperResults;
  }

  const inputRect = input.getBoundingClientRect();
  let bestMatch: { candidate: HTMLElement; verticalGap: number } | null = null;
  const candidates = getAutocompleteResultContainers();
  for (const candidate of candidates) {
    if (candidate.childElementCount === 0 || !isVisibleElement(candidate)) {
      continue;
    }
    const candidateRect = candidate.getBoundingClientRect();
    const horizontalOverlap =
      Math.min(inputRect.right, candidateRect.right) - Math.max(inputRect.left, candidateRect.left);
    if (horizontalOverlap <= 0) {
      continue;
    }
    const verticalGap = Math.min(
      Math.abs(candidateRect.top - inputRect.bottom),
      Math.abs(inputRect.top - candidateRect.bottom),
    );
    if (verticalGap > AUTOCOMPLETE_MENU_PROXIMITY_PX) {
      continue;
    }
    if (!bestMatch || verticalGap < bestMatch.verticalGap) {
      bestMatch = { candidate, verticalGap };
    }
  }
  return bestMatch?.candidate ?? null;
}

function isElementInsideAutocompleteResults(
  input: HTMLInputElement,
  element: HTMLElement,
): boolean {
  const resultContainer = getAutocompleteResultContainerForInput(input);
  if (resultContainer && resultContainer.contains(element)) {
    return true;
  }
  return false;
}

function resolveAutocompleteFieldInput(tabStop: TriageTabStop | null): HTMLInputElement | null {
  if (tabStop !== "context" && tabStop !== "delegate" && tabStop !== "project") {
    return null;
  }
  const element = resolveTriageTabStopElement(tabStop);
  return isHtmlInputElement(element) ? element : null;
}

export function isAutocompleteFieldElement(element: Element | null): element is HTMLInputElement {
  if (element == null || element.nodeType !== 1) {
    return false;
  }
  if (element.tagName !== "INPUT") {
    return false;
  }
  const input = element as HTMLInputElement;
  return AUTOCOMPLETE_FIELD_IDS.has(input.id);
}

export function getTriageTabOrder(): Array<TriageTabStop> {
  return ["context", "calendar", "delegate", "project"];
}

export function getNextTriageTabStop(
  currentStop: TriageTabStop | null,
  reverse = false,
  tabOrder: Array<TriageTabStop> = getTriageTabOrder(),
): TriageTabStop | null {
  if (tabOrder.length === 0) {
    return null;
  }
  const currentIndex = currentStop ? tabOrder.indexOf(currentStop) : -1;
  const nextIndex = reverse
    ? currentIndex <= 0
      ? tabOrder.length - 1
      : currentIndex - 1
    : currentIndex < 0
      ? 0
      : (currentIndex + 1) % tabOrder.length;
  return tabOrder[nextIndex] ?? tabOrder[0];
}

export function resolveTriageTabStopElement(tabStop: TriageTabStop): HTMLElement | null {
  switch (tabStop) {
    case "context":
      return asHtmlElement(document.getElementById(CONTEXT_AUTOCOMPLETE_ID));
    case "calendar":
      return asHtmlElement(document.getElementById(CALENDAR_BUTTON_ID));
    case "delegate":
      return asHtmlElement(document.getElementById(DELEGATE_AUTOCOMPLETE_ID));
    case "project":
      return asHtmlElement(document.getElementById(PROJECT_AUTOCOMPLETE_ID));
  }
}

export function resolveAutocompleteContextTabStop(element: HTMLElement): TriageTabStop | null {
  const inputs = [
    { id: CONTEXT_AUTOCOMPLETE_ID, stop: "context" as const },
    { id: DELEGATE_AUTOCOMPLETE_ID, stop: "delegate" as const },
    { id: PROJECT_AUTOCOMPLETE_ID, stop: "project" as const },
  ];
  for (const inputConfig of inputs) {
    const input = document.getElementById(inputConfig.id);
    if (!isHtmlInputElement(input)) {
      continue;
    }
    if (element === input) {
      return inputConfig.stop;
    }
    const wrapper = input.closest(".rm-autocomplete__wrapper");
    if (wrapper && wrapper.contains(element)) {
      return inputConfig.stop;
    }
    if (isElementInsideAutocompleteResults(input, element)) {
      return inputConfig.stop;
    }
  }
  const calendarButton = document.getElementById(CALENDAR_BUTTON_ID);
  if (calendarButton && (element === calendarButton || calendarButton.contains(element))) {
    return "calendar";
  }
  return null;
}

export function focusTriageTabStop(tabStop: TriageTabStop): boolean {
  const target = resolveTriageTabStopElement(tabStop);
  if (!isEnabledControlElement(target)) {
    return false;
  }
  target.focus();
  return true;
}

export function acceptAutocompleteSelectionOnTab(tabStop: TriageTabStop | null): boolean {
  const input = resolveAutocompleteFieldInput(tabStop);
  if (!input || input.value.trim().length === 0 || !getAutocompleteResultContainerForInput(input)) {
    return false;
  }
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    }),
  );
  return true;
}

export function getEnabledTriageTabOrder(): Array<TriageTabStop> {
  return getTriageTabOrder().filter((tabStop) =>
    isEnabledControlElement(resolveTriageTabStopElement(tabStop)),
  );
}

export function formatDueDateTooltipLabel(
  scheduleIntent: Pick<ScheduleIntent, "date" | "roamDate" | "time"> | undefined,
  persistedDueDate: string,
): string | null {
  if (scheduleIntent) {
    const roamDate = scheduleIntent.roamDate.trim() || formatRoamDate(scheduleIntent.date);
    if (scheduleIntent.time) {
      return `${roamDate} at ${formatDueDateTooltipTime(scheduleIntent.date)}`;
    }
    if (roamDate) {
      return roamDate;
    }
  }

  const persisted = persistedDueDate.trim();
  return persisted || null;
}

export function formatSchedulePopoverInitialValue(
  scheduleIntent: Pick<ScheduleIntent, "date" | "roamDate" | "time"> | undefined,
  persistedDueDate: string,
): string {
  if (scheduleIntent) {
    const roamDate = scheduleIntent.roamDate.trim() || formatRoamDate(scheduleIntent.date);
    if (scheduleIntent.time) {
      return `${roamDate} at ${formatDueDateTooltipTime(scheduleIntent.date)}`;
    }
    if (roamDate) {
      return roamDate;
    }
  }
  return persistedDueDate.trim();
}
