import React from "react";

import type { TranslatorFn } from "../i18n";
import { openInSidebar } from "../roam-ui-utils";
import type { GtdSettings } from "../settings";
import type { TodoItem } from "../types";
import type { UnifiedReviewRowTriageRequest } from "./UnifiedReviewRow";
import { WorkflowReviewStep } from "./WorkflowReviewStep";

interface NextActionsStepProps {
  activeTriageUid: string | null;
  hideEmptyState?: boolean;
  items: Array<TodoItem>;
  onItemProcessed: (uid: string, action: "done" | "keep" | "someday" | "triage") => void;
  onOpenTriage: (request: UnifiedReviewRowTriageRequest) => void;
  settings: GtdSettings;
  t: TranslatorFn;
}

export function NextActionsStep({
  activeTriageUid,
  hideEmptyState,
  items,
  onItemProcessed,
  onOpenTriage,
  settings,
  t,
}: NextActionsStepProps) {
  return (
    <WorkflowReviewStep
      activeTriageUid={activeTriageUid}
      emptyStepTitle={t("step3Title")}
      header={
        items.length > 0 ? (
          <p
            style={{
              color: "#7f849c",
              fontSize: 12,
              lineHeight: 1.5,
              margin: 0,
              minHeight: 18,
              paddingBottom: 12,
            }}
          >
            <span style={{ color: "#a6e3a1", transition: "none" }}>{items.length}</span>
            <span style={{ color: "#A5A5A5" }}>{` ${t("upcoming")}`}</span>
          </p>
        ) : undefined
      }
      hideEmptyState={hideEmptyState}
      onItemProcessed={onItemProcessed}
      onOpenInSidebar={openInSidebar}
      onOpenTriage={onOpenTriage}
      sections={[
        {
          clockTargetTag: settings.tagSomeday,
          currentTag: settings.tagNextAction,
          items,
          key: "next-actions",
        },
      ]}
      settings={settings}
      t={t}
      useIncrementalRows
    />
  );
}
