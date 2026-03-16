import { Dialog } from "@blueprintjs/core";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hideTagReferenceInEmbed } from "../embed-utils";
import type { TranslatorFn } from "../i18n";
import { groupNextActionsByContext, isNoContextGroup } from "../planning/next-actions-grouping";
import { markDone, replaceTag } from "../review/actions";
import { openInSidebar } from "../roam-ui-utils";
import type { GtdSettings } from "../settings";
import type { GtdState } from "../store";
import type { createGtdStore } from "../store";
import type { TodoItem } from "../types";

const REFRESH_DELAY_MS = 300;

interface NextActionsModalProps {
  isOpen: boolean;
  onAfterClose?: () => void;
  onClose: () => void;
  settings: GtdSettings;
  store: ReturnType<typeof createGtdStore>;
  t: TranslatorFn;
}

interface NextActionListItemProps {
  hiddenTags: Array<string>;
  hiddenTagsKey: string;
  isSelected: boolean;
  item: TodoItem;
  onSelect: (uid: string) => void;
}

function NextActionListItem({
  hiddenTags,
  hiddenTagsKey,
  isSelected,
  item,
  onSelect,
}: NextActionListItemProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      container.innerHTML = "";
      const renderBlockInput = {
        el: container,
        uid: item.uid,
        "zoom-path?": false,
        zoomPath: false,
      } as { el: HTMLElement; uid: string; "zoom-path?": boolean } & Record<string, unknown>;
      window.roamAlphaAPI.ui.components.renderBlock(renderBlockInput);
      for (const tag of hiddenTags) {
        hideTagReferenceInEmbed(container, tag);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [hiddenTags, hiddenTagsKey, item.uid]);

  return (
    <div
      onClick={() => onSelect(item.uid)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.uid);
        }
      }}
      role="button"
      style={{
        background: isSelected ? "rgba(137, 180, 250, 0.16)" : undefined,
        borderRadius: 8,
        cursor: "pointer",
        marginBottom: 4,
        padding: "8px 10px",
      }}
      tabIndex={0}
    >
      <div ref={previewRef} style={{ minHeight: 24, pointerEvents: "none" }} />
      <div style={{ color: "#7f849c", fontSize: 11, marginTop: 2 }}>{item.pageTitle}</div>
    </div>
  );
}

