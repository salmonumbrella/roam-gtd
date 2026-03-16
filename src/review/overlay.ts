import React, { useState } from "react";
import ReactDOM from "react-dom";

import { scheduleIdleTask } from "../browser-idle";
import { DailyReviewModal } from "../components/DailyReviewModal";
import { WeeklyReviewModal } from "../components/WeeklyReviewModal";
import type { TranslatorFn } from "../i18n";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import type { ReviewWizardMode } from "./wizard-support";

export interface ReviewOverlayOpenProps {
  mode?: ReviewWizardMode;
  onAfterClose: () => void;
  settings: GtdSettings;
  store: ReturnType<typeof createGtdStore>;
  t: TranslatorFn;
}

interface HostState {
  isOpen: boolean;
  mode?: ReviewWizardMode;
  onClose?: () => void;
  settings?: GtdSettings;
  store?: ReturnType<typeof createGtdStore>;
  t?: TranslatorFn;
}

interface ReviewOverlayController {
  dispose: () => void;
  open: (props: ReviewOverlayOpenProps) => () => void;
  scheduleMount: () => void;
}

const CONTAINER_ID = "roam-gtd-review-root";

/**
 * Creates a controller for the Weekly Review overlay.
 *
 * The controller pre-mounts the lightweight React host during idle time so
 * that open() is a single synchronous setState call with no React mount cost.
 */
export function createReviewOverlayController(): ReviewOverlayController {
  let container: HTMLDivElement | null = null;
  let mounted = false;
  let schedulePending = false;
  let cancelIdle: (() => void) | null = null;
  // Captured from the host component's render — see ReviewWizardHost below.
  let updateHost: ((updater: (prev: HostState) => HostState) => void) | null = null;

  // ---------------------------------------------------------------------------
  // Host wrapper: holds review modal props in React state so open/close are
  // simple setState calls instead of full ReactDOM.render() calls.
  // ---------------------------------------------------------------------------
  function ReviewWizardHost(): React.ReactElement | null {
    const [state, setState] = useState<HostState>({ isOpen: false });
    // useState returns a stable setter — safe to capture during render.
    // eslint-disable-next-line react-hooks-js/globals -- intentional: host wrapper pattern
    updateHost = setState;

    // Don't mount the review modal until a real store is provided (idle pre-mount
    // has no store, and ReviewWizard unconditionally calls store.getSnapshot()).
    if (!state.store) {
      return null;
    }

    const ReviewModal = state.mode === "daily" ? DailyReviewModal : WeeklyReviewModal;

    return React.createElement(ReviewModal, {
      isOpen: state.isOpen,
      onClose: state.onClose!,
      settings: state.settings!,
      store: state.store,
      t: state.t!,
    });
  }

  // ---------------------------------------------------------------------------
  // Container management
  // ---------------------------------------------------------------------------
  function ensureContainer(): HTMLDivElement {
    if (!container) {
      const div = document.createElement("div");
      div.id = CONTAINER_ID;
      document.body.append(div);
      container = div;
    }
    return container;
  }

  function mount(): void {
    if (mounted) {
      return;
    }
    const el = ensureContainer();
    ReactDOM.render(React.createElement(ReviewWizardHost), el);
    mounted = true;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function scheduleMount(): void {
    if (schedulePending || mounted) {
      return;
    }
    schedulePending = true;
    cancelIdle = scheduleIdleTask(
      () => {
        cancelIdle = null;
        schedulePending = false;
        if (!mounted) {
          mount();
        }
      },
      { timeoutMs: 2000 },
    );
  }

  function open(props: ReviewOverlayOpenProps): () => void {
    // Cancel pending idle if still waiting — we need to mount now.
    if (cancelIdle) {
      cancelIdle();
      cancelIdle = null;
      schedulePending = false;
    }

    const closeFn = (): void => {
      if (updateHost) {
        updateHost((prev) => ({ ...prev, isOpen: false }));
      }
      props.onAfterClose();
    };

    // Mount React host synchronously if not pre-mounted during idle.
    if (!mounted) {
      mount();
    }

    // Open the Dialog in the same synchronous call — no loading shell,
    // no setTimeout deferral.  The Blueprint Dialog renders immediately.
    if (updateHost) {
      updateHost(() => ({
        isOpen: true,
        mode: props.mode,
        onClose: closeFn,
        settings: props.settings,
        store: props.store,
        t: props.t,
      }));
    }

    return closeFn;
  }

  function dispose(): void {
    if (cancelIdle) {
      cancelIdle();
      cancelIdle = null;
    }
    schedulePending = false;
    if (container) {
      ReactDOM.unmountComponentAtNode(container);
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      container = null;
    }
    mounted = false;
    updateHost = null;
  }

  return { dispose, open, scheduleMount };
}
