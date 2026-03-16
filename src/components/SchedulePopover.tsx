import { parse } from "chrono-node";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { formatRoamDate } from "../date-utils";
import { isGoogleCalendarAvailable, listGoogleCalendarAccountOptions } from "../google-calendar";
import type { TranslatorFn } from "../i18n";

interface SchedulePopoverProps {
  canUnset?: boolean;
  caretPosition?: "none" | "top-center" | "top-left" | "top-right";
  dismissAncestorId?: string;
  initialGoogleCalendarAccount?: string | null;
  initialValue?: string;
  onCancel: () => void;
  onConfirm: (intent: ScheduleIntent) => void;
  onUnset?: () => void;
  t: TranslatorFn;
}

export interface ScheduleIntent {
  date: Date;
  googleCalendarAccount?: string | null;
  roamDate: string;
  time: string | null;
}

const POPOVER_BG = "#242424";
const POPOVER_WIDTH = 336;
const ACTION_BUTTON_HEIGHT_PX = 30;

export const SCHEDULE_POPOVER_ID = "roam-gtd-schedule-popover";

export function getScheduleEscapeAction(
  currentInput: string,
  initialValue: string,
): "close" | "reset" {
  return currentInput === initialValue ? "close" : "reset";
}

export function getNextScheduleTabIndex(
  currentIndex: number,
  total: number,
  reverse = false,
): number {
  if (total <= 0) {
    return -1;
  }
  if (reverse) {
    return currentIndex <= 0 ? total - 1 : currentIndex - 1;
  }
  return currentIndex < 0 ? 0 : (currentIndex + 1) % total;
}

function isFocusableElement(element: HTMLElement | null): element is HTMLElement {
  if (!element || element.getClientRects().length === 0) {
    return false;
  }
  if (
    "disabled" in element &&
    Boolean((element as HTMLInputElement | HTMLButtonElement).disabled)
  ) {
    return false;
  }
  return true;
}

// Phrases that chrono-node recognizes but only when typed in full.
// Each entry maps a full phrase to the minimum prefix length needed to
// match unambiguously (e.g. "to" → "today", "tom" → "tomorrow").
const DATE_PHRASE_PREFIXES: Array<{ minLen: number; phrase: string }> = [
  { minLen: 2, phrase: "today" }, // "to"
  { minLen: 3, phrase: "tomorrow" }, // "tom"
  { minLen: 1, phrase: "yesterday" }, // "y"
  { minLen: 2, phrase: "sunday" }, // "su"
  { minLen: 2, phrase: "monday" }, // "mo"
  { minLen: 2, phrase: "tuesday" }, // "tu"
  { minLen: 2, phrase: "wednesday" }, // "we"
  { minLen: 2, phrase: "thursday" }, // "th"
  { minLen: 2, phrase: "friday" }, // "fr"
  { minLen: 2, phrase: "saturday" }, // "sa"
];

// Two-word phrases where the second word can be a prefix.
const TWO_WORD_PREFIXES: Array<{ first: string; minLen: number; second: string }> = [
  { first: "next", minLen: 3, second: "week" }, // "next wee"
  { first: "next", minLen: 3, second: "month" }, // "next mon"
  { first: "next", minLen: 3, second: "year" }, // "next yea"
  { first: "last", minLen: 3, second: "week" }, // "last wee"
  { first: "last", minLen: 3, second: "month" }, // "last mon"
];

/** Expand partial date phrases so chrono-node can parse them. */
export function expandDatePrefixes(input: string): string {
  const lower = input.toLowerCase().trim();
  if (!lower) {
    return input;
  }

  // Try single-word prefix match against the full input.
  for (const { minLen, phrase } of DATE_PHRASE_PREFIXES) {
    if (lower.length >= minLen && lower.length < phrase.length && phrase.startsWith(lower)) {
      return phrase;
    }
  }

  // Try two-word prefix match: "next wee" → "next week".
  const spaceIdx = lower.indexOf(" ");
  if (spaceIdx > 0) {
    const firstWord = lower.slice(0, spaceIdx);
    const rest = lower.slice(spaceIdx + 1).trimStart();
    if (rest) {
      for (const { first, minLen, second } of TWO_WORD_PREFIXES) {
        if (
          firstWord === first &&
          rest.length >= minLen &&
          rest.length < second.length &&
          second.startsWith(rest)
        ) {
          return `${first} ${second}`;
        }
      }
    }
  }

  return input;
}

