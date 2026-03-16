import type { ProjectSummary, TodoItem } from "../types";

const DAY_MS = 86_400_000;

const ACCENT_PALETTE = [
  "#89b4fa",
  "#a6e3a1",
  "#f9e2af",
  "#fab387",
  "#f38ba8",
  "#94e2d5",
  "#cba6f7",
  "#f5c2e7",
  "#f2cdcd",
  "#89dceb",
  "#b4befe",
] as const;

const HEALTH_ORDER = {
  canceled: 4,
  completed: 0,
  lagging: 2,
  "on track": 1,
  poor: 3,
} as const;

export type ProjectHealth = keyof typeof HEALTH_ORDER;

export interface ProjectHistoryEntry {
  createTime: number;
  editTime: number | null;
  isDone: boolean | number;
  projectUid: string;
  todoUid: string;
}

export interface ProjectBurnupPoint {
  completed: number;
  scope: number;
}

function normalizeProjectStatus(statusText: string | null | undefined): string {
  return (
    statusText?.trim().replace(/^#/, "").replace(/^\[\[/, "").replace(/\]\]$/, "").toLowerCase() ??
    ""
  );
}

export function computeAvgTime(items: ReadonlyArray<TodoItem>): number | null {
  const completedItems = items.filter(
    (item): item is TodoItem & { editTime: number } =>
      typeof item.editTime === "number" && item.editTime > item.createdTime,
  );
  if (completedItems.length === 0) {
    return null;
  }
  const totalDays = completedItems.reduce(
    (sum, item) => sum + (item.editTime - item.createdTime) / DAY_MS,
    0,
  );
  return totalDays / completedItems.length;
}

export function computeProjectHealth(
  project: Pick<ProjectSummary, "doneCount" | "lastDoneTime" | "statusText" | "totalCount">,
  now: number,
): ProjectHealth {
  const normalizedStatus = normalizeProjectStatus(project.statusText);
  const doneCount = project.doneCount ?? 0;
  const totalCount = project.totalCount ?? 0;
  if (normalizedStatus === "x" || normalizedStatus === "❌" || normalizedStatus === "cancelled") {
    return "canceled";
  }

  if (totalCount > 0 && doneCount >= totalCount) {
    return "completed";
  }

  if (project.lastDoneTime == null) {
    return "poor";
  }

  const daysSinceLastDone = (now - project.lastDoneTime) / DAY_MS;
  if (daysSinceLastDone < 7) {
    return "on track";
  }
  if (daysSinceLastDone <= 10) {
    return "lagging";
  }
  return "poor";
}

export function getProjectColor(uid: string): string {
  let hash = 0;
  for (let index = 0; index < uid.length; index += 1) {
    hash = ((hash << 5) - hash + uid.charCodeAt(index)) | 0;
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length];
}

export function sortProjectsByHealth<
  T extends { health: ProjectHealth; lastDoneTime?: number | null },
>(projects: Array<T>): Array<T> {
  return [...projects].sort((left, right) => {
    const healthOrderDiff = HEALTH_ORDER[left.health] - HEALTH_ORDER[right.health];
    if (healthOrderDiff !== 0) {
      return healthOrderDiff;
    }
    return (right.lastDoneTime ?? 0) - (left.lastDoneTime ?? 0);
  });
}

export function computeWeekOverWeekDelta(
  current: number,
  previous: number | null | undefined,
): { direction: "down" | "flat" | "up"; pct: number; previous: number } | null {
  if (previous == null) {
    return null;
  }
  if (previous === 0 && current === 0) {
    return { direction: "flat", pct: 0, previous: 0 };
  }
  if (previous === 0) {
    return { direction: "up", pct: 100, previous: 0 };
  }

  const rawPct = Math.round(((current - previous) / previous) * 100);
  return {
    direction: rawPct > 0 ? "up" : rawPct < 0 ? "down" : "flat",
    pct: Math.abs(rawPct),
    previous,
  };
}

export function buildProjectBurnupData(
  history: Array<ProjectHistoryEntry>,
  options: { bucketCount?: number; now?: number } = {},
): Array<ProjectBurnupPoint> {
  const bucketCount = Math.max(options.bucketCount ?? 6, 2);
  if (history.length === 0) {
    return [];
  }

  const start = Math.min(...history.map((entry) => entry.createTime));
  const now = Math.max(options.now ?? Date.now(), start);
  const range = Math.max(now - start, 1);

  return Array.from({ length: bucketCount }, (_, index) => {
    const ratio = bucketCount === 1 ? 1 : index / (bucketCount - 1);
    const cutoff = start + Math.round(range * ratio);
    return {
      completed: history.filter(
        (entry) => Boolean(entry.isDone) && entry.editTime != null && entry.editTime <= cutoff,
      ).length,
      scope: history.filter((entry) => entry.createTime <= cutoff).length,
    };
  });
}
