const GTD_STYLE_TOKENS = `
:root {
  --roam-gtd-surface: var(--color-right-sidebar-background, #2e2e2e);
  --roam-gtd-surface-popover: var(--color-left-sidebar, #1e1e1e);
  --roam-gtd-surface-contrast: var(--color-left-sidebar, #1a1a1a);
  --roam-gtd-surface-hover: var(--color-block-ref-hover, #3a3c3d);
  --roam-gtd-surface-overlay: rgba(30, 30, 30, 0.96);
  --roam-gtd-surface-input: var(--color-sidebar-border, #373737);
  --roam-gtd-surface-tooltip: var(--color-right-sidebar-background, #2e2e2e);
  --roam-gtd-text: var(--ctp-text, #cdd6f4);
  --roam-gtd-text-muted: var(--ctp-subtext1, #bac2de);
  --roam-gtd-text-subtle: var(--color-icon, #a5a5a5);
  --roam-gtd-text-tooltip: var(--color-light-gray, #e8e8e8);
  --roam-gtd-text-inverse: var(--color-light-gray, #ffffff);
  --roam-gtd-accent: var(--ctp-blue, var(--color-blue, #89b4fa));
  --roam-gtd-accent-success: var(--ctp-green, #a6e3a1);
  --roam-gtd-accent-danger: var(--ctp-red, var(--color-mute-red, #f38ba8));
  --roam-gtd-accent-calendar: var(--color-checkmark-blue, #6fa8dc);
  --roam-gtd-primary-button: var(--color-blue, #5c99d1);
  --roam-gtd-focus-ring-color: var(--color-blue, #137cbd);
  --roam-gtd-focus-ring: var(--color-focus-ring, rgba(19, 124, 189, 0.3));
  --roam-gtd-border-subtle: var(--ctp-overlay-bg, rgba(255, 255, 255, 0.06));
  --roam-gtd-border-default: var(--color-sidebar-border, #3a3a3a);
  --roam-gtd-border-faint: rgba(127, 132, 156, 0.15);
  --roam-gtd-border-overlay: rgba(255, 255, 255, 0.08);
  --roam-gtd-hover-soft: rgba(255, 255, 255, 0.06);
  --roam-gtd-hover-default: rgba(255, 255, 255, 0.08);
  --roam-gtd-hover-strong: rgba(167, 182, 194, 0.25);
  --roam-gtd-hover-stronger: rgba(167, 182, 194, 0.3);
  --roam-gtd-skeleton-stop-start: rgba(165, 165, 165, 0.12);
  --roam-gtd-skeleton-stop-mid: rgba(165, 165, 165, 0.24);
  --roam-gtd-shadow-subtle: var(--shadow-subtle, 0 4px 12px rgba(0, 0, 0, 0.15));
  --roam-gtd-shadow-medium: var(--shadow-medium, 0 4px 16px rgba(0, 0, 0, 0.3));
  --roam-gtd-shadow-heavy: var(--shadow-heavy, 0 8px 32px rgba(0, 0, 0, 0.5));
  --roam-gtd-shadow-tooltip: 0 2px 8px rgba(0, 0, 0, 0.4);
  --roam-gtd-shadow-focus: 0 0 0 1px var(--roam-gtd-focus-ring-color),
    0 0 0 3px var(--roam-gtd-focus-ring), inset 0 1px 1px rgba(16, 22, 26, 0.2);
  --roam-gtd-shadow-menu: rgba(16, 22, 26, 0.1) 0 0 0 1px, rgba(16, 22, 26, 0.2) 0 2px 4px,
    rgba(16, 22, 26, 0.2) 0 8px 24px;
  --roam-gtd-radius-xs: var(--border-radius-tiny, 2px);
  --roam-gtd-radius-sm: var(--border-radius-small, 4px);
  --roam-gtd-radius-md: var(--border-radius, 6px);
  --roam-gtd-radius-lg: var(--border-radius-large, 8px);
  --roam-gtd-space-2: 2px;
  --roam-gtd-space-4: var(--spacing-xs, 4px);
  --roam-gtd-space-5: 5px;
  --roam-gtd-space-6: 6px;
  --roam-gtd-space-7: 7px;
  --roam-gtd-space-8: var(--spacing-sm, 8px);
  --roam-gtd-space-10: 10px;
  --roam-gtd-space-12: 12px;
  --roam-gtd-space-13: 13px;
  --roam-gtd-space-14: 14px;
  --roam-gtd-space-16: var(--spacing-md, 16px);
  --roam-gtd-space-18: 18px;
  --roam-gtd-space-20: 20px;
  --roam-gtd-space-24: var(--spacing-lg, 24px);
  --roam-gtd-space-28: 28px;
  --roam-gtd-space-30: 30px;
  --roam-gtd-space-32: 32px;
  --roam-gtd-space-40: 40px;
  --roam-gtd-transition-fast: var(--transition-fast, 0.15s ease);
  --roam-gtd-transition-normal: var(--transition-normal, 0.2s ease);
  --roam-gtd-transition-slow: var(--transition-slow, 0.3s ease);
  --roam-gtd-transition-progress: 300ms ease;
  --roam-gtd-transition-tooltip-enter: 120ms ease-in 200ms;
  --roam-gtd-transition-tooltip-exit: 80ms ease-out;
  --roam-gtd-count-pulse-duration: 280ms ease-out;
  --roam-gtd-skeleton-duration: 1.35s;
  --roam-gtd-review-dialog-width: var(--roam-gtd-theme-review-dialog-width, 780px);
  --roam-gtd-review-dialog-height: var(--roam-gtd-theme-review-dialog-height, 520px);
  --roam-gtd-review-dialog-max-width: var(--roam-gtd-theme-review-dialog-max-width, 95vw);
  --roam-gtd-review-dialog-margin-top: var(--roam-gtd-theme-review-dialog-margin-top, -10px);
  --roam-gtd-dialog-body-min-height: var(--roam-gtd-theme-dialog-body-min-height, 300px);
  --roam-gtd-step-button-size: 30px;
  --roam-gtd-icon-button-size: 24px;
  --roam-gtd-action-button-height: 28px;
  --roam-gtd-progress-height: 3px;
  --roam-gtd-progress-radius: 1.5px;
  --roam-gtd-triage-columns-height: var(--roam-gtd-theme-triage-columns-height, 420px);
  --roam-gtd-triage-side-max-width: var(--roam-gtd-theme-triage-side-max-width, 185px);
  --roam-gtd-triage-side-min-width: var(--roam-gtd-theme-triage-side-min-width, 155px);
  --roam-gtd-workflow-triage-width: var(--roam-gtd-theme-workflow-triage-width, 200px);
  --roam-gtd-schedule-menu-max-height: var(--roam-gtd-theme-schedule-menu-max-height, 132px);
  --roam-gtd-schedule-menu-min-width: var(--roam-gtd-theme-schedule-menu-min-width, 168px);
  --roam-gtd-tooltip-arrow-size: 8px;
  --roam-gtd-skeleton-radius: var(--roam-gtd-radius-sm);
}
`;

