import React from "react";

import type {
  ReviewWizardFooterButton,
  ReviewWizardFooterLabelKey,
  ReviewWizardFooterLegendSegment,
} from "../../review/wizard-navigation";

export interface ReviewWizardFooterLabels {
  back: string;
  finish: string;
  next: string;
  nextItem: string;
  nextStep: string;
  previousItem: string;
  saveWeeklySummary: string;
  summarySaved: string;
}

interface ReviewWizardFooterProps {
  labels: ReviewWizardFooterLabels;
  leftAction: ReviewWizardFooterButton | null;
  legendSegments: Array<ReviewWizardFooterLegendSegment> | null;
  onAction: (action: ReviewWizardFooterButton["action"]) => void;
  rightAction: ReviewWizardFooterButton | null;
}

function getLabel(labels: ReviewWizardFooterLabels, labelKey: ReviewWizardFooterLabelKey): string {
  return labels[labelKey];
}

function renderActionButton(
  action: ReviewWizardFooterButton | null,
  labels: ReviewWizardFooterLabels,
  onAction: (action: ReviewWizardFooterButton["action"]) => void,
) {
  if (!action) {
    return <div />;
  }

  const intentClass = action.intent === "primary" ? " bp3-intent-primary" : "";
  const iconClass = action.icon ? ` bp3-icon-${action.icon}` : "";

  return (
    <button
      className={`bp3-button${intentClass}${iconClass}`}
      disabled={action.disabled}
      onClick={() => onAction(action.action)}
      type="button"
    >
      {getLabel(labels, action.labelKey)}
    </button>
  );
}

export function ReviewWizardFooter({
  labels,
  leftAction,
  legendSegments,
  onAction,
  rightAction,
}: ReviewWizardFooterProps) {
  return (
    <div className="bp3-dialog-footer">
      <div className="bp3-dialog-footer-actions roam-gtd-footer-actions">
        <div className="roam-gtd-footer-slot">
          {renderActionButton(leftAction, labels, onAction)}
        </div>
        <div className="roam-gtd-footer-center">
          {legendSegments?.length ? (
            <span className="roam-gtd-hotkey-legend">
              {legendSegments.map((segment, index) => (
                <span key={`${segment.text}-${index}`} style={{ color: segment.color }}>
                  {segment.text}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <div className="roam-gtd-footer-slot roam-gtd-footer-slot-right">
          {renderActionButton(rightAction, labels, onAction)}
        </div>
      </div>
    </div>
  );
}
