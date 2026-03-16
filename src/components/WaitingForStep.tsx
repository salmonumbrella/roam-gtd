import React from "react";

import type { TranslatorFn } from "../i18n";
import type { PersonEntry } from "../people";
import { openInSidebar } from "../roam-ui-utils";
import type { GtdSettings } from "../settings";
import type { TodoItem } from "../types";
import { ReviewPageDetailPane } from "./ReviewPageDetailPane";
import type { UnifiedReviewRowTriageRequest } from "./UnifiedReviewRow";
import { WorkflowReviewStep } from "./WorkflowReviewStep";

interface WaitingForStepProps {
  activePersonDetail: PersonEntry | null;
  activeTriageUid: string | null;
  delegatedChildPersonRefs: Map<string, Array<string>>;
  delegatedItems: Array<TodoItem>;
  delegatedPeople: Array<PersonEntry>;
  hideEmptyState?: boolean;
  onItemProcessed: (uid: string, action: "done" | "keep" | "someday" | "triage") => void;
  onOpenPersonDetail: (uid: string) => void;
  onOpenTriage: (request: UnifiedReviewRowTriageRequest) => void;
  settings: GtdSettings;
  t: TranslatorFn;
  waitingItems: Array<TodoItem>;
}

export function WaitingForStep({
  activePersonDetail,
  activeTriageUid,
  delegatedChildPersonRefs,
  delegatedItems,
  delegatedPeople,
  hideEmptyState,
  onItemProcessed,
  onOpenPersonDetail,
  onOpenTriage,
  settings,
  t,
  waitingItems,
}: WaitingForStepProps) {
  const isPersonDetailOpen = activePersonDetail != null;

  return (
    <>
      {isPersonDetailOpen ? <ReviewPageDetailPane pageUid={activePersonDetail.uid} /> : null}
      <div style={{ display: isPersonDetailOpen ? "none" : "contents" }}>
        <WorkflowReviewStep
          activeTriageUid={activeTriageUid}
          emptyStepTitle={t("step4Title")}
          header={
            delegatedItems.length > 0 || waitingItems.length > 0 ? (
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
                {waitingItems.length > 0 ? (
                  <>
                    <span style={{ color: "#f9e2af", transition: "none" }}>
                      {waitingItems.length}
                    </span>
                    <span style={{ color: "#A5A5A5" }}>{` ${settings.tagWaitingFor}`}</span>
                  </>
                ) : null}
                {waitingItems.length > 0 && delegatedItems.length > 0 ? (
                  <span style={{ color: "#A5A5A5" }}>{" and "}</span>
                ) : null}
                {delegatedItems.length > 0 ? (
                  <>
                    <span style={{ color: "#fab387", transition: "none" }}>
                      {delegatedItems.length}
                    </span>
                    <span style={{ color: "#A5A5A5" }}>{` ${settings.tagDelegated}`}</span>
                  </>
                ) : null}
              </p>
            ) : undefined
          }
          hideEmptyState={hideEmptyState}
          onItemProcessed={onItemProcessed}
          onOpenInSidebar={openInSidebar}
          onOpenPersonDetail={onOpenPersonDetail}
          onOpenTriage={onOpenTriage}
          sections={[
            {
              clockTargetTag: settings.tagSomeday,
              currentTag: settings.tagDelegated,
              emptyMessage: t("allClear"),
              items: delegatedItems,
              key: "delegated",
              personGrouping:
                delegatedPeople.length > 0
                  ? { childPersonRefs: delegatedChildPersonRefs, people: delegatedPeople }
                  : undefined,
            },
            {
              clockTargetTag: settings.tagSomeday,
              currentTag: settings.tagWaitingFor,
              emptyMessage: t("allClear"),
              items: waitingItems,
              key: "waiting",
              separatorColor: "#f9e2af",
              title: t("watching"),
            },
          ]}
          settings={settings}
          t={t}
          useIncrementalRows
        />
      </div>
    </>
  );
}