const GTD_STYLE_RULES = `
.roam-gtd-portal {
  z-index: 19 !important;
}
.roam-gtd-drawer {
  background: var(--roam-gtd-surface);
  color: var(--roam-gtd-text);
}
.roam-gtd-drawer .bp3-drawer-header {
  background: var(--roam-gtd-surface);
  color: var(--roam-gtd-text);
}
.roam-gtd-drawer .bp3-heading {
  color: var(--roam-gtd-text-muted);
}
.roam-gtd-dialog {
  background: var(--roam-gtd-surface);
  color: var(--roam-gtd-text);
}
.roam-gtd-review-dialog {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: var(--roam-gtd-review-dialog-height);
  max-height: var(--roam-gtd-review-dialog-height);
  min-height: var(--roam-gtd-review-dialog-height);
  overflow: hidden;
  padding-bottom: 0 !important;
}
.roam-gtd-dialog .bp3-dialog-header {
  align-items: center;
  background: var(--roam-gtd-surface);
  border-bottom: none !important;
  border-radius: var(--roam-gtd-radius-md) var(--roam-gtd-radius-md) 0 0;
  box-shadow: none !important;
  color: var(--roam-gtd-text);
  display: flex;
  gap: var(--roam-gtd-space-8);
  justify-content: space-between;
  min-height: unset;
  padding: var(--roam-gtd-space-10) var(--roam-gtd-space-20) var(--roam-gtd-space-4);
}
.roam-gtd-dialog .bp3-dialog-body {
  background: var(--roam-gtd-surface);
  color: var(--roam-gtd-text);
  margin-right: var(--roam-gtd-space-30);
  min-height: var(--roam-gtd-dialog-body-min-height);
  overflow-x: hidden;
}
.roam-gtd-review-dialog .bp3-dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: hidden;
}
.roam-gtd-dialog .bp3-dialog-footer {
  background: var(--roam-gtd-surface);
  border-top: 1px solid var(--roam-gtd-border-subtle);
  color: var(--roam-gtd-text);
  margin: 0;
  padding: var(--roam-gtd-space-14) var(--roam-gtd-space-20);
}
.roam-gtd-dialog .bp3-heading {
  color: var(--roam-gtd-text);
}
.roam-gtd-dialog .bp3-dialog-header .bp3-heading,
.roam-gtd-dialog .roam-gtd-selectable-text,
.roam-gtd-dialog .roam-gtd-hotkey-legend,
.roam-gtd-dialog .roam-gtd-hotkey-legend span {
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}
.roam-gtd-dialog .roam-gtd-dialog-title {
  align-items: center;
  display: flex;
  gap: var(--roam-gtd-space-8);
  justify-content: space-between;
  min-width: 0;
  width: 100%;
}
.roam-gtd-dialog .roam-gtd-dialog-title-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.roam-gtd-dialog .roam-gtd-step-fast-forward-button {
  caret-color: transparent;
  cursor: pointer !important;
  flex: 0 0 auto;
  min-height: var(--roam-gtd-step-button-size);
  min-width: var(--roam-gtd-step-button-size);
  padding: var(--roam-gtd-space-5) var(--roam-gtd-space-7);
  user-select: none;
  -webkit-user-select: none;
}
.roam-gtd-dialog .bp3-progress-bar {
  border-radius: var(--roam-gtd-progress-radius);
  height: var(--roam-gtd-progress-height);
}
.roam-gtd-dialog .bp3-progress-bar .bp3-progress-meter {
  transition: width var(--roam-gtd-transition-progress);
}
.roam-gtd-dialog .roam-gtd-progress-wrapper {
  margin-right: var(--roam-gtd-space-4);
}
@keyframes gtdSkeletonPulse {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.gtd-skeleton {
  animation: gtdSkeletonPulse var(--roam-gtd-skeleton-duration) ease-in-out infinite;
  background: linear-gradient(
    90deg,
    var(--roam-gtd-skeleton-stop-start) 0%,
    var(--roam-gtd-skeleton-stop-mid) 50%,
    var(--roam-gtd-skeleton-stop-start) 100%
  );
  background-size: 200% 100%;
  border-radius: var(--roam-gtd-skeleton-radius);
}
.roam-gtd-dialog .roam-gtd-triage-root {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.roam-gtd-dialog .roam-gtd-triage-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--roam-gtd-space-8);
}
.roam-gtd-dialog .roam-gtd-triage-columns {
  display: flex;
  flex: 1;
  gap: 0;
  height: var(--roam-gtd-triage-columns-height);
  max-height: var(--roam-gtd-triage-columns-height);
  min-height: 0;
}
.roam-gtd-dialog .roam-gtd-triage-left {
  display: flex;
  flex: 3;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-left: var(--roam-gtd-space-12);
  padding-right: var(--roam-gtd-space-32);
  scrollbar-gutter: stable;
}
.roam-gtd-dialog .roam-gtd-triage-right {
  border-left: 1px solid var(--roam-gtd-border-subtle);
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--roam-gtd-space-8);
  margin-left: var(--roam-gtd-space-8);
  max-width: var(--roam-gtd-triage-side-max-width);
  min-height: 0;
  min-width: var(--roam-gtd-triage-side-min-width);
  padding-left: var(--roam-gtd-space-16);
  padding-right: var(--roam-gtd-space-4);
}
.roam-gtd-dialog .roam-gtd-count-animated {
  animation: roam-gtd-count-pulse var(--roam-gtd-count-pulse-duration);
  display: inline-block;
}
@keyframes roam-gtd-count-pulse {
  0% {
    color: var(--roam-gtd-accent);
    transform: translateY(0);
  }
  45% {
    color: var(--roam-gtd-accent-success);
    transform: translateY(-1px);
  }
  100% {
    color: var(--roam-gtd-accent);
    transform: translateY(0);
  }
}
.roam-gtd-dialog .roam-gtd-triage-right .bp3-button.bp3-icon-calendar,
.roam-gtd-dialog .roam-gtd-triage-popover .bp3-button.bp3-icon-calendar {
  background-color: var(--roam-gtd-surface-contrast);
}
.roam-gtd-dialog .roam-gtd-triage-right .bp3-button.bp3-icon-calendar:focus,
.roam-gtd-dialog .roam-gtd-triage-right .bp3-button.bp3-icon-calendar.roam-gtd-calendar-open,
.roam-gtd-dialog .roam-gtd-triage-popover .bp3-button.bp3-icon-calendar:focus,
.roam-gtd-dialog .roam-gtd-triage-popover .bp3-button.bp3-icon-calendar.roam-gtd-calendar-open {
  box-shadow: var(--roam-gtd-shadow-focus);
  outline: none;
}
.roam-gtd-dialog .roam-gtd-triage-right .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled,
.roam-gtd-dialog .roam-gtd-triage-right .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled::before,
.roam-gtd-dialog .roam-gtd-triage-right .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled .bp3-icon,
.roam-gtd-dialog .roam-gtd-triage-right .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled .bp3-icon::before,
.roam-gtd-dialog .roam-gtd-triage-popover .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled,
.roam-gtd-dialog .roam-gtd-triage-popover .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled::before,
.roam-gtd-dialog .roam-gtd-triage-popover .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled .bp3-icon,
.roam-gtd-dialog .roam-gtd-triage-popover .bp3-button.bp3-icon-calendar.roam-gtd-calendar-scheduled .bp3-icon::before {
  color: var(--roam-gtd-accent-calendar) !important;
}
.roam-gtd-unified-row {
  align-items: flex-start;
  border-bottom: 1px solid var(--roam-gtd-border-faint);
  display: flex;
  gap: var(--roam-gtd-space-12);
  padding: var(--roam-gtd-space-6) 0;
  position: relative;
}
.roam-gtd-unified-row:last-child {
  border-bottom: none;
}
.roam-gtd-unified-row__block {
  flex: 1 1 0;
  max-height: 4.2em;
  min-width: 0;
  overflow: hidden;
  padding-left: var(--roam-gtd-space-4);
  padding-right: var(--roam-gtd-space-28);
}
.roam-gtd-unified-row__block:focus-within,
.roam-gtd-unified-row__block--expanded {
  max-height: none;
  overflow: visible;
  position: relative;
  z-index: 1;
}
.roam-gtd-unified-row__native-block .rm-block__controls,
.roam-gtd-unified-row__native-block .rm-block-children,
.roam-gtd-unified-row__native-block .rm-block-separator {
  display: none !important;
}
.roam-gtd-unified-row__native-block--hide-checkbox .rm-checkbox {
  display: none !important;
}
.roam-gtd-unified-row__block:focus-within .roam-gtd-unified-row__native-block .rm-block-children,
.roam-gtd-unified-row__block--expanded .roam-gtd-unified-row__native-block .rm-block-children {
  display: block !important;
}
.roam-gtd-unified-row__block:focus-within
  .roam-gtd-unified-row__native-block
  .rm-block-children
  .rm-block__controls,
.roam-gtd-unified-row__block--expanded
  .roam-gtd-unified-row__native-block
  .rm-block-children
  .rm-block__controls {
  display: flex !important;
}
.roam-gtd-unified-row__block:focus-within
  .roam-gtd-unified-row__native-block
  .rm-block-children
  .rm-block-separator,
.roam-gtd-unified-row__block--expanded
  .roam-gtd-unified-row__native-block
  .rm-block-children
  .rm-block-separator {
  display: block !important;
}
.roam-gtd-unified-row__block .rm-block-main {
  min-width: 0;
}
.roam-gtd-unified-row__block .rm-api-render--block,
.roam-gtd-unified-row__block .roam-block-container,
.roam-gtd-unified-row__block .rm-block-main,
.roam-gtd-unified-row__block .rm-block-children,
.roam-gtd-unified-row__block .rm-block-text,
.roam-gtd-unified-row__block .rm-block__input {
  max-width: 100%;
  min-width: 0;
}
.roam-gtd-unified-row__block .rm-block__input {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.roam-gtd-unified-row__block:focus-within .rm-block__input,
.roam-gtd-unified-row__block:focus-within .rm-block-input,
.roam-gtd-unified-row__block--expanded .rm-block__input,
.roam-gtd-unified-row__block--expanded .rm-block-input {
  display: block;
  overflow: visible;
  text-overflow: clip;
  -webkit-line-clamp: unset;
}
.roam-gtd-unified-row__meta {
  align-items: flex-end;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  flex-shrink: 0;
  gap: var(--roam-gtd-space-2);
  padding-right: var(--roam-gtd-space-2);
  padding-top: 0;
  position: relative;
}
.roam-gtd-unified-row__actions {
  align-items: center;
  display: flex;
  gap: var(--roam-gtd-space-4);
}
.roam-gtd-unified-row__actions .bp3-button {
  min-height: var(--roam-gtd-icon-button-size);
  min-width: var(--roam-gtd-icon-button-size);
  padding: 0 var(--roam-gtd-space-6);
}
.roam-gtd-unified-row__actions .bp3-button .bp3-icon,
.roam-gtd-unified-row__actions .bp3-button::before {
  font-size: 14px;
}
.gtd-project-row .bp3-button.bp3-icon-add::before {
  font-size: 14px;
}
.roam-gtd-unified-row__stale {
  background: none;
  border: none;
  border-radius: var(--roam-gtd-radius-xs);
  color: var(--roam-gtd-text-subtle);
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  line-height: 1.2;
  padding: var(--roam-gtd-space-2) var(--roam-gtd-space-4);
}
.roam-gtd-unified-row__stale:hover {
  background: var(--roam-gtd-hover-stronger);
}
.roam-gtd-unified-row__stale--overdue {
  color: var(--roam-gtd-accent-danger);
}
.roam-gtd-thin-separator {
  align-items: center;
  display: flex;
  gap: var(--roam-gtd-space-8);
  padding: var(--roam-gtd-space-8) 0 var(--roam-gtd-space-4);
}
.roam-gtd-thin-separator:first-child {
  padding-top: 0;
}
.roam-gtd-thin-separator__label {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.roam-gtd-thin-separator__line {
  flex: 1;
  height: 1px;
}
.roam-gtd-person-header-button {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: var(--roam-gtd-space-4);
  margin: 0;
  padding: 0;
}
.roam-gtd-person-header-button:focus,
.roam-gtd-person-header-button:focus-visible {
  outline: none;
}
.roam-gtd-workflow-triage-layer {
  position: absolute;
  width: var(--roam-gtd-workflow-triage-width);
  z-index: 30;
}
.roam-gtd-triage-popover {
  background: var(--roam-gtd-surface);
  border: 1px solid var(--roam-gtd-border-default);
  border-radius: var(--roam-gtd-radius-md);
  box-shadow: var(--roam-gtd-shadow-medium);
  padding: var(--roam-gtd-space-10) var(--roam-gtd-space-12);
  padding-top: calc(var(--roam-gtd-space-10) + 6px);
  position: relative;
  width: var(--roam-gtd-workflow-triage-width);
  z-index: 30;
}
.roam-gtd-triage-popover__caret {
  background: var(--roam-gtd-surface);
  border-radius: 2px;
  height: 14px;
  pointer-events: none;
  position: absolute;
  right: 8px;
  top: -6px;
  transform: rotate(45deg);
  width: 14px;
  z-index: 2;
}
.roam-gtd-triage-popover .bp3-button.bp3-intent-primary.bp3-fill {
  margin-top: 8px;
}
.roam-gtd-triage-popover--hidden {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.roam-gtd-triage-popover__body {
  outline: none;
}
.roam-gtd-tooltip-wrapper {
  position: relative;
}
.roam-gtd-tooltip {
  background: var(--roam-gtd-surface-tooltip);
  border-radius: var(--roam-gtd-radius-sm);
  box-shadow: var(--roam-gtd-shadow-tooltip);
  color: var(--roam-gtd-text-tooltip);
  font-size: 10px;
  left: auto;
  opacity: 0;
  padding: var(--roam-gtd-space-4) var(--roam-gtd-space-8);
  pointer-events: none;
  position: absolute;
  right: 0;
  top: calc(100% + var(--roam-gtd-space-8));
  transform: none;
  transition: opacity var(--roam-gtd-transition-fast);
  white-space: nowrap;
  z-index: 30;
}
.roam-gtd-tooltip::before {
  background: var(--roam-gtd-surface-tooltip);
  content: "";
  height: var(--roam-gtd-tooltip-arrow-size);
  left: auto;
  position: absolute;
  right: var(--roam-gtd-space-12);
  top: calc(-1 * var(--roam-gtd-space-4));
  transform: rotate(45deg);
  width: var(--roam-gtd-tooltip-arrow-size);
}
.roam-gtd-tooltip-wrapper:hover .roam-gtd-tooltip {
  opacity: 1;
  transition: opacity var(--roam-gtd-transition-tooltip-enter);
}
.roam-gtd-dialog .roam-gtd-footer-actions {
  align-items: center;
  display: grid;
  gap: var(--roam-gtd-space-12);
  grid-template-columns: minmax(0, max-content) minmax(0, 1fr) minmax(0, max-content);
  width: 100%;
}
.roam-gtd-dialog .roam-gtd-footer-slot {
  min-width: 0;
}
.roam-gtd-dialog .roam-gtd-footer-slot-right {
  display: flex;
  justify-content: flex-end;
}
.roam-gtd-dialog.roam-gtd-review-dialog.bp3-dialog .bp3-dialog-footer .bp3-button.bp3-intent-primary {
  background-color: var(--roam-gtd-primary-button) !important;
  background-image: none !important;
}
.roam-gtd-dialog .roam-gtd-footer-center {
  align-items: center;
  display: flex;
  gap: var(--roam-gtd-space-8);
  justify-content: center;
  justify-self: center;
  max-width: 100%;
  min-width: 0;
}
.roam-gtd-dialog .roam-gtd-hotkey-legend {
  font-size: 11px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.roam-gtd-dialog .bp3-dialog-header .bp3-heading {
  flex: 1 1 auto;
  font-size: 16px;
  margin: 0;
  min-width: 0;
}
.roam-gtd-dialog .bp3-button:focus:not(:focus-visible),
.roam-gtd-drawer .bp3-button:focus:not(:focus-visible) {
  box-shadow: none;
  outline: none;
}
.roam-gtd-dialog .bp3-button,
.roam-gtd-drawer .bp3-button {
  user-select: none;
  -webkit-user-select: none;
}
.roam-gtd-dialog .bp3-dialog-footer .bp3-button:hover {
  background-color: var(--roam-gtd-hover-strong);
}
div.rm-autocomplete__results,
div.rm-autocomplete__wrapper {
  z-index: 1000;
}
.roamjs-autocomplete-input .bp3-popover-content {
  background: var(--roam-gtd-surface);
  border-radius: var(--roam-gtd-radius-xs);
  box-shadow: var(--roam-gtd-shadow-menu);
  padding: var(--roam-gtd-space-4);
}
.roamjs-autocomplete-input .bp3-menu {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
}
.roam-gtd-schedule-account-menu {
  background: var(--roam-gtd-surface-overlay);
  border: 1px solid var(--roam-gtd-border-overlay);
  border-radius: var(--roam-gtd-radius-xs);
  box-shadow: var(--roam-gtd-shadow-menu);
  left: 0;
  max-height: var(--roam-gtd-schedule-menu-max-height);
  min-width: var(--roam-gtd-schedule-menu-min-width);
  overflow-y: auto;
  padding: var(--roam-gtd-space-6);
  position: absolute;
  top: calc(100% + var(--roam-gtd-space-4));
  z-index: 50;
}
.roam-gtd-schedule-account-button.bp3-button {
  color: var(--roam-gtd-text);
}
.roam-gtd-schedule-account-option {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--roam-gtd-radius-xs);
  color: inherit !important;
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 13px;
  min-height: var(--roam-gtd-action-button-height);
  overflow: hidden;
  padding: var(--roam-gtd-space-4) var(--roam-gtd-space-8);
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
.roam-gtd-schedule-account-option:hover {
  background: var(--roam-gtd-hover-default);
}
.roam-gtd-schedule-account-option[data-selected="true"] {
  background: var(--roam-gtd-hover-soft);
}
.roamjs-autocomplete-input .bp3-menu-item {
  border-radius: var(--roam-gtd-radius-xs);
  color: var(--roam-gtd-text);
  padding: var(--roam-gtd-space-5) var(--roam-gtd-space-7);
}
.roamjs-autocomplete-input .bp3-menu-item:hover,
.roamjs-autocomplete-input .bp3-menu-item.bp3-active {
  background: var(--roam-gtd-surface-hover);
  color: var(--roam-gtd-text-inverse);
}
.roam-gtd-dialog .rm-block--side {
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
}
.roam-gtd-dialog .rm-api-render--block > .rm-block > .rm-block-main > .rm-block__input,
.roam-gtd-dialog .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-main > .rm-block__input {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.roam-gtd-dialog .rm-api-render--block > .rm-block > .rm-block-main > .rm-block-separator,
.roam-gtd-dialog .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-main > .rm-block-separator {
  flex: 0 0 0px !important;
  min-width: 0 !important;
  width: 0 !important;
}
.roam-gtd-dialog .rm-api-render--block > .rm-block > .rm-block-main,
.roam-gtd-dialog .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-main {
  position: relative;
}
.roam-gtd-dialog .rm-api-render--block > .rm-block > .rm-block-main > div:last-child:not(.rm-block__input):not(.controls):not(.rm-block-separator),
.roam-gtd-dialog .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-main > div:last-child:not(.rm-block__input):not(.controls):not(.rm-block-separator) {
  flex: 0 0 0px !important;
  min-width: 0 !important;
  width: 0 !important;
}
.roam-gtd-dialog .block-ref-count-button {
  position: absolute !important;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}
.roam-gtd-dialog .rm-api-render--block > .rm-block > .rm-block-main > .rm-block__controls,
.roam-gtd-dialog .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-main > .rm-block__controls {
  display: none !important;
}
.roam-gtd-dialog .rm-block-children .rm-bullet,
.roam-gtd-dialog .rm-block-children .block-expand {
  visibility: visible !important;
}
.roam-gtd-dialog .rm-api-render--block > .rm-block > .rm-block-children > .rm-multibar,
.roam-gtd-dialog .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-children > .rm-multibar {
  display: none !important;
}
.roam-gtd-dialog .rm-api-render--block > .rm-block > .rm-block-children,
.roam-gtd-dialog .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-children {
  margin-left: calc(-1 * var(--roam-gtd-space-13)) !important;
}
.gtd-project-detail-page .rm-api-render--block > .rm-block > .rm-block-main,
.gtd-project-detail-page .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-main {
  display: none !important;
}
.gtd-project-detail-page .rm-api-render--block > .rm-block > .rm-block-children,
.gtd-project-detail-page .rm-api-render--block > .rm-block--side > .rm-block > .rm-block-children {
  margin-left: 0 !important;
}
.gtd-project-detail-page .rm-title-display-container {
  display: none !important;
}
.bp3-dialog .gtd-project-detail-page .rm-mentions-search .rm-mentions-search__input.bp3-input {
  background: var(--roam-gtd-surface-input) !important;
}
.roam-gtd-trigger-list .rm-title-display {
  display: none !important;
}
.roam-gtd-trigger-list .rm-reference-main {
  display: none !important;
}
`;

export const GTD_STYLES = `${GTD_STYLE_TOKENS}
${GTD_STYLE_RULES}`;

export function mountExtensionStyles(): HTMLStyleElement {
  const element = document.createElement("style");
  element.id = "roam-gtd-styles";
  element.textContent = GTD_STYLES;
  document.head.append(element);
  return element;
}
