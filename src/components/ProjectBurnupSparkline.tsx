import React from "react";

import type { ProjectBurnupPoint } from "../store/dashboard-derived";

interface ProjectBurnupSparklineProps {
  color: string;
  data: Array<ProjectBurnupPoint>;
  height?: number;
  width?: number;
}

function getPoints(args: {
  data: Array<ProjectBurnupPoint>;
  height: number;
  key: "completed" | "scope";
  width: number;
}): string {
  const { data, height, key, width } = args;
  const safeData =
    data.length > 1
      ? data
      : data.length === 1
        ? [data[0], data[0]]
        : [
            { completed: 0, scope: 0 },
            { completed: 0, scope: 0 },
          ];
  const maxValue = Math.max(1, ...safeData.map((point) => Math.max(point.completed, point.scope)));

  return safeData
    .map((point, index) => {
      const x = safeData.length === 1 ? width / 2 : (index / (safeData.length - 1)) * width;
      const normalized = point[key] / maxValue;
      const y = height - normalized * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function ProjectBurnupSparkline({
  color,
  data,
  height = 20,
  width = 48,
}: ProjectBurnupSparklineProps) {
  const scopePoints = getPoints({ data, height, key: "scope", width });
  const completedPoints = getPoints({ data, height, key: "completed", width });

  return (
    <svg
      aria-hidden
      focusable="false"
      height={height}
      style={{ display: "block", overflow: "visible" }}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <polyline
        fill="none"
        points={scopePoints}
        stroke="rgba(127, 132, 156, 0.8)"
        strokeDasharray="2 2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
      />
      <polyline
        fill="none"
        points={completedPoints}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
