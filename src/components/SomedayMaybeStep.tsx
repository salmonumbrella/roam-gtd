import React from "react";

import type { TranslatorFn } from "../i18n";
import { openInSidebar } from "../roam-ui-utils";
import type { GtdSettings } from "../settings";
import type { TodoItem } from "../types";
import type { UnifiedReviewRowTriageRequest } from "./UnifiedReviewRow";
import { WorkflowReviewStep } from "./WorkflowReviewStep";

interface SomedayMaybeStepProps {
  activeTriageUid: string | null;
  hideEmptyState?: boolean;
  items: Array<TodoItem>;
  onItemProcessed: (uid: string, action: "done" | "keep" | "someday" | "triage") => void;
  onOpenTriage: (request: UnifiedReviewRowTriageRequest) => void;
  settings: GtdSettings;
  t: TranslatorFn;
}

export function SomedayMaybeStep({
  activeTriageUid,
  hideEmptyState,
  items,
  onItemProcessed,
  onOpenTriage,
  settings,
  t,
}: SomedayMaybeStepProps) {
  return (
    <WorkflowReviewStep
      activeTriageUid={activeTriageUid}
      emptyStepTitle={t("step5Title")}
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
            <span style={{ color: "#89b4fa", transition: "none" }}>{items.length}</span>
            <span style={{ color: "#A5A5A5" }}>{` ${settings.tagSomeday}`}</span>
          </p>
        ) : undefined
      }
      hideEmptyState={hideEmptyState}
      onItemProcessed={onItemProcessed}
      onOpenInSidebar={openInSidebar}
      onOpenTriage={onOpenTriage}
      sections={[
        {
          clockIsKeep: true,
          clockTargetTag: settings.tagSomeday,
          currentTag: settings.tagSomeday,
          items,
          key: "someday",
          showArchiveAction: true,
        },
      ]}
      settings={settings}
      t={t}
      useIncrementalRows
    />
  );
}