export function NextActionsModal({
  isOpen,
  onAfterClose,
  onClose,
  settings,
  store,
  t,
}: NextActionsModalProps) {
  const [state, setState] = useState<GtdState>(store.getSnapshot());
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [optimisticHiddenUids, setOptimisticHiddenUids] = useState(() => new Set<string>());
  const embedContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => store.subscribe(setState), [store]);

  useEffect(() => {
    if (!state.loading) {
      setOptimisticHiddenUids(new Set());
    }
  }, [state.loading]);

  const visibleItems = useMemo(
    () => state.nextActions.filter((item) => !optimisticHiddenUids.has(item.uid)),
    [optimisticHiddenUids, state.nextActions],
  );

  const groups = useMemo(
    () => groupNextActionsByContext(visibleItems, settings),
    [settings, visibleItems],
  );

  useEffect(() => {
    if (visibleItems.length === 0) {
      if (selectedUid !== null) {
        setSelectedUid(null);
      }
      return;
    }
    if (!selectedUid || !visibleItems.some((item) => item.uid === selectedUid)) {
      setSelectedUid(visibleItems[0]?.uid ?? null);
    }
  }, [selectedUid, visibleItems]);

  const selectedItem: TodoItem | null = useMemo(() => {
    if (!selectedUid) {
      return visibleItems[0] ?? null;
    }
    return visibleItems.find((item) => item.uid === selectedUid) ?? visibleItems[0] ?? null;
  }, [selectedUid, visibleItems]);

  useEffect(() => {
    const uid = selectedItem?.uid;
    const container = embedContainerRef.current;
    if (!uid || !container) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      container.innerHTML = "";
      const renderBlockInput = {
        el: container,
        uid,
        "zoom-path?": false,
        zoomPath: false,
      } as { el: HTMLElement; uid: string; "zoom-path?": boolean } & Record<string, unknown>;
      window.roamAlphaAPI.ui.components.renderBlock(renderBlockInput);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [selectedItem?.uid]);

  const hideSelectedOptimistically = useCallback((uid: string) => {
    setOptimisticHiddenUids((current) => {
      const next = new Set(current);
      next.add(uid);
      return next;
    });
  }, []);

  const moveSelectedTo = useCallback(
    async (nextTag: string) => {
      if (!selectedItem) {
        return;
      }
      hideSelectedOptimistically(selectedItem.uid);
      await replaceTag(selectedItem.uid, settings.tagNextAction, nextTag, selectedItem.text);
      store.scheduleRefresh(settings, REFRESH_DELAY_MS);
    },
    [hideSelectedOptimistically, selectedItem, settings, store],
  );

  const markSelectedDone = useCallback(async () => {
    if (!selectedItem) {
      return;
    }
    hideSelectedOptimistically(selectedItem.uid);
    await markDone(selectedItem.uid, selectedItem.text);
    store.scheduleRefresh(settings, REFRESH_DELAY_MS);
  }, [hideSelectedOptimistically, selectedItem, settings, store]);

  const closeModal = useCallback(() => {
    try {
      onClose();
    } finally {
      onAfterClose?.();
    }
  }, [onAfterClose, onClose]);

  return (
    <Dialog
      canEscapeKeyClose
      canOutsideClickClose
      className="roam-gtd-dialog"
      enforceFocus={false}
      isOpen={isOpen}
      onClose={closeModal}
      style={{ maxWidth: "96vw", minHeight: 600, width: 1100 }}
      title={`${t("nextActions")} (#${settings.tagNextAction})`}
    >
      <div
        className="bp3-dialog-body"
        style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}
      >
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <p className="bp3-text-muted" style={{ marginBottom: 10 }}>
            {t("itemCount", visibleItems.length)}
          </p>
          <button
            className="bp3-button bp3-small bp3-icon-refresh"
            onClick={() => store.scheduleRefresh(settings, 0)}
            type="button"
          >
            {t("refresh")}
          </button>
        </div>

        <div style={{ display: "grid", flex: 1, gap: 12, gridTemplateColumns: "360px 1fr" }}>
          <div
            className="bp3-card"
            style={{ display: "flex", flexDirection: "column", minHeight: 0, padding: 8 }}
          >
            <div
              style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 2 }}
            >
              {groups.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center" }}>
                  <span
                    className="bp3-icon bp3-icon-tick-circle"
                    style={{ color: "#a6e3a1", fontSize: 28 }}
                  />
                  <h4 className="bp3-heading" style={{ marginTop: 10 }}>
                    {t("allClear")}
                  </h4>
                </div>
              ) : (
                groups.map((group) => (
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
                      <span className="bp3-tag bp3-minimal">
                        {t("itemCount", group.items.length)}
                      </span>
                    </div>
                    <div>
                      {group.items.map((item) => {
                        const isSelected = selectedItem?.uid === item.uid;
                        const hiddenTags = isNoContextGroup(group)
                          ? [settings.tagNextAction]
                          : [settings.tagNextAction, group.label];
                        const hiddenTagsKey = hiddenTags.map((tag) => tag.toLowerCase()).join("|");
                        return (
                          <NextActionListItem
                            hiddenTags={hiddenTags}
                            hiddenTagsKey={hiddenTagsKey}
                            isSelected={isSelected}
                            item={item}
                            key={item.uid}
                            onSelect={setSelectedUid}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            className="bp3-card"
            style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
          >
            {selectedItem ? (
              <>
                <div style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    className="bp3-button bp3-minimal bp3-small"
                    onClick={() => openInSidebar(selectedItem.uid)}
                    style={{ lineHeight: 1, minHeight: 0, padding: 0, textDecoration: "underline" }}
                    type="button"
                  >
                    {selectedItem.pageTitle}
                  </button>
                  <span
                    style={{
                      color: selectedItem.ageDays >= settings.staleDays ? "#f38ba8" : "#7f849c",
                      fontSize: 11,
                    }}
                  >
                    {t("ageDays", selectedItem.ageDays)}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <button
                    className="bp3-button bp3-small bp3-intent-success bp3-icon-tick"
                    onClick={() => void markSelectedDone()}
                    type="button"
                  >
                    {t("actionDone")}
                  </button>
                  <button
                    className="bp3-button bp3-small bp3-icon-eye-open"
                    onClick={() => void moveSelectedTo(settings.tagWaitingFor)}
                    type="button"
                  >
                    {t("actionWaiting")}
                  </button>
                  <button
                    className="bp3-button bp3-small bp3-icon-person"
                    onClick={() => void moveSelectedTo(settings.tagDelegated)}
                    type="button"
                  >
                    {t("actionDelegated")}
                  </button>
                  <button
                    className="bp3-button bp3-small bp3-icon-time"
                    onClick={() => void moveSelectedTo(settings.tagSomeday)}
                    type="button"
                  >
                    {t("actionSomeday")}
                  </button>
                </div>

                <div
                  key={selectedItem.uid}
                  ref={embedContainerRef}
                  style={{
                    border: "1px solid rgba(127, 132, 156, 0.25)",
                    borderRadius: 8,
                    flex: 1,
                    minHeight: 380,
                    overflow: "auto",
                    overscrollBehavior: "contain",
                    padding: 8,
                  }}
                />
              </>
            ) : (
              <div style={{ padding: 24, textAlign: "center" }}>
                <span className="bp3-icon bp3-icon-blank" style={{ fontSize: 32 }} />
                <h4 className="bp3-heading" style={{ marginTop: 10 }}>
                  {t("allClear")}
                </h4>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
