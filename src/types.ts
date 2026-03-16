export interface TodoItem {
  ageDays: number;
  createdTime: number;
  deferredDate: string | null;
  editTime?: number;
  pageTitle: string;
  text: string;
  uid: string;
}

export interface ProjectSummary {
  doneCount: number;
  lastDoneTime: number | null;
  lastTodoCreatedTime: number | null;
  lastTodoText: string | null;
  lastTodoUid: string | null;
  pageTitle: string;
  pageUid: string;
  statusBlockUid: string | null;
  statusText: string | null;
  todoCount: number;
  todoListUid: string | null;
  totalCount: number;
}

export interface TopGoalEntry {
  goal: string;
  pageTitle: string;
  text: string;
  uid: string;
}

export interface TicklerGroup {
  dailyPageUid: string;
  dailyTitle: string;
  items: Array<TodoItem>;
}

export interface WeeklyMetrics {
  avgTime: number | null;
  completed: number;
  delegated: number;
  nextActions: number;
  projects: number;
  someday: number;
  stale: number;
  waitingFor: number;
}

export type GtdCategory =
  | "inbox"
  | "nextAction"
  | "waitingFor"
  | "delegated"
  | "someday"
  | "stale"
  | "deferred";
