import React, { type MutableRefObject } from "react";

import type { TranslatorFn } from "../../i18n";
import type { PersonEntry } from "../../people";
import type {
  ProjectTodoHotkeyAction,
  ProjectTodoHotkeyBindings,
} from "../../projects-step/support";
import type { TriageInputService } from "../../review/session/triage-input-service";
import type { ReviewWizardWorkflowPopoverState } from "../../review/wizard-body";
import type { WizardStep } from "../../review/wizard-support";
import { openInSidebar } from "../../roam-ui-utils";
import type { GtdSettings } from "../../settings";
import type { GtdState, createGtdStore } from "../../store";
import type { ProjectSummary, TicklerGroup, TodoItem } from "../../types";
import { DashboardStep } from "../DashboardStep";
import { InboxZeroStep } from "../InboxZeroStep";
import { NextActionsStep } from "../NextActionsStep";
import { ProjectsStep } from "../ProjectsStep";
import { SchedulePopover, type ScheduleIntent } from "../SchedulePopover";
import { SomedayMaybeStep } from "../SomedayMaybeStep";
import { TicklerStep } from "../TicklerStep";
import { TriggersStep } from "../TriggersStep";
import type { UnifiedReviewRowTriageRequest } from "../UnifiedReviewRow";
import { WaitingForStep } from "../WaitingForStep";
import { WorkflowProcessPopover } from "../WorkflowProcessPopover";
import { ReviewWizardProgressBar } from "./ReviewWizardHeader";

interface ReviewWizardBodyProps {
  bodyRef: MutableRefObject<HTMLDivElement | null>;
  bodyState: GtdState;
  bodyStep: WizardStep;
  inbox: {
    goBackRef: MutableRefObject<(() => void) | null>;
    isLoading: boolean;
    items: Array<TodoItem>;
    onAdvance: () => void;
    onAtEndChange: (atEnd: boolean) => void;
    onIndexChange: (index: number) => void;
    onProgressChange: (current: number, total: number) => void;
    settings: GtdSettings;
    skipItemRef: MutableRefObject<(() => void) | null>;
    store: ReturnType<typeof createGtdStore>;
    triageService?: TriageInputService;
  };
  progressValue: number;
  projects: {
    detailProjectPageUid: string | null;
    dismissedUids: Set<string>;
    focusRequestUid: string | null;
    hotkeyBindings: ProjectTodoHotkeyBindings;
    onCreateProjectTodo: (project: ProjectSummary) => Promise<void>;
    onDismissProject: (project: ProjectSummary) => void;
    onFocusRequestHandled: () => void;
    onOpenProjectDetail: (project: ProjectSummary) => void;
    onProjectTodoBlur: (todoUid: string) => void;
    onStatusChange: (project: ProjectSummary, nextStatus: string) => boolean;
    onTodoHotkeyAction: (action: ProjectTodoHotkeyAction, project: ProjectSummary) => Promise<void>;
    projects: Array<ProjectSummary>;
    projectsHydrated: boolean;
  };
  settings: GtdSettings;
  showProgressBar?: boolean;
  t: TranslatorFn;
  tickler: {
    activeDetailPageUid: string | null;
    groups: Array<TicklerGroup>;
    itemCount: number;
    onItemProcessed: (uid: string, action: "done" | "triage" | "someday" | "keep") => void;
    onOpenDetail: (pageUid: string) => void;
    onPromoteToNext: (item: TodoItem) => Promise<void> | void;
    schedulePopover: {
      canUnset: boolean;
      initialValue: string;
      onCancel: () => void;
      onConfirm: (intent: ScheduleIntent) => Promise<void> | void;
      onUnset: () => Promise<void> | void;
    } | null;
  };
  useDialogBodyWrapper?: boolean;
  workflow: {
    activePersonDetail: PersonEntry | null;
    activeTriageUid: string | null;
    delegatedChildPersonRefs: Map<string, Array<string>>;
    delegatedItems: Array<TodoItem>;
    delegatedPeople: Array<PersonEntry>;
    items: Array<TodoItem>;
    onItemProcessed: (uid: string, action: "done" | "keep" | "someday" | "triage") => void;
    onOpenPersonDetail: (uid: string) => void;
    onOpenTriage: (request: UnifiedReviewRowTriageRequest) => void;
    waitingItems: Array<TodoItem>;
  };
  workflowPopover:
    | (ReviewWizardWorkflowPopoverState & {
        onCancel: () => void;
        onProcessComplete: (uid: string, shouldHide: boolean) => void;
      })
    | null;
}

