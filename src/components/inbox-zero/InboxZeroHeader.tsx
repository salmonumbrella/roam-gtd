import React from "react";

interface InboxZeroHeaderProps {
  currentIndexColor: string;
  currentPosition: number;
  showTwoMinuteRule: boolean;
  total: number;
  twoMinuteRuleLabel: string;
}

export function InboxZeroHeader({
  currentIndexColor,
  currentPosition,
  showTwoMinuteRule,
  total,
  twoMinuteRuleLabel,
}: InboxZeroHeaderProps) {
  return (
    <div className="roam-gtd-triage-header">
      <p style={{ color: "#7f849c", fontSize: 12, margin: 0 }}>
        {total > 0 ? (
          <>
            <span style={{ color: currentIndexColor, transition: "none" }}>{currentPosition}</span>
            <span style={{ color: "#A5A5A5" }}>{" of "}</span>
            <span style={{ color: "#A5A5A5" }}>{total}</span>
          </>
        ) : (
          <span
            className="gtd-skeleton"
            style={{ display: "inline-block", height: 14, width: 40 }}
          />
        )}
      </p>
      {showTwoMinuteRule ? (
        <span
          className="roam-gtd-selectable-text"
          style={{
            color: "#f38ba8",
            fontSize: 13,
            fontWeight: 500,
            paddingRight: 4,
          }}
        >
          {twoMinuteRuleLabel}
        </span>
      ) : null}
    </div>
  );
}
