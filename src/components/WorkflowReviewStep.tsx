import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TranslatorFn } from "../i18n";
import type { PersonEntry } from "../people";
import type { GtdSettings } from "../settings";
import type { TodoItem } from "../types";
import { StepEmptyState } from "./StepEmptyState";
import { UnifiedReviewRow, type UnifiedReviewRowTriageRequest } from "./UnifiedReviewRow";
import { asHtmlElement } from "./WeeklyReviewRoamBlock";

const DEFAULT_INITIAL_VISIBLE_ROWS = 40;
const DEFAULT_ROW_BATCH_SIZE = 30;
const DEFAULT_SCROLL_THRESHOLD_PX = 240;

interface PersonGrouping {
  childPersonRefs: Map<string, Array<string>>;
  people: Array<PersonEntry>;
}

interface WorkflowReviewSection {
  clockIsKeep?: boolean;
  clockTargetTag: string;
  currentTag: string;
  emptyMessage?: string;
  hideCheckbox?: boolean;
  items: Array<TodoItem>;
  key: string;
  onPrimaryAction?: (item: TodoItem) => Promise<void> | void;
  personGrouping?: PersonGrouping;
  primaryActionLabel?: string;
  separatorColor?: string;
  showArchiveAction?: boolean;
  title?: React.ReactNode;
}

export interface WorkflowReviewStepProps {
  activeTriageUid: string | null;
  emptyStepDescription?: string;
  emptyStepTitle: string;
  header?: React.ReactNode;
  hideEmptyState?: boolean;
  hotkeyBindings?: {
    delegate: string;
    reference: string | null;
    someday: string;
    up: string | null;
    watch: string;
  } | null;
  initialVisibleRows?: number;
  onHotkeyTriage?: (uid: string, anchorElement: HTMLElement, currentTag: string) => void;
  onItemProcessed: (uid: string, action: "done" | "triage" | "someday" | "keep") => void;
  onOpenInSidebar: (uid: string) => void;
  onOpenPersonDetail?: (uid: string) => void;
  onOpenTriage: (request: UnifiedReviewRowTriageRequest) => void;
  rowBatchSize?: number;
  scrollThresholdPx?: number;
  sections: Array<WorkflowReviewSection>;
  settings: GtdSettings;
  t: TranslatorFn;
  useIncrementalRows?: boolean;
}

interface VisibleWorkflowSection extends WorkflowReviewSection {
  visibleItems: Array<TodoItem>;
}

export function getWorkflowReviewVisibleRowCount(
  currentVisibleRows: number,
  totalRows: number,
  rowBatchSize: number,
): number {
  if (totalRows <= 0) {
    return 0;
  }
  return Math.min(totalRows, currentVisibleRows + rowBatchSize);
}

function getVisibleWorkflowSections(
  sections: Array<WorkflowReviewSection>,
  visibleRowCount: number,
): Array<VisibleWorkflowSection> {
  let remaining = visibleRowCount;

  return sections.map((section) => {
    const visibleItems =
      remaining > 0 ? section.items.slice(0, Math.min(section.items.length, remaining)) : [];
    remaining = Math.max(0, remaining - visibleItems.length);
    return {
      ...section,
      visibleItems,
    };
  });
}

function groupItemsByPerson(
  items: Array<TodoItem>,
  people: Array<PersonEntry>,
  personRefs: Map<string, Array<string>>,
): { groups: Array<{ items: Array<TodoItem>; person: PersonEntry }>; unassigned: Array<TodoItem> } {
  const unassigned: Array<TodoItem> = [];
  const personItemsMap = new Map<string, Array<TodoItem>>();
  const peopleLookup = new Map(people.map((p) => [p.title.toLowerCase(), p]));

  for (const item of items) {
    const titles = personRefs.get(item.uid);
    if (!titles || titles.length === 0) {
      unassigned.push(item);
    } else {
      const seen = new Set<string>();
      for (const title of titles) {
        const key = title.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const person = peopleLookup.get(key);
        if (person) {
          const list = personItemsMap.get(key) ?? [];
          list.push(item);
          personItemsMap.set(key, list);
        }
      }
    }
  }

  const groups = Array.from(personItemsMap.entries())
    .map(([key, groupItems]) => ({
      items: groupItems,
      person: peopleLookup.get(key)!,
    }))
    .sort((a, b) => a.person.title.localeCompare(b.person.title));

  return { groups, unassigned };
}

