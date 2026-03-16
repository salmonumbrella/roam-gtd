import { runRoamQuery, type QueryRow } from "../data";
import { getISOWeekNumber, getMondayOfWeek } from "../date-utils";
import type { PersonEntry } from "../people";
import type { ProjectSummary } from "../types";
import type { ReviewWizardMode } from "./wizard-support";

let persistedStepIndex = 0;
const DELEGATED_PERSON_REFS_CACHE_TTL_MS = 30_000;

export interface DelegatedPersonRefsSnapshot {
  childPersonRefs: Map<string, Array<string>>;
  people: Array<PersonEntry>;
}

interface DelegatedPersonRefsCacheEntry extends DelegatedPersonRefsSnapshot {
  key: string;
  loadedAt: number;
}

let delegatedPersonRefsCache: DelegatedPersonRefsCacheEntry | null = null;
const NEW_PROJECT_TODO_PLACEHOLDER = "{{[[TODO]]}} ";

function blockExists(uid: string): boolean {
  const data = window.roamAlphaAPI.data.pull("[:block/uid :block/string]", [":block/uid", uid]);
  if (!data?.[":block/uid"]) {
    return false;
  }
  const str = data[":block/string"] ?? "";
  return str.trim().length > 0;
}

function getDismissedProjectsStorageKey(): string {
  const monday = getMondayOfWeek(new Date());
  const week = getISOWeekNumber(monday);
  const year = monday.getFullYear();
  return `gtd-dismissed-projects-${year}-W${String(week).padStart(2, "0")}`;
}

export function getInitialReviewStepIndex(mode: ReviewWizardMode): number {
  return mode === "daily" ? 0 : persistedStepIndex;
}

export function persistReviewStepIndex(mode: ReviewWizardMode, stepIndex: number): void {
  if (mode === "weekly") {
    persistedStepIndex = stepIndex;
  }
}

export function buildDelegatedPersonRefsCacheKey(
  blockUids: Array<string>,
  delegateTags: Array<string>,
): string {
  return `${delegateTags.join("\u001f")}\u001e${blockUids.join("\u001f")}`;
}

export function getCachedDelegatedPersonRefs(
  key: string,
  now = Date.now(),
): DelegatedPersonRefsSnapshot | null {
  if (
    delegatedPersonRefsCache == null ||
    delegatedPersonRefsCache.key !== key ||
    now - delegatedPersonRefsCache.loadedAt >= DELEGATED_PERSON_REFS_CACHE_TTL_MS
  ) {
    return null;
  }
  return delegatedPersonRefsCache;
}

export function cacheDelegatedPersonRefs(
  key: string,
  snapshot: DelegatedPersonRefsSnapshot,
  loadedAt = Date.now(),
): void {
  delegatedPersonRefsCache = {
    ...snapshot,
    key,
    loadedAt,
  };
}

