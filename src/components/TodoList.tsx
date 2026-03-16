import React from "react";

import type { TranslatorFn } from "../i18n";
import { stripTodoPrefix } from "../tag-utils";
import type { TodoItem } from "../types";

interface TodoListProps {
  items: Array<TodoItem>;
  maxHeight?: number | null;
  onMarkDone: (uid: string) => void;
  onOpenInSidebar: (uid: string) => void;
  showAge?: boolean;
  showDeferred?: boolean;
  t: TranslatorFn;
}

export const TodoList = React.memo(function TodoList({
  items,
  maxHeight = 420,
  onMarkDone,
  onOpenInSidebar,
  showAge = true,
  showDeferred = false,
  t,
}: TodoListProps) {
  if (items.length === 0) {
    return (
      <div className="bp3-non-ideal-state" style={{ padding: 20 }}>
        <div className="bp3-non-ideal-state-visual">
          <span className="bp3-icon bp3-icon-tick-circle" style={{ fontSize: 32 }} />
        </div>
        <h4 className="bp3-heading">{t("allClear")}</h4>
      </div>
    );
  }

  return (
    <div style={{ maxHeight: maxHeight ?? undefined, overflowY: maxHeight ? "auto" : "visible" }}>
      {items.map((item) => (
        <div
          key={item.uid}
          style={{
            alignItems: "flex-start",
            borderBottom: "1px solid rgba(127, 132, 156, 0.2)",
            display: "flex",
            gap: 8,
            padding: "6px 0",
          }}
        >
          <button
            className="bp3-button bp3-minimal bp3-small bp3-icon-tick"
            onClick={() => onMarkDone(item.uid)}
            title={t("markDone")}
            type="button"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14 }}>{stripTodoPrefix(item.text)}</div>
            <div
              style={{
                color: "#7f849c",
                display: "flex",
                flexWrap: "wrap",
                fontSize: 11,
                gap: 8,
                marginTop: 2,
              }}
            >
              <button
                className="bp3-button bp3-minimal bp3-small"
                onClick={() => onOpenInSidebar(item.uid)}
                style={{
                  lineHeight: 1,
                  minHeight: 0,
                  padding: 0,
                  textDecoration: "underline",
                }}
                type="button"
              >
                {item.pageTitle}
              </button>
              {showAge && item.ageDays > 0 && (
                <span style={{ color: item.ageDays >= 14 ? "#f38ba8" : undefined }}>
                  {t("ageDays", item.ageDays)}
                </span>
              )}
              {showDeferred && item.deferredDate ? (
                <span style={{ color: "#89b4fa" }}>{t("dueDate", item.deferredDate)}</span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