export function WorkflowReviewStep({
  activeTriageUid,
  emptyStepDescription,
  emptyStepTitle,
  header,
  hideEmptyState = false,
  hotkeyBindings,
  initialVisibleRows = DEFAULT_INITIAL_VISIBLE_ROWS,
  onHotkeyTriage,
  onItemProcessed,
  onOpenInSidebar,
  onOpenPersonDetail,
  onOpenTriage,
  rowBatchSize = DEFAULT_ROW_BATCH_SIZE,
  scrollThresholdPx = DEFAULT_SCROLL_THRESHOLD_PX,
  sections,
  settings,
  t,
  useIncrementalRows = false,
}: WorkflowReviewStepProps) {
  const [visibleRowCount, setVisibleRowCount] = useState(
    useIncrementalRows ? initialVisibleRows : Number.MAX_SAFE_INTEGER,
  );

  const hoveredUidRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const collapseTimers = new Map<HTMLElement, number>();

    const onFocusIn = (event: FocusEvent): void => {
      const target = asHtmlElement(event.target);
      if (!target) {
        return;
      }
      const blockEl = target.closest<HTMLElement>(".roam-gtd-unified-row__block");
      if (!blockEl || !container.contains(blockEl)) {
        return;
      }
      const existingTimer = collapseTimers.get(blockEl);
      if (existingTimer != null) {
        window.clearTimeout(existingTimer);
        collapseTimers.delete(blockEl);
      }
      blockEl.classList.add("roam-gtd-unified-row__block--expanded");
    };

    const onFocusOut = (event: FocusEvent): void => {
      const target = asHtmlElement(event.target);
      if (!target) {
        return;
      }
      const blockEl = target.closest<HTMLElement>(".roam-gtd-unified-row__block");
      if (!blockEl || !container.contains(blockEl)) {
        return;
      }
      const timer = window.setTimeout(() => {
        collapseTimers.delete(blockEl);
        blockEl.classList.remove("roam-gtd-unified-row__block--expanded");
      }, 200);
      collapseTimers.set(blockEl, timer);
    };

    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("focusout", onFocusOut);
    return () => {
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
      for (const timer of collapseTimers.values()) {
        window.clearTimeout(timer);
      }
      collapseTimers.clear();
    };
  }, []);

  const handleRowMouseEnter = useCallback((uid: string) => {
    hoveredUidRef.current = uid;
  }, []);

  const handleRowMouseLeave = useCallback((uid: string) => {
    if (hoveredUidRef.current === uid) {
      hoveredUidRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hotkeyBindings) {
      return;
    }
    const bindings = hotkeyBindings;

    function handleKeyDown(event: KeyboardEvent) {
      const uid = hoveredUidRef.current;
      if (!uid) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const key = event.key.toLowerCase();

      let matchedSection: (typeof sections)[number] | undefined;
      for (const section of sections) {
        if (section.items.some((i) => i.uid === uid)) {
          matchedSection = section;
          break;
        }
      }
      if (!matchedSection) {
        return;
      }

      if (
        key === bindings.delegate ||
        (bindings.up && key === bindings.up) ||
        key === bindings.watch ||
        key === bindings.someday ||
        (bindings.reference && key === bindings.reference)
      ) {
        event.preventDefault();
        const triageButton = document.getElementById(`gtd-unified-row-triage-${uid}`);
        if (triageButton && onHotkeyTriage) {
          onHotkeyTriage(uid, triageButton, matchedSection.currentTag);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hotkeyBindings, onHotkeyTriage, sections]);

  const totalRows = useMemo(
    () => sections.reduce((sum, section) => sum + section.items.length, 0),
    [sections],
  );

  const visibleSections = useMemo(
    () =>
      useIncrementalRows
        ? getVisibleWorkflowSections(sections, visibleRowCount)
        : sections.map((section) => ({ ...section, visibleItems: section.items })),
    [sections, useIncrementalRows, visibleRowCount],
  );

  if (totalRows === 0 && !hideEmptyState) {
    return (
      <StepEmptyState
        subtitle={emptyStepDescription}
        title={t("allClearTitle", emptyStepTitle)}
        variant="complete"
      />
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
      {header}
      <div
        data-roam-gtd-workflow-scroll="true"
        onScroll={(event) => {
          if (!useIncrementalRows || visibleRowCount >= totalRows) {
            return;
          }
          const target = event.currentTarget;
          if (target.scrollHeight - (target.scrollTop + target.clientHeight) > scrollThresholdPx) {
            return;
          }
          setVisibleRowCount((current) =>
            getWorkflowReviewVisibleRowCount(current, totalRows, rowBatchSize),
          );
        }}
        ref={scrollContainerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: activeTriageUid ? "hidden" : "auto",
          overscrollBehavior: "contain",
          scrollbarGutter: "stable",
        }}
      >
        {visibleSections.map((section, sectionIndex) => (
          <div
            key={section.key}
            style={{ marginBottom: sectionIndex < visibleSections.length - 1 ? 16 : 0 }}
          >
            {section.title ? (
              <div className="roam-gtd-thin-separator">
                <span
                  className="roam-gtd-thin-separator__label"
                  style={{ color: section.separatorColor ?? "#7f849c" }}
                >
                  {section.title}
                </span>
                <div
                  className="roam-gtd-thin-separator__line"
                  style={{ background: "rgba(127,132,156,0.2)" }}
                />
              </div>
            ) : null}
            {section.items.length === 0 ? (
              section.emptyMessage ? (
                <p className="bp3-text-muted" style={{ fontSize: 13 }}>
                  {section.emptyMessage}
                </p>
              ) : null
            ) : section.personGrouping ? (
              (() => {
                const { groups, unassigned } = groupItemsByPerson(
                  section.visibleItems,
                  section.personGrouping.people,
                  section.personGrouping.childPersonRefs,
                );
                const rowForItem = (item: TodoItem) => (
                  <UnifiedReviewRow
                    clockIsKeep={section.clockIsKeep}
                    clockTargetTag={section.clockTargetTag}
                    currentTag={section.currentTag}
                    hideCheckbox={section.hideCheckbox}
                    isTriageOpen={activeTriageUid === item.uid}
                    item={item}
                    key={item.uid}
                    onItemProcessed={onItemProcessed}
                    onMouseEnter={handleRowMouseEnter}
                    onMouseLeave={handleRowMouseLeave}
                    onOpenInSidebar={onOpenInSidebar}
                    onOpenTriage={onOpenTriage}
                    onPrimaryAction={section.onPrimaryAction}
                    primaryActionLabel={section.primaryActionLabel}
                    settings={settings}
                    showArchiveAction={section.showArchiveAction}
                    t={t}
                  />
                );
                return (
                  <>
                    {unassigned.length > 0 ? <>{unassigned.map(rowForItem)}</> : null}
                    {groups.map(({ items: groupItems, person }) => (
                      <div key={person.uid}>
                        <div className="roam-gtd-thin-separator">
                          {onOpenPersonDetail ? (
                            <button
                              className="roam-gtd-person-header-button"
                              onClick={() => onOpenPersonDetail(person.uid)}
                              type="button"
                            >
                              <span
                                className="roam-gtd-thin-separator__label"
                                style={{ color: "#fab387" }}
                              >
                                {person.title}
                              </span>
                            </button>
                          ) : (
                            <span
                              className="roam-gtd-thin-separator__label"
                              style={{ color: "#fab387" }}
                            >
                              {person.title}
                            </span>
                          )}
                          <div
                            className="roam-gtd-thin-separator__line"
                            style={{ background: "rgba(127,132,156,0.2)" }}
                          />
                        </div>
                        {groupItems.map(rowForItem)}
                      </div>
                    ))}
                  </>
                );
              })()
            ) : (
              section.visibleItems.map((item) => (
                <UnifiedReviewRow
                  clockIsKeep={section.clockIsKeep}
                  clockTargetTag={section.clockTargetTag}
                  currentTag={section.currentTag}
                  hideCheckbox={section.hideCheckbox}
                  isTriageOpen={activeTriageUid === item.uid}
                  item={item}
                  key={item.uid}
                  onItemProcessed={onItemProcessed}
                  onMouseEnter={handleRowMouseEnter}
                  onMouseLeave={handleRowMouseLeave}
                  onOpenInSidebar={onOpenInSidebar}
                  onOpenTriage={onOpenTriage}
                  onPrimaryAction={section.onPrimaryAction}
                  primaryActionLabel={section.primaryActionLabel}
                  settings={settings}
                  showArchiveAction={section.showArchiveAction}
                  t={t}
                />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