export function normalizeDelegatedPersonRefs(rows: Array<QueryRow>): DelegatedPersonRefsSnapshot {
  const childPersonRefs = new Map<string, Array<string>>();
  const peopleMap = new Map<string, PersonEntry>();

  for (const row of rows) {
    if (!(Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string")) {
      continue;
    }

    const [todoUid, personTitle] = row;
    const personPageUid = typeof row[2] === "string" ? row[2] : personTitle;
    const list = childPersonRefs.get(todoUid) ?? [];
    list.push(personTitle);
    childPersonRefs.set(todoUid, list);

    const key = personTitle.toLowerCase();
    if (!peopleMap.has(key)) {
      peopleMap.set(key, { title: personTitle, uid: personPageUid });
    }
  }

  return {
    childPersonRefs,
    people: Array.from(peopleMap.values()).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export function loadDismissedProjectUids(): Set<string> {
  try {
    const raw = localStorage.getItem(getDismissedProjectsStorageKey());
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch {
    // ignore corrupt data
  }
  return new Set();
}

export function getOrderedProjects(
  projects: Array<ProjectSummary>,
  optimisticProjectTodos: Record<string, ProjectSummary>,
  projectOrder: Array<string> | null,
): { projectOrder: Array<string>; projects: Array<ProjectSummary> } {
  const merged = projects.map((project) => optimisticProjectTodos[project.pageUid] ?? project);
  if (projectOrder == null) {
    return {
      projectOrder: merged.map((project) => project.pageUid),
      projects: merged,
    };
  }
  const orderIndex = new Map(projectOrder.map((uid, index) => [uid, index]));
  const sorted = [...merged].sort((left, right) => {
    const leftIndex = orderIndex.get(left.pageUid) ?? projectOrder.length;
    const rightIndex = orderIndex.get(right.pageUid) ?? projectOrder.length;
    return leftIndex - rightIndex;
  });
  const newUids = sorted
    .filter((project) => !orderIndex.has(project.pageUid))
    .map((project) => project.pageUid);
  return {
    projectOrder: newUids.length > 0 ? [...projectOrder, ...newUids] : projectOrder,
    projects: sorted,
  };
}

export function saveDismissedProjectUids(uids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(getDismissedProjectsStorageKey(), JSON.stringify([...uids]));
  } catch {
    // storage full — silently ignore
  }
}

export function reconcileOptimisticProjectTodos(args: {
  blockExistsFn?: (uid: string) => boolean;
  focusRequestUid: string | null;
  optimisticProjectTodos: Record<string, ProjectSummary>;
  projects: Array<ProjectSummary>;
}): {
  changed: boolean;
  nextFocusRequestUid: string | null;
  nextOptimisticProjectTodos: Record<string, ProjectSummary>;
} {
  const { blockExistsFn = blockExists, focusRequestUid, optimisticProjectTodos, projects } = args;
  const currentEntries = Object.entries(optimisticProjectTodos);
  if (currentEntries.length === 0) {
    return {
      changed: false,
      nextFocusRequestUid: focusRequestUid,
      nextOptimisticProjectTodos: optimisticProjectTodos,
    };
  }

  const projectsByUid = new Map(projects.map((project) => [project.pageUid, project]));
  const nextOptimisticProjectTodos: Record<string, ProjectSummary> = {};
  let changed = false;
  let nextFocusRequestUid = focusRequestUid;

  for (const [pageUid, optimisticProject] of currentEntries) {
    const project = projectsByUid.get(pageUid);
    if (!project) {
      changed = true;
      continue;
    }

    const optimisticTodoUid = optimisticProject.lastTodoUid;
    const sameTodoUid = optimisticTodoUid != null && project.lastTodoUid === optimisticTodoUid;
    const todoSynced =
      !optimisticTodoUid ||
      (sameTodoUid &&
        (optimisticProject.lastTodoText === NEW_PROJECT_TODO_PLACEHOLDER ||
          optimisticProject.lastTodoText === project.lastTodoText));
    const statusSynced = optimisticProject.statusText === project.statusText;
    if (todoSynced && statusSynced) {
      changed = true;
      if (nextFocusRequestUid === optimisticTodoUid) {
        nextFocusRequestUid = null;
      }
      continue;
    }

    if (!todoSynced) {
      const shouldRemoveTodo =
        !sameTodoUid && (project.lastTodoUid !== null || !blockExistsFn(optimisticTodoUid!));
      if (shouldRemoveTodo) {
        changed = true;
        if (nextFocusRequestUid === optimisticTodoUid) {
          nextFocusRequestUid = null;
        }
        continue;
      }
    }

    nextOptimisticProjectTodos[pageUid] = optimisticProject;
  }

  if (!changed && nextFocusRequestUid === focusRequestUid) {
    return {
      changed: false,
      nextFocusRequestUid: focusRequestUid,
      nextOptimisticProjectTodos: optimisticProjectTodos,
    };
  }

  return { changed: true, nextFocusRequestUid, nextOptimisticProjectTodos };
}

export function findPageUid(title: string): string | null {
  const rows = runRoamQuery(
    `[:find ?uid
      :in $ ?title
      :where
        [?p :node/title ?title]
        [?p :block/uid ?uid]]`,
    title,
  );

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 1) {
      continue;
    }
    const uid = row[0];
    if (typeof uid === "string") {
      return uid;
    }
  }

  return null;
}

export async function getOrCreateProjectTodoListUid(project: ProjectSummary): Promise<string> {
  if (project.todoListUid) {
    return project.todoListUid;
  }
  const todoListUid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    block: { string: "Todo List::", uid: todoListUid },
    location: { order: "last", "parent-uid": project.pageUid },
  });
  return todoListUid;
}
