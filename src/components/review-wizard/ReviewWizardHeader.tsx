import { ProgressBar } from "@blueprintjs/core";
import React from "react";

interface ReviewWizardHeaderProps {
  fastForwardLabel: string;
  onFastForward: () => void;
  onFastForwardMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  showFastForwardButton: boolean;
  title: string;
}

export function ReviewWizardHeader({
  fastForwardLabel,
  onFastForward,
  onFastForwardMouseDown,
  showFastForwardButton,
  title,
}: ReviewWizardHeaderProps) {
  return (
    <span className="roam-gtd-dialog-title">
      <span className="roam-gtd-dialog-title-text">{title}</span>
      {showFastForwardButton ? (
        <button
          aria-label={fastForwardLabel}
          className="bp3-button bp3-minimal bp3-icon-fast-forward roam-gtd-step-fast-forward-button"
          onClick={onFastForward}
          onMouseDown={onFastForwardMouseDown}
          title={fastForwardLabel}
          type="button"
        />
      ) : null}
    </span>
  );
}

export function ReviewWizardProgressBar({ progressValue }: { progressValue: number }) {
  return (
    <div className="roam-gtd-progress-wrapper" style={{ marginBottom: 12 }}>
      <ProgressBar animate={false} intent="primary" stripes={false} value={progressValue} />
    </div>
  );
}
