import React from "react";

interface StepEmptyStateInput {
  icon?: string;
  subtitle?: string;
  title: string;
  variant: "complete" | "empty";
}

interface StepEmptyStateResolved {
  icon: string;
  iconColor?: string;
  subtitle?: string;
  title: string;
}

export function getStepEmptyStateProps(input: StepEmptyStateInput): StepEmptyStateResolved {
  if (input.variant === "complete") {
    return {
      icon: "tick-circle",
      iconColor: "#466B46",
      subtitle: input.subtitle,
      title: input.title,
    };
  }
  return {
    icon: input.icon ?? "inbox",
    subtitle: input.subtitle,
    title: input.title,
  };
}

export function StepEmptyState({ icon, subtitle, title, variant }: StepEmptyStateInput) {
  const resolved = getStepEmptyStateProps({ icon, subtitle, title, variant });

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <span
        className={`bp3-icon bp3-icon-${resolved.icon}`}
        style={{ color: resolved.iconColor, fontSize: 42 }}
      />
      {variant === "complete" ? (
        <h4 className="bp3-heading" style={{ color: "#cdd6f4", marginTop: 12 }}>
          {resolved.title}
        </h4>
      ) : (
        <p style={{ marginTop: 12 }}>{resolved.title}</p>
      )}
      {resolved.subtitle ? (
        <p style={{ color: "#A5A5A5", fontSize: 12, marginTop: 4 }}>{resolved.subtitle}</p>
      ) : null}
    </div>
  );
}
