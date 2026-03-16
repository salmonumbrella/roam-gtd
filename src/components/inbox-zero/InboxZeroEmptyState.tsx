import React from "react";

interface InboxZeroEmptyStateProps {
  description: string;
  title: string;
}

export function InboxZeroEmptyState({ description, title }: InboxZeroEmptyStateProps) {
  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <span className="bp3-icon bp3-icon-tick-circle" style={{ color: "#a6e3a1", fontSize: 42 }} />
      <h4 className="bp3-heading" style={{ marginTop: 12 }}>
        {title}
      </h4>
      <p className="bp3-text-muted">{description}</p>
    </div>
  );
}