export function parseNlpDate(input: string): { date: Date; hasTime: boolean } | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  // Normalize trailing "a"/"p" after digits to "am"/"pm" so chrono-node
  // doesn't misparse intermediate typing states like "8p" or "11a".
  const normalized = trimmed.replace(/(\d)([ap])$/i, (_, digit, suffix) => `${digit}${suffix}m`);
  // Expand partial date phrases ("to" → "today", "tom" → "tomorrow", etc.)
  const expanded = expandDatePrefixes(normalized);
  const results = parse(expanded);
  if (results.length === 0) {
    return null;
  }
  const first = results[0];
  if (!first) {
    return null;
  }
  const hasTime = first.start.isCertain("hour") || first.start.isCertain("minute");
  return { date: first.start.date(), hasTime };
}

function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  const displayMinute = String(minutes).padStart(2, "0");
  return `${displayHour}:${displayMinute} ${ampm}`;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDayAtTime(date: Date): string {
  const day = SHORT_DAYS[date.getDay()];
  return `${day} at ${formatTime(date)}`;
}

function formatTimeHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0",
  )}`;
}

export function SchedulePopover({
  canUnset = false,
  caretPosition = "none",
  dismissAncestorId,
  initialGoogleCalendarAccount = null,
  initialValue = "",
  onCancel,
  onConfirm,
  onUnset,
  t,
}: SchedulePopoverProps) {
  const initialInput = initialValue;
  const initialAccount = initialGoogleCalendarAccount?.trim() ?? "";
  const [input, setInput] = useState(initialInput);
  const [googleCalendarAccount, setGoogleCalendarAccount] = useState(initialAccount);
  const [googleCalendarAccounts, setGoogleCalendarAccounts] = useState<Array<string>>([]);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showParseError, setShowParseError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accountOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const focusAccountOptionOnOpenRef = useRef(false);
  const googleCalendarAccountRef = useRef<HTMLButtonElement>(null);
  const unsetButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const parsed = parseNlpDate(input);
  const gcalAvailable = isGoogleCalendarAvailable();
  const canConfirm = parsed !== null;
  const showGoogleCalendarAccountSelector =
    Boolean(parsed?.hasTime) && gcalAvailable && googleCalendarAccounts.length > 0;
  const isAccountDropdownOpen = showAccountDropdown && showGoogleCalendarAccountSelector;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!gcalAvailable) {
      return;
    }

    let cancelled = false;
    void listGoogleCalendarAccountOptions().then((options) => {
      if (cancelled) {
        return;
      }
      const nextAccounts = options.map((option) => option.account);
      setGoogleCalendarAccounts(nextAccounts);
      setGoogleCalendarAccount((current) => {
        if (current && nextAccounts.includes(current)) {
          return current;
        }
        if (initialAccount && nextAccounts.includes(initialAccount)) {
          return initialAccount;
        }
        return nextAccounts[0] ?? "";
      });
    });

    return () => {
      cancelled = true;
    };
  }, [gcalAvailable, initialAccount]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (popoverRef.current?.contains(target)) {
        return;
      }
      if (dismissAncestorId) {
        const ancestor = document.getElementById(dismissAncestorId);
        if (ancestor?.contains(target)) {
          return;
        }
      }
      onCancel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dismissAncestorId, onCancel]);

  const handleConfirm = useCallback(
    (rawInput = input): boolean => {
      const parsedInput = parseNlpDate(rawInput);
      if (!parsedInput) {
        setShowParseError(true);
        return false;
      }
      onConfirm({
        date: parsedInput.date,
        googleCalendarAccount: parsedInput.hasTime ? googleCalendarAccount || null : null,
        roamDate: formatRoamDate(parsedInput.date),
        time: parsedInput.hasTime ? formatTimeHHMM(parsedInput.date) : null,
      });
      return true;
    },
    [googleCalendarAccount, input, onConfirm],
  );

  const handleEscape = useCallback(() => {
    if (isAccountDropdownOpen) {
      setShowAccountDropdown(false);
      return;
    }
    const action = getScheduleEscapeAction(input, initialInput);
    if (action === "reset") {
      setInput(initialInput);
      return;
    }
    onCancel();
  }, [initialInput, input, isAccountDropdownOpen, onCancel]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        handleConfirm(event.currentTarget.value);
      }
    },
    [handleConfirm],
  );

  const focusAccountOption = useCallback((index: number) => {
    window.requestAnimationFrame(() => {
      accountOptionRefs.current[index]?.focus();
    });
  }, []);

  const focusSelectedAccountOption = useCallback(() => {
    const selectedIndex = Math.max(googleCalendarAccounts.indexOf(googleCalendarAccount), 0);
    focusAccountOption(selectedIndex);
  }, [focusAccountOption, googleCalendarAccount, googleCalendarAccounts]);

  useEffect(() => {
    if (!isAccountDropdownOpen || !focusAccountOptionOnOpenRef.current) {
      return;
    }
    focusAccountOptionOnOpenRef.current = false;
    focusSelectedAccountOption();
  }, [focusSelectedAccountOption, isAccountDropdownOpen]);

  const handleSelectAccount = useCallback((account: string) => {
    setGoogleCalendarAccount(account);
    setShowAccountDropdown(false);
    window.requestAnimationFrame(() => {
      googleCalendarAccountRef.current?.focus();
    });
  }, []);

  const handleAccountButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "Enter" &&
        event.key !== " " &&
        event.key !== "Spacebar"
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      focusAccountOptionOnOpenRef.current = true;
      setShowAccountDropdown(true);
    },
    [],
  );

  const handleAccountOptionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setShowAccountDropdown(false);
        window.requestAnimationFrame(() => {
          googleCalendarAccountRef.current?.focus();
        });
        return;
      }

      const lastIndex = googleCalendarAccounts.length - 1;
      let nextIndex: number | null = null;
      if (event.key === "ArrowDown") {
        nextIndex = index >= lastIndex ? 0 : index + 1;
      } else if (event.key === "ArrowUp") {
        nextIndex = index <= 0 ? lastIndex : index - 1;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = lastIndex;
      }

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      focusAccountOption(nextIndex);
    },
    [focusAccountOption, googleCalendarAccounts.length],
  );

  const handleKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleEscape();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const orderedElements: Array<HTMLElement | null> = [
        inputRef.current,
        showGoogleCalendarAccountSelector ? googleCalendarAccountRef.current : null,
        ...(isAccountDropdownOpen
          ? accountOptionRefs.current.slice(0, googleCalendarAccounts.length)
          : []),
        unsetButtonRef.current,
        confirmButtonRef.current,
      ];
      const focusableElements = orderedElements.filter((element): element is HTMLElement =>
        isFocusableElement(element),
      );
      if (focusableElements.length === 0) {
        return;
      }

      const activeElement = document.activeElement;
      const activeHtmlElement =
        activeElement != null && activeElement.nodeType === 1
          ? (activeElement as HTMLElement)
          : null;
      const currentIndex =
        activeHtmlElement != null ? focusableElements.indexOf(activeHtmlElement) : -1;
      const nextIndex = getNextScheduleTabIndex(
        currentIndex,
        focusableElements.length,
        event.shiftKey,
      );
      const nextTarget = nextIndex >= 0 ? focusableElements[nextIndex] : null;
      if (!nextTarget) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      nextTarget.focus();
    },
    [
      googleCalendarAccounts.length,
      handleEscape,
      isAccountDropdownOpen,
      showGoogleCalendarAccountSelector,
    ],
  );

  const showCaret = caretPosition !== "none";
  const caretIsLeftAligned = caretPosition === "top-left";
  const caretIsRightAligned = caretPosition === "top-right";

  const PREVIEW_GRAY = "#a5a5a5";
  let previewDateText = "";
  let previewTimeText = "";
  let previewColor = PREVIEW_GRAY;
  let isError = false;
  if (input.trim() && !parsed && showParseError) {
    previewDateText = t("scheduleParseError");
    previewColor = "#f38ba8";
    isError = true;
  } else if (parsed) {
    previewDateText = formatRoamDate(parsed.date);
    if (parsed.hasTime) {
      previewTimeText = formatDayAtTime(parsed.date);
    }
  }

  const confirmLabel = parsed?.hasTime ? t("scheduleConfirm") : t("scheduleDueDate");

  return (
    <div
      className="roam-gtd-schedule-popover"
      id={SCHEDULE_POPOVER_ID}
      onKeyDownCapture={handleKeyDownCapture}
      ref={popoverRef}
      style={{
        paddingTop: showCaret ? 10 : 0,
        position: "relative",
        width: POPOVER_WIDTH,
      }}
    >
      {showCaret ? (
        <div
          aria-hidden
          style={{
            background: POPOVER_BG,
            borderRadius: 2,
            height: 14,
            left: caretIsLeftAligned ? 16 : caretIsRightAligned ? undefined : "50%",
            pointerEvents: "none",
            position: "absolute",
            right: caretIsRightAligned ? 8 : undefined,
            top: 3,
            transform:
              caretIsLeftAligned || caretIsRightAligned
                ? "rotate(45deg)"
                : "translateX(-50%) rotate(45deg)",
            width: 14,
            zIndex: 2,
          }}
        />
      ) : null}
      <div
        className="bp3-card bp3-elevation-2"
        style={{
          background: POPOVER_BG,
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.36)",
          marginTop: 2,
          padding: 14,
          width: POPOVER_WIDTH,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <input
            className="bp3-input bp3-fill"
            onChange={(event) => {
              setInput(event.target.value);
              setShowAccountDropdown(false);
              setShowParseError(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("schedulePlaceholder")}
            ref={inputRef}
            type="text"
            value={input}
          />
        </div>

        {previewDateText ? (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: 12,
              justifyContent: "space-between",
              marginBottom: 10,
              padding: "0 10px",
            }}
          >
            <span style={{ color: previewColor }}>{previewDateText}</span>
            {!isError && previewTimeText ? (
              <span style={{ alignItems: "center", color: PREVIEW_GRAY, display: "flex", gap: 4 }}>
                {previewTimeText}
                {gcalAvailable ? (
                  <span
                    className="bp3-icon bp3-icon-calendar"
                    style={{ color: "#a6e3a1", fontSize: 12 }}
                    title={t("scheduleGcalIndicator")}
                  />
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}

        <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {canUnset ? (
            <button
              className="bp3-button bp3-minimal"
              onClick={onUnset}
              ref={unsetButtonRef}
              style={{ height: ACTION_BUTTON_HEIGHT_PX, minHeight: ACTION_BUTTON_HEIGHT_PX }}
              type="button"
            >
              {t("scheduleUnset")}
            </button>
          ) : null}
          {showGoogleCalendarAccountSelector ? (
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <button
                aria-expanded={isAccountDropdownOpen}
                aria-haspopup="listbox"
                aria-label={t("scheduleGoogleAccountLabel")}
                className="bp3-button bp3-minimal roam-gtd-schedule-account-button"
                onClick={() => setShowAccountDropdown((previous) => !previous)}
                onKeyDown={handleAccountButtonKeyDown}
                ref={googleCalendarAccountRef}
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: 2,
                  overflow: "hidden",
                  width: "100%",
                }}
                title={t("scheduleGoogleAccountLabel")}
                type="button"
              >
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textAlign: "left",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {googleCalendarAccount}
                </span>
                <span
                  className="bp3-icon bp3-icon-chevron-down"
                  style={{ flex: "0 0 auto", fontSize: 12 }}
                />
              </button>
              {isAccountDropdownOpen ? (
                <div className="roam-gtd-schedule-account-menu" role="listbox">
                  {googleCalendarAccounts.map((account) => (
                    <button
                      className="roam-gtd-schedule-account-option"
                      data-selected={account === googleCalendarAccount ? "true" : undefined}
                      key={account}
                      onClick={() => handleSelectAccount(account)}
                      onKeyDown={(event) =>
                        handleAccountOptionKeyDown(event, googleCalendarAccounts.indexOf(account))
                      }
                      ref={(node) => {
                        accountOptionRefs.current[googleCalendarAccounts.indexOf(account)] = node;
                      }}
                      type="button"
                    >
                      {account}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            aria-disabled={!canConfirm}
            className={`bp3-button bp3-intent-primary${!canConfirm ? " bp3-disabled" : ""}`}
            onClick={() => handleConfirm(inputRef.current?.value ?? input)}
            ref={confirmButtonRef}
            style={{ height: ACTION_BUTTON_HEIGHT_PX, minHeight: ACTION_BUTTON_HEIGHT_PX }}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
