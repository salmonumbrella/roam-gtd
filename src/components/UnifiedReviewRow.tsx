import React, { memo, useCallback, useMemo, useState } from "react";

import type { TranslatorFn } from "../i18n";
import {
  archiveBlock,
  removeTagFormsBatch,
  replaceTags,
  stripTodoStatusMarkers,
} from "../review/actions";
import type { GtdSettings } from "../settings";
import type { TodoItem } from "../types";
import { getWorkflowTags } from "../unified-triage-flow";
import { WeeklyReviewRoamBlock } from "./WeeklyReviewRoamBlock";

const ROAM_ALIAS_REFERENCE_REGEX = /\[([^\]]+)\]\(\(\([^)]+\)\)\)/gu;
const PAGE_REFERENCE_REGEX = /\[\[([^[\]]+)\]\]/gu;
const BLOCK_REFERENCE_REGEX = /\(\([^)]+\)\)/gu;

export function getUnifiedReviewRowStaticText(text: string, hiddenTags: Array<string>): string {
  return removeTagFormsBatch(stripTodoStatusMarkers(text), hiddenTags)
    .replaceAll(ROAM_ALIAS_REFERENCE_REGEX, "$1")
    .replaceAll(PAGE_REFERENCE_REGEX, "$1")
    .replaceAll(BLOCK_REFERENCE_REGEX, "")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

export interface UnifiedReviewRowTriageRequest {
  anchorElement: HTMLElement;
  currentTag: string;
  item: TodoItem;
}

interface UnifiedReviewRowProps {
  clockIsKeep?: boolean;
  clockTargetTag: string;
  currentTag: string;
  hideCheckbox?: boolean;
  isTriageOpen?: boolean;
  item: TodoItem;
  onItemProcessed: (uid: string, action: "done" | "triage" | "someday" | "keep") => void;
  onMouseEnter?: (uid: string) => void;
  onMouseLeave?: (uid: string) => void;
  onOpenInSidebar: (uid: string) => void;
  onOpenTriage: (request: UnifiedReviewRowTriageRequest) => void;
  onPrimaryAction?: (item: TodoItem) => Promise<void> | void;
  primaryActionLabel?: string;
  settings: GtdSettings;
  showArchiveAction?: boolean;
  t: TranslatorFn;
}

function UnifiedReviewRowComponent({
  clockIsKeep = false,
  clockTargetTag,
  currentTag,
  hideCheckbox = false,
  isTriageOpen = false,
  item,
  onItemProcessed,
  onMouseEnter,
  onMouseLeave,
  onOpenInSidebar,
  onOpenTriage,
  onPrimaryAction,
  primaryActionLabel,
  settings,
  showArchiveAction = false,
  t,
}: UnifiedReviewRowProps) {
  const [isBlockLoading, setIsBlockLoading] = useState(true);
  const [isPrimaryActionBusy, setIsPrimaryActionBusy] = useState(false);
  const [isOptimisticallyHidden, setIsOptimisticallyHidden] = useState(false);
  const handleContentReady = useCallback(() => setIsBlockLoading(false), []);
  const triageTriggerId = useMemo(() => `gtd-unified-row-triage-${item.uid}`, [item.uid]);
  const workflowTags = useMemo(() => getWorkflowTags(settings), [settings]);

  if (isOptimisticallyHidden) {
    return null;
  }

  const blockClassName = [
    "roam-gtd-unified-row__native-block",
    hideCheckbox ? "roam-gtd-unified-row__native-block--hide-checkbox" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="roam-gtd-unified-row"
      onMouseEnter={() => onMouseEnter?.(item.uid)}
      onMouseLeave={() => onMouseLeave?.(item.uid)}
    >
      <div className="roam-gtd-unified-row__block">
        <WeeklyReviewRoamBlock
          className={blockClassName}
          onContentReady={handleContentReady}
          suppressChildControlNavigation={false}
          uid={item.uid}
        />
      </div>
      <div className="roam-gtd-unified-row__meta">
        <div className="roam-gtd-unified-row__actions">
          <button
            aria-controls={onPrimaryAction ? undefined : "roam-gtd-workflow-triage-popover"}
            aria-expanded={onPrimaryAction ? undefined : isTriageOpen}
            aria-haspopup={onPrimaryAction ? undefined : "dialog"}
            aria-label={primaryActionLabel ?? t("actionTakeAction")}
            className={`bp3-button bp3-small bp3-minimal bp3-icon-arrow-up${
              !onPrimaryAction && isTriageOpen ? " bp3-active" : ""
            }`}
            disabled={isPrimaryActionBusy}
            id={triageTriggerId}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (onPrimaryAction) {
                setIsPrimaryActionBusy(true);
                void Promise.resolve(onPrimaryAction(item)).finally(() => {
                  setIsPrimaryActionBusy(false);
                });
                return;
              }
              onOpenTriage({
                anchorElement: event.currentTarget,
                currentTag,
                item,
              });
            }}
            type="button"
          />
          {showArchiveAction ? null : (
            <button
              aria-label={clockIsKeep ? t("actionKeep") : t("actionSomeday")}
              className="bp3-button bp3-small bp3-minimal bp3-icon-time"
              onClick={() => {
                if (clockIsKeep) {
                  onItemProcessed(item.uid, "keep");
                  return;
                }
                setIsOptimisticallyHidden(true);
                onItemProcessed(item.uid, "someday");
                void replaceTags(item.uid, workflowTags, clockTargetTag).catch((error) => {
                  // eslint-disable-next-line no-console -- background write failure should not block instant row hiding
                  console.warn("[RoamGTD] Tag replace failed:", error);
                });
              }}
              type="button"
            />
          )}
          {showArchiveAction ? (
            <button
              aria-label={t("actionArchive")}
              className="bp3-button bp3-small bp3-minimal bp3-icon-box"
              onClick={() => {
                setIsOptimisticallyHidden(true);
                onItemProcessed(item.uid, "done");
                void archiveBlock(item.uid, workflowTags).catch((error) => {
                  // eslint-disable-next-line no-console -- background write failure should not block instant row hiding
                  console.warn("[RoamGTD] Archive write failed:", error);
                });
              }}
              type="button"
            />
          ) : null}
        </div>
        {isBlockLoading ? (
          <div className="gtd-skeleton" style={{ borderRadius: 4, height: 14, width: 42 }} />
        ) : (
          <div className="roam-gtd-tooltip-wrapper">
            <button
              aria-label={`${t("ageDays", item.ageDays)} · ${item.pageTitle}`}
              className={`roam-gtd-unified-row__stale${
                item.ageDays >= settings.staleDays ? " roam-gtd-unified-row__stale--overdue" : ""
              }`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenInSidebar(item.uid);
              }}
              type="button"
            >
              {t("ageDays", item.ageDays)}
            </button>
            {settings.showTooltips ? (
              <div className="roam-gtd-tooltip">{item.pageTitle}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export const UnifiedReviewRow = memo(UnifiedReviewRowComponent);