export function ReviewWizardBody({
  bodyRef,
  bodyState,
  bodyStep,
  inbox,
  progressValue,
  projects,
  settings,
  showProgressBar = true,
  t,
  tickler,
  useDialogBodyWrapper = true,
  workflow,
  workflowPopover,
}: ReviewWizardBodyProps) {
  const bodyStepContent =
    bodyStep.key === "inbox" ? (
      <InboxZeroStep
        goBackRef={inbox.goBackRef}
        isLoading={inbox.isLoading}
        items={inbox.items}
        onAdvance={inbox.onAdvance}
        onAtEndChange={inbox.onAtEndChange}
        onIndexChange={inbox.onIndexChange}
        onProgressChange={inbox.onProgressChange}
        settings={inbox.settings}
        skipItemRef={inbox.skipItemRef}
        store={inbox.store}
        t={t}
        triageService={inbox.triageService}
      />
    ) : bodyStep.key === "projects" ? (
      <ProjectsStep
        detailProjectPageUid={projects.detailProjectPageUid}
        dismissedUids={projects.dismissedUids}
        focusRequestUid={projects.focusRequestUid}
        hotkeyBindings={projects.hotkeyBindings}
        onCreateProjectTodo={projects.onCreateProjectTodo}
        onDismissProject={projects.onDismissProject}
        onFocusRequestHandled={projects.onFocusRequestHandled}
        onOpenProjectDetail={projects.onOpenProjectDetail}
        onProjectTodoBlur={projects.onProjectTodoBlur}
        onStatusChange={projects.onStatusChange}
        onTodoHotkeyAction={projects.onTodoHotkeyAction}
        projects={projects.projects}
        projectsHydrated={projects.projectsHydrated}
        t={t}
      />
    ) : bodyStep.key === "stats" ? (
      <DashboardStep state={bodyState} t={t} />
    ) : bodyStep.key === "upcoming" ? (
      <NextActionsStep
        activeTriageUid={workflow.activeTriageUid}
        items={workflow.items}
        onItemProcessed={workflow.onItemProcessed}
        onOpenTriage={workflow.onOpenTriage}
        settings={settings}
        t={t}
      />
    ) : bodyStep.key === "waitingDelegated" ? (
      <WaitingForStep
        activePersonDetail={workflow.activePersonDetail}
        activeTriageUid={workflow.activeTriageUid}
        delegatedChildPersonRefs={workflow.delegatedChildPersonRefs}
        delegatedItems={workflow.delegatedItems}
        delegatedPeople={workflow.delegatedPeople}
        onItemProcessed={workflow.onItemProcessed}
        onOpenPersonDetail={workflow.onOpenPersonDetail}
        onOpenTriage={workflow.onOpenTriage}
        settings={settings}
        t={t}
        waitingItems={workflow.waitingItems}
      />
    ) : bodyStep.key === "someday" ? (
      <SomedayMaybeStep
        activeTriageUid={workflow.activeTriageUid}
        items={workflow.items}
        onItemProcessed={workflow.onItemProcessed}
        onOpenTriage={workflow.onOpenTriage}
        settings={settings}
        t={t}
      />
    ) : bodyStep.key === "triggerList" ? (
      <TriggersStep pageName={settings.triggerListPage} t={t} />
    ) : bodyStep.key === "tickler" ? (
      <>
        <p
          style={{
            color: "#A5A5A5",
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            minHeight: 18,
            paddingBottom: 12,
          }}
        >
          {t("ticklerThisMonth", tickler.itemCount)}
        </p>
        <TicklerStep
          activeDetailPageUid={tickler.activeDetailPageUid}
          groups={tickler.groups}
          onItemProcessed={tickler.onItemProcessed}
          onOpenDetail={tickler.onOpenDetail}
          onOpenInSidebar={openInSidebar}
          onPromoteToNext={(item) => void tickler.onPromoteToNext(item)}
          settings={settings}
          t={t}
        />
        {tickler.schedulePopover ? (
          <div style={{ padding: "0 16px 16px" }}>
            <SchedulePopover
              canUnset={tickler.schedulePopover.canUnset}
              initialValue={tickler.schedulePopover.initialValue}
              onCancel={tickler.schedulePopover.onCancel}
              onConfirm={tickler.schedulePopover.onConfirm}
              onUnset={tickler.schedulePopover.onUnset}
              t={t}
            />
          </div>
        ) : null}
      </>
    ) : (
      <div />
    );

  return (
    <div
      className={useDialogBodyWrapper ? "bp3-dialog-body" : undefined}
      data-step-key={bodyStep.key}
      ref={bodyRef}
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
      }}
    >
      {showProgressBar ? <ReviewWizardProgressBar progressValue={progressValue} /> : null}
      {bodyStepContent}
      {workflowPopover ? (
        <div
          className="roam-gtd-workflow-triage-layer"
          style={{
            left: workflowPopover.x,
            top: workflowPopover.y,
          }}
        >
          <WorkflowProcessPopover
            anchorElement={workflowPopover.triage.anchorElement}
            currentTag={workflowPopover.triage.currentTag}
            initialPeople={workflowPopover.initialPeople}
            initialProjects={workflowPopover.initialProjects}
            isOpen
            onCancel={workflowPopover.onCancel}
            onProcessComplete={workflowPopover.onProcessComplete}
            settings={settings}
            t={t}
            targetText={workflowPopover.triage.item.text}
            targetUid={workflowPopover.triageUid}
            triageService={inbox.triageService}
          />
        </div>
      ) : null}
    </div>
  );
}
