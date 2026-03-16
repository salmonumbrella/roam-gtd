import { Drawer } from "@blueprintjs/core";
import React, { useCallback, useEffect, useState } from "react";

import type { TranslatorFn } from "../i18n";
import { groupNextActionsByContext, isNoContextGroup } from "../planning/next-actions-grouping";
import { markDone } from "../review/actions";
import { openInSidebar } from "../roam-ui-utils";
import type { GtdSettings } from "../settings";
import type { GtdState } from "../store";
import type { createGtdStore } from "../store";
import type { ProjectSummary, TodoItem } from "../types";
import { type DashboardTab, StatsBar } from "./StatsBar";
import { TodoList } from "./TodoList";

interface DashboardProps {
  isOpen: boolean;
  onAfterClose?: () => void;
  onClose: () => void;
  onOpenReview: () => void;
  settings: GtdSettings;
  store: ReturnType<typeof createGtdStore>;
  t: TranslatorFn;
}

function getItemsForTab(state: GtdState, tab: DashboardTab): Array<TodoItem> {
  switch (tab) {
    case "inbox":
      return state.inbox;
    case "nextActions":
      return state.nextActions;
    case "waitingFor":
      return state.waitingFor;
    case "delegated":
      return state.delegated;
    case "someday":
      return state.someday;
    case "stale":
      return state.stale;
    case "deferred":
      return state.deferred;
    case "projects":
      return [];
  }
}

function ProjectsList({
  onOpenInSidebar,
  projects,
  t,
}: {
  onOpenInSidebar: (uid: string) => void;
  projects: Array<ProjectSummary>;
  t: TranslatorFn;
}) {
  if (projects.length === 0) {
    return (
      <div className="bp3-non-ideal-state" style={{ padding: 20 }}>
        <div className="bp3-non-ideal-state-visual">
          <span className="bp3-icon bp3-icon-projects" style={{ fontSize: 32 }} />
        </div>
        <h4 className="bp3-heading">{t("noActiveProjects")}</h4>
      </div>
    );
  }

  return (
    <div style={{ maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain" }}>
      {projects.map((project) => (
        <div
          key={project.pageUid}
          style={{
            borderBottom: "1px solid rgba(127, 132, 156, 0.2)",
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            padding: "6px 0",
          }}
        >
          <button
            className="bp3-button bp3-minimal bp3-small"
            onClick={() => onOpenInSidebar(project.pageUid)}
            style={{
              lineHeight: 1,
              minHeight: 0,
              padding: 0,
              textDecoration: "underline",
            }}
            type="button"
          >
            {project.pageTitle}
          </button>
          <span className="bp3-tag bp3-minimal">{t("todoCount", project.todoCount)}</span>
        </div>
      ))}
    </div>
  );
}

function NextActionsGroupedList({
  items,
  onMarkDone,
  onOpenInSidebar,
  settings,
  t,
}: {
  items: Array<TodoItem>;
  onMarkDone: (uid: string) => void;
  onOpenInSidebar: (uid: string) => void;
  settings: GtdSettings;
  t: TranslatorFn;
}) {
  if (items.length === 0) {
    return <TodoList items={[]} onMarkDone={onMarkDone} onOpenInSidebar={onOpenInSidebar} t={t} />;
  }

  const groups = groupNextActionsByContext(items, settings);

  return (
    <div
      style={{ maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 4 }}
    >
      {groups.map((group) => (
        <div key={group.key} style={{ marginBottom: 12 }}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <h5 className="bp3-heading" style={{ fontSize: 12, margin: 0 }}>
              {isNoContextGroup(group) ? t("noContext") : `#${group.label}`}
            </h5>
            <span className="bp3-tag bp3-minimal">{t("itemCount", group.items.length)}</span>
          </div>
          <TodoList
            items={group.items}
            maxHeight={null}
            onMarkDone={onMarkDone}
            onOpenInSidebar={onOpenInSidebar}
            showAge
            t={t}
          />
        </div>
      ))}
    </div>
  );
}

export function Dashboard({
  isOpen,
  onAfterClose,
  onClose,
  onOpenReview,
  settings,
  store,
  t,
}: DashboardProps) {
  const [state, setState] = useState<GtdState>(store.getSnapshot());
  const [activeTab, setActiveTab] = useState<DashboardTab>("inbox");

  useEffect(() => store.subscribe(setState), [store]);

  const onMarkDone = useCallback(
    async (uid: string) => {
      await markDone(uid);
      store.scheduleRefresh(settings);
    },
    [settings, store],
  );

  const onCloseDrawer = useCallback(() => {
    try {
      onClose();
    } finally {
      onAfterClose?.();
    }
  }, [onAfterClose, onClose]);

  return (
    <Drawer
      autoFocus={false}
      canOutsideClickClose={false}
      className="roam-gtd-drawer"
      enforceFocus={false}
      hasBackdrop={false}
      isOpen={isOpen}
      onClose={onCloseDrawer}
      position="right"
      size="520px"
      title={t("gtd")}
    >
      <div style={{ padding: 12 }}>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <h4 className="bp3-heading" style={{ margin: 0 }}>
            {t("gtd")}
          </h4>
          <button
            className="bp3-button bp3-intent-primary bp3-icon-refresh"
            onClick={onOpenReview}
            type="button"
          >
            {t("weeklyReview")}
          </button>
        </div>

        {state.loading ? (
          <div className="bp3-progress-bar bp3-intent-primary" style={{ marginBottom: 12 }}>
            <div className="bp3-progress-meter" style={{ width: "100%" }} />
          </div>
        ) : null}

        <StatsBar activeTab={activeTab} onTabChange={setActiveTab} state={state} t={t} />

        {activeTab === "projects" ? (
          <ProjectsList onOpenInSidebar={openInSidebar} projects={state.projects} t={t} />
        ) : activeTab === "nextActions" ? (
          <NextActionsGroupedList
            items={state.nextActions}
            onMarkDone={onMarkDone}
            onOpenInSidebar={openInSidebar}
            settings={settings}
            t={t}
          />
        ) : (
          <TodoList
            items={getItemsForTab(state, activeTab)}
            onMarkDone={onMarkDone}
            onOpenInSidebar={openInSidebar}
            showAge={activeTab === "stale"}
            showDeferred={activeTab === "deferred"}
            t={t}
          />
        )}
      </div>
    </Drawer>
  );
}
