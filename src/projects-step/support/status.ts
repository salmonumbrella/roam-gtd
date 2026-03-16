import { executeQuery } from "../../data";
import { buildStatusAttributeOptionsQuery } from "../../queries";

export type ProjectRefreshScheduler = (delayMs: number, options: { scope: "projects" }) => void;

export interface PersistProjectStatusChangeArgs {
  createBlock: (input: {
    block: { string: string; uid?: string };
    location: { order: number | "last"; "parent-uid": string };
  }) => Promise<unknown>;
  newStatus: string;
  pageUid: string;
  refreshDelayMs: number;
  scheduleRefresh: ProjectRefreshScheduler;
  statusBlockUid: string | null;
  updateBlock: (input: { block: { string: string; uid: string } }) => Promise<unknown>;
}

interface StatusSelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

let cachedProjectStatusOptions: Array<string> | null = null;
let projectStatusOptionsRequest: Promise<Array<string>> | null = null;

function normalizeStatusOptions(rows: Array<ReadonlyArray<unknown>>): Array<string> {
  const nextOptions: Array<string> = [];
  const sortedRows = rows
    .filter(
      (row): row is readonly [string, number] =>
        row.length >= 2 && typeof row[0] === "string" && typeof row[1] === "number",
    )
    .sort((a, b) => a[1] - b[1]);
  for (const row of sortedRows) {
    const option = row[0].trim();
    if (option && !nextOptions.includes(option)) {
      nextOptions.push(option);
    }
  }
  return nextOptions;
}

export function loadProjectStatusOptions(): Promise<Array<string>> {
  if (cachedProjectStatusOptions) {
    return Promise.resolve(cachedProjectStatusOptions);
  }
  if (projectStatusOptionsRequest) {
    return projectStatusOptionsRequest;
  }
  projectStatusOptionsRequest = executeQuery(buildStatusAttributeOptionsQuery())
    .then((rows) => {
      const nextOptions = normalizeStatusOptions(rows);
      cachedProjectStatusOptions = nextOptions;
      projectStatusOptionsRequest = null;
      return nextOptions;
    })
    .catch(() => {
      projectStatusOptionsRequest = null;
      return [];
    });
  return projectStatusOptionsRequest;
}

export function parseStatusTag(status: string): { dataTag: string; displayLabel: string } | null {
  const trimmed = status.trim();
  if (!trimmed) {
    return null;
  }
  const match =
    trimmed.match(/^#\[\[(.+?)\]\]$/) ??
    trimmed.match(/^\[\[(.+?)\]\]$/) ??
    trimmed.match(/^#(.+)$/);
  if (!match) {
    return null;
  }
  const title = match[1]?.trim();
  if (!title) {
    return null;
  }
  return {
    dataTag: title,
    displayLabel: title,
  };
}

export function getNextStatusMenuIndex(
  currentIndex: number,
  optionCount: number,
  direction: "backward" | "forward",
): number {
  if (optionCount <= 0) {
    return -1;
  }
  if (currentIndex < 0 || currentIndex >= optionCount) {
    return direction === "backward" ? optionCount - 1 : 0;
  }
  const delta = direction === "backward" ? -1 : 1;
  return (currentIndex + delta + optionCount) % optionCount;
}

export async function persistProjectStatusChange({
  createBlock,
  newStatus,
  pageUid,
  refreshDelayMs,
  scheduleRefresh,
  statusBlockUid,
  updateBlock,
}: PersistProjectStatusChangeArgs): Promise<boolean> {
  if (!pageUid) {
    return false;
  }
  const trimmedStatus = newStatus.trim();
  const globalWithRoam = globalThis as typeof globalThis & {
    roamAlphaAPI?: { util?: { generateUID?: () => string } };
  };
  const roamAlphaAPI =
    typeof window !== "undefined" ? window.roamAlphaAPI : globalWithRoam.roamAlphaAPI;

  try {
    if (statusBlockUid) {
      await updateBlock({
        block: {
          string: trimmedStatus ? `Status:: ${trimmedStatus}` : "Status::",
          uid: statusBlockUid,
        },
      });
    } else if (trimmedStatus) {
      const generatedUid = roamAlphaAPI?.util?.generateUID?.();
      await createBlock({
        block: {
          string: `Status:: ${trimmedStatus}`,
          uid: generatedUid,
        },
        location: { order: "last", "parent-uid": pageUid },
      });
    } else {
      return false;
    }
  } catch {
    return false;
  }

  scheduleRefresh(refreshDelayMs, { scope: "projects" });
  return true;
}

function isHiddenEmptyStatusOption(option: string): boolean {
  return option.trim().length === 0 || option.trim().toLowerCase() === "none";
}

export function getStatusBadgeSelectState({
  options,
  status,
  unknownLabel,
}: {
  options: Array<string>;
  status: string | null;
  unknownLabel: string;
}): {
  badgeLabel: string;
  selectOptions: Array<StatusSelectOption>;
  selectValue: string;
} {
  const currentStatusRaw = status?.trim() ?? "";
  const currentStatus = isHiddenEmptyStatusOption(currentStatusRaw) ? "" : currentStatusRaw;
  const normalizedOptions: Array<string> = [];
  for (const option of options) {
    const trimmed = option.trim();
    if (!isHiddenEmptyStatusOption(trimmed) && !normalizedOptions.includes(trimmed)) {
      normalizedOptions.push(trimmed);
    }
  }
  if (currentStatus.length > 0 && !normalizedOptions.includes(currentStatus)) {
    normalizedOptions.unshift(currentStatus);
  }

  return {
    badgeLabel: currentStatus || unknownLabel,
    selectOptions: normalizedOptions.map((option) => ({ label: option, value: option })),
    selectValue: currentStatus,
  };
}
