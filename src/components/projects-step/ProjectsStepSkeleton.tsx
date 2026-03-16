import React, { useEffect } from "react";

import { ensureProjectsStepStyle } from "./styles";

export function ProjectsStepSkeleton({ projectCount }: { projectCount: number }) {
  useEffect(() => {
    ensureProjectsStepStyle();
  }, []);

  const rows = [0, 1, 2, 3, 4];
  const counterWidth = Math.max(48, 32 + String(projectCount).length * 10);

  return (
    <div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          minHeight: 14,
        }}
      >
        <div
          className="gtd-skeleton"
          style={{
            height: 12,
            width: projectCount > 0 ? counterWidth : 40,
          }}
        />
      </div>
      <div
        style={{ marginTop: 8, maxHeight: 400, overflowY: "auto", overscrollBehavior: "contain" }}
      >
        {rows.map((row) => (
          <div
            key={row}
            style={{
              borderBottom: "1px solid rgba(127, 132, 156, 0.15)",
              padding: "10px 0",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              <div
                className="gtd-skeleton"
                style={{ flex: "1 1 auto", height: 18, maxWidth: "48%" }}
              />
              <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: 8 }}>
                <div className="gtd-skeleton" style={{ height: 18, width: 132 }} />
                <div className="gtd-skeleton" style={{ borderRadius: 6, height: 18, width: 18 }} />
              </div>
            </div>
            <div className="gtd-skeleton" style={{ height: 14, marginTop: 10, width: "64%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
