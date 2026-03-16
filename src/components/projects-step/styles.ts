const PROJECTS_STEP_STYLE_ID = "gtd-projects-step-style";

const PROJECTS_STEP_STYLE = `
  .gtd-block-inline.gtd-block-preview .roam-block-container { margin: 0; padding: 0; }
  .gtd-block-inline.gtd-block-preview .rm-block-main { display: flex; align-items: center; }
  .gtd-block-inline.gtd-block-preview .rm-block__controls { display: none !important; }
  .gtd-block-inline.gtd-block-preview .rm-block-children { display: none !important; }
  .gtd-block-inline.gtd-block-preview .rm-block-separator { display: none !important; }
  .gtd-block-inline.gtd-block-preview .rm-block__input {
    margin: 0;
    padding: 0;
    pointer-events: none;
  }
  .gtd-block-inline.gtd-block-preview .rm-page-ref { pointer-events: auto; }
  .gtd-block-inline.gtd-block-preview .rm-checkbox .checkmark {
    width: 12px;
    height: 12px;
  }
  .gtd-project-status { position: relative; }
  .gtd-project-top-control.bp3-button {
    min-width: 0;
    overflow: hidden;
    padding: 0;
  }
  .gtd-project-top-control:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .gtd-project-top-control:focus,
  .gtd-project-top-control:focus-visible,
  .gtd-project-top-control[data-open="true"] {
    box-shadow: 0 0 0 1px #137cbd, 0 0 0 3px rgba(19, 124, 189, 0.3), inset 0 1px 1px rgba(16, 22, 26, 0.2);
    outline: none;
  }
  .gtd-project-status-menu {
    background: rgba(30, 30, 30, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    box-shadow: 0 0 0 1px rgba(16, 22, 26, 0.1), 0 2px 4px rgba(16, 22, 26, 0.2),
      0 8px 24px rgba(16, 22, 26, 0.2);
    max-height: 132px;
    min-width: 168px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px;
    position: absolute;
    right: 0;
    scrollbar-gutter: stable;
    top: calc(100% + 6px);
    z-index: 40;
  }
  .gtd-status-badge {
    align-items: center;
    display: inline-flex;
    justify-content: center;
    line-height: 18px;
    min-height: 24px;
    min-width: 56px;
    padding: 0 8px;
  }
  .gtd-project-preview {
    color: rgba(255, 255, 255, 0.88);
    font-size: 14px;
    line-height: 1.4;
    min-height: 18px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gtd-project-preview .rm-page-ref,
  .gtd-project-preview .rm-page-ref span {
    pointer-events: none;
  }
  .gtd-project-preview-button {
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;
    display: block;
    font: inherit;
    margin: 0;
    padding: 0;
    text-align: left;
    width: 100%;
  }
  .gtd-project-preview-button:focus,
  .gtd-project-preview-button:focus-visible {
    outline: none;
  }
  .gtd-project-status-option {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
    display: flex;
    justify-content: flex-start;
    min-height: 32px;
    padding: 6px 8px;
    width: 100%;
  }
  .gtd-project-status-option:hover,
  .gtd-project-status-option:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    outline: none;
  }
  .gtd-project-status-option[data-selected="true"] {
    background: rgba(255, 255, 255, 0.06);
  }
  .gtd-project-status-option[data-highlighted="true"] {
    background: rgba(255, 255, 255, 0.08);
  }
`;

export function ensureProjectsStepStyle(): void {
  if (document.getElementById(PROJECTS_STEP_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = PROJECTS_STEP_STYLE_ID;
  style.textContent = PROJECTS_STEP_STYLE;
  document.head.append(style);
}
