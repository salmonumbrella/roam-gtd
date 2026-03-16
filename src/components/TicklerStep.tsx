import React, { useMemo } from "react";

import type { TranslatorFn } from "../i18n";
import type { GtdSettings } from "../settings";
import type { TicklerGroup, TodoItem } from "../types";
import { ReviewPageDetailPane } from "./ReviewPageDetailPane";
import { WorkflowReviewStep } from "./WorkflowReviewStep";

function getTicklerSeparatorColor(_dailyTitle: string): string {
  return "#e4e4e7";
}

interface TicklerStepProps {
  activeDetailPageUid: string | null;
  groups: Array<TicklerGroup>;
  onItemProcessed: (uid: string, action: "done" | "triage" | "someday" | "keep") => void;
  onOpenDetail: (pageUid: string) => void;
  onOpenInSidebar: (uid: string) => void;
  onPromoteToNext: (item: TodoItem) => Promise<void> | void;
  settings: GtdSettings;
  t: TranslatorFn;
}

export function TicklerStep({
  activeDetailPageUid,
  groups,
  onItemProcessed,
  onOpenDetail,
  onOpenInSidebar,
  onPromoteToNext,
  settings,
  t,
}: TicklerStepProps) {
  const sections = useMemo(
    () =>
      groups.map((group) => ({
        clockTargetTag: settings.tagSomeday,
        currentTag: "",
        hideCheckbox: true,
        items: group.items,
        key: group.dailyTitle,
        onPrimaryAction: onPromoteToNext,
        primaryActionLabel: t("actionActivate"),
        separatorColor: getTicklerSeparatorColor(group.dailyTitle),
        title: (
          <button
            className="roam-gtd-person-header-button"
            onClick={() => onOpenDetail(group.dailyPageUid)}
            type="button"
          >
            <span className="roam-gtd-thin-separator__label" style={{ color: "#fab387" }}>
              {group.dailyTitle}
            </span>
          </button>
        ),
      })),
    [groups, onOpenDetail, onPromoteToNext, settings.tagSomeday, t],
  );

  if (activeDetailPageUid) {
    return <ReviewPageDetailPane pageUid={activeDetailPageUid} />;
  }

  return (
    <WorkflowReviewStep
      activeTriageUid={null}
      emptyStepTitle={t("step7Title")}
      onItemProcessed={onItemProcessed}
      onOpenInSidebar={onOpenInSidebar}
      onOpenTriage={() => {}}
      sections={sections}
      settings={settings}
      t={t}
      useIncrementalRows
    />
  );
}
