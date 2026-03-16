export type Locale = "en" | "zh-TW";

type StaticKey =
  | "inbox"
  | "next"
  | "waiting"
  | "delegated"
  | "someday"
  | "stale"
  | "deferred"
  | "projects"
  | "gtd"
  | "weeklyReview"
  | "noActiveProjects"
  | "allClear"
  | "dailyReviewTitle"
  | "loading"
  | "markDone"
  | "step1Title"
  | "step1Desc"
  | "step2Title"
  | "step2Desc"
  | "step3Title"
  | "step3Desc"
  | "step4Title"
  | "step4Desc"
  | "step5Title"
  | "step5Desc"
  | "step6Title"
  | "step6Desc"
  | "step7Title"
  | "step7Desc"
  | "step8Title"
  | "step8Desc"
  | "actionDone"
  | "actionNext"
  | "actionWaiting"
  | "actionDelegated"
  | "actionSomeday"
  | "actionKeep"
  | "actionTakeAction"
  | "actionActivate"
  | "actionArchive"
  | "actionPromote"
  | "back"
  | "finish"
  | "nextStep"
  | "activeProjects"
  | "projectsDescription"
  | "allProjectsReviewed"
  | "weekInReview"
  | "completed"
  | "contextPlaceholder"
  | "nextActions"
  | "summarySaved"
  | "saveWeeklySummary"
  | "summarySavedCallout"
  | "captureCallout"
  | "actionSchedule"
  | "dueDateTooltip"
  | "schedulePlaceholder"
  | "scheduleParseError"
  | "scheduleDueDate"
  | "scheduleGcalIndicator"
  | "scheduleGoogleAccountLabel"
  | "scheduleConflict"
  | "scheduleGcalUnavailable"
  | "scheduleConfirm"
  | "scheduleCancel"
  | "scheduleUnset"
  | "noneStatus"
  | "noProjectTodos"
  | "unknownStatus"
  | "markReviewed"
  | "delegatePlaceholder"
  | "delegateLoading"
  | "delegatePrompt"
  | "delegateSkipHint"
  | "hotkeyLegend"
  | "twoMinuteRule"
  | "noProjects"
  | "noContext"
  | "projectSearchPlaceholder"
  | "nextItem"
  | "previousItem"
  | "refresh"
  | "submit"
  | "submitButton"
  | "triggerListPrompt"
  | "upcoming"
  | "watching"
  | "weeklySummary";

type InterpolatedDict = {
  ageDays: (n: number) => string;
  allClearTitle: (stepTitle: string) => string;
  dueDate: (date: string) => string;
  itemCount: (n: number) => string;
  itemNofTotal: (current: number, total: number) => string;
  projectsInProgress: (current: number, total: number) => string;
  projectsReviewed: (reviewed: number, total: number) => string;
  staleTracked: (n: number) => string;
  ticklerThisMonth: (n: number) => string;
  todoCount: (n: number) => string;
  weekLabel: (n: number) => string;
};

type TranslationDict = Record<StaticKey, string> & InterpolatedDict;

const en: TranslationDict = {
  actionActivate: "Activate",
  actionArchive: "Archive",

  actionDelegated: "Delegated",
  actionDone: "Done",
  actionKeep: "Keep",
  actionNext: "Next",
  actionPromote: "Promote",
  actionSchedule: "Schedule",
  actionSomeday: "Someday",
  actionTakeAction: "Take Action",
  actionWaiting: "Waiting",
  activeProjects: "Active Projects",
  ageDays: (n: number) => (n === 0 ? "new!" : `${n}d old`),
  allClear: "All clear!",
  allClearTitle: (stepTitle: string) => `${stepTitle}: All clear`,
  allProjectsReviewed: "All projects reviewed",
  back: "Back",
  captureCallout:
    "Capture the wrap-up summary, then define the upcoming Top Goal on your next daily note.",
  completed: "Completed",
  contextPlaceholder: "Context",
  dailyReviewTitle: "Daily Review",
  deferred: "Deferred",
  delegated: "Delegated",
  delegateLoading: "Loading delegates...",
  delegatePlaceholder: "Delegate",
  delegatePrompt: "Who are you delegating to?",
  delegateSkipHint: "Enter to skip",
  dueDate: (date: string) => `due ${date}`,
  dueDateTooltip: "Due Date",
  finish: "Finish",
  gtd: "GTD",
  hotkeyLegend: "e done · w watch · d delegate · s someday · p project",
  inbox: "Inbox",
  itemCount: (n: number) => `${n} items`,
  itemNofTotal: (current: number, total: number) => `Item ${current} of ${total}`,
  loading: "Loading items...",
  markDone: "Mark DONE",
  markReviewed: "Mark reviewed",
  next: "Next",
  nextActions: "Next Actions",
  nextItem: "Next",
  nextStep: "Next Step",
  noActiveProjects: "No active projects",
  noContext: "No context",
  noneStatus: "NONE",
  noProjects: "No active projects",
  noProjectTodos: "Add next action",
  previousItem: "Back",
  projects: "Projects",
  projectsDescription: "Ensure each project has one next action and updated status.",
  projectSearchPlaceholder: "Project",
  projectsInProgress: (current: number, total: number) => `${current} of ${total} in progress`,
  projectsReviewed: (reviewed: number, total: number) => `${reviewed} of ${total} reviewed`,
  refresh: "Refresh",
  saveWeeklySummary: "Save Weekly Summary",
  scheduleCancel: "Cancel",
  scheduleConfirm: "Set Due Date",
  scheduleConflict: "Conflict",
  scheduleDueDate: "Set Due Date",
  scheduleGcalIndicator: "Add to Google Calendar",
  scheduleGcalUnavailable: "Google Calendar unavailable — due date saved without calendar event",
  scheduleGoogleAccountLabel: "Calendar",
  scheduleParseError: "Could not parse date",
  schedulePlaceholder: "Tomorrow, next Friday, Mar 15 at 2pm\u2026",
  scheduleUnset: "Unset",
  someday: "Someday",
  stale: "Stale",
  staleTracked: (n: number) => `Stale items currently tracked: ${n}`,
  step1Desc: "Process untagged items and classify or complete each one.",
  step1Title: "Step 1: Inbox Zero",
  step2Desc: "Ensure each active project has a clear next action and updated status.",
  step2Title: "Step 2: Projects",
  step3Desc: "Review next actions, starting with the most stale.",
  step3Title: "Step 3: Next Actions",
  step4Desc: "Check waiting and delegated items for follow-up.",
  step4Title: "Step 4: Waiting For",
  step5Desc: "Promote only what is actionable now.",
  step5Title: "Step 5: Someday/maybe",
  step6Desc: "Review each area and capture what comes to mind",
  step6Title: "Step 6: Trigger List",
  step7Desc: "Review TODOs scheduled for this month's daily notes.",
  step7Title: "Step 7: Tickler File",
  step8Desc: "Review weekly stats and save summary.",
  step8Title: "Dashboard",
  submit: "Process",
  submitButton: "Submit",
  summarySaved: "Summary Saved",
  summarySavedCallout: "Summary saved to [[Weekly Reviews]].",
  ticklerThisMonth: (n: number) => `${n} this month`,
  todoCount: (n: number) => `${n} TODOs`,
  triggerListPrompt: "Review each area and capture what comes to mind",
  twoMinuteRule: "More than 2 minutes?",
  unknownStatus: "Unknown",
  upcoming: "upcoming",
  waiting: "Waiting",
  watching: "Watch",
  weekInReview: "Week in Review",
  weekLabel: (n: number) => `Week ${n}`,
  weeklyReview: "Weekly Review",
  weeklySummary: "Weekly summary",
};

const zhTW: TranslationDict = {
  actionActivate: "啟動",
  actionArchive: "封存",

  actionDelegated: "委派",
  actionDone: "完成",
  actionKeep: "保留",
  actionNext: "下一步",
  actionPromote: "提升",
  actionSchedule: "排程",
  actionSomeday: "未來",
  actionTakeAction: "採取行動",
  actionWaiting: "等待",
  activeProjects: "進行中的專案",
  ageDays: (n: number) => (n === 0 ? "新" : `${n} 天前`),
  allClear: "全部完成！",
  allClearTitle: (stepTitle: string) => `${stepTitle}：全部完成`,
  allProjectsReviewed: "所有專案已審查",
  back: "上一步",
  captureCallout: "記錄本週總結，然後在下一個每日筆記中設定即將到來的首要目標。",
  completed: "已完成",
  contextPlaceholder: "情境",
  dailyReviewTitle: "每日回顧",
  deferred: "延後",
  delegated: "已委派",
  delegateLoading: "正在載入委派名單...",
  delegatePlaceholder: "委派",
  delegatePrompt: "委派給誰？",
  delegateSkipHint: "按 Enter 跳過",
  dueDate: (date: string) => `到期 ${date}`,
  dueDateTooltip: "到期日",
  finish: "完成",
  gtd: "GTD",
  hotkeyLegend: "e 完成 · w 等待 · d 委派 · s 未來 · p 專案",
  inbox: "收件匣",
  itemCount: (n: number) => `${n} 個項目`,
  itemNofTotal: (current: number, total: number) => `第 ${current} 項，共 ${total} 項`,
  loading: "載入項目中...",
  markDone: "標記完成",
  markReviewed: "標記為已審查",
  next: "下一步",
  nextActions: "下一步行動",
  nextItem: "下一項",
  nextStep: "下一步",
  noActiveProjects: "沒有進行中的專案",
  noContext: "無情境",
  noneStatus: "未設定",
  noProjects: "沒有進行中的專案",
  noProjectTodos: "找不到 TODO",
  previousItem: "上一項",
  projects: "專案",
  projectsDescription: "確保每個專案都有一個下一步行動與更新的狀態。",
  projectSearchPlaceholder: "搜尋專案",
  projectsInProgress: (current: number, total: number) => `${current}/${total} 進行中`,
  projectsReviewed: (reviewed: number, total: number) => `已審查 ${reviewed}/${total}`,
  refresh: "重新整理",
  saveWeeklySummary: "儲存每週摘要",
  scheduleCancel: "取消",
  scheduleConfirm: "設定到期日",
  scheduleConflict: "衝突",
  scheduleDueDate: "設定到期日",
  scheduleGcalIndicator: "加入 Google Calendar",
  scheduleGcalUnavailable: "Google Calendar 無法使用 — 已儲存到期日但未建立行事曆事件",
  scheduleGoogleAccountLabel: "行事曆",
  scheduleParseError: "無法解析日期",
  schedulePlaceholder: "明天、下週五、3/15 下午兩點\u2026",
  scheduleUnset: "取消到期日",
  someday: "未來/也許",
  stale: "過期",
  staleTracked: (n: number) => `目前追蹤的過期項目：${n}`,
  step1Desc: "處理未分類的項目，將每一項分類或完成。",
  step1Title: "步驟 1：清空收件匣",
  step2Desc: "確保每個進行中的專案都有明確的下一步行動與更新狀態。",
  step2Title: "步驟 2：專案",
  step3Desc: "檢視下一步行動，從最久未處理的開始。",
  step3Title: "步驟 3：下一步行動",
  step4Desc: "檢查等待中與已委派的項目是否需要跟進。",
  step4Title: "步驟 4：等待中",
  step5Desc: "只將現在可以行動的項目提升。",
  step5Title: "步驟 5：未來/也許",
  step6Desc: "掃描每個領域，記錄浮現的想法。",
  step6Title: "步驟 6：觸發清單",
  step7Desc: "檢視本月每日筆記中排程的 TODO。",
  step7Title: "步驟 7：票夾檔案",
  step8Desc: "檢視每週統計並儲存摘要。",
  step8Title: "儀表板",
  submit: "送出",
  submitButton: "送出",
  summarySaved: "摘要已儲存",
  summarySavedCallout: "摘要已儲存至 [[Weekly Reviews]]。",
  ticklerThisMonth: (n: number) => `${n} 個本月項目`,
  todoCount: (n: number) => `${n} 個 TODO`,
  triggerListPrompt: "掃描每個領域，記錄浮現的想法。",
  twoMinuteRule: "超過兩分鐘？",
  unknownStatus: "未知",
  upcoming: "即將到來",
  waiting: "等待中",
  watching: "關注中",
  weekInReview: "本週回顧",
  weekLabel: (n: number) => `第 ${n} 週`,
  weeklyReview: "每週回顧",
  weeklySummary: "每週摘要",
};

export const LOCALES: Record<Locale, TranslationDict> = {
  en,
  "zh-TW": zhTW,
};

export interface TranslatorFn {
  (key: StaticKey): string;
  (
    key: "todoCount" | "itemCount" | "ageDays" | "staleTracked" | "weekLabel" | "ticklerThisMonth",
    n: number,
  ): string;
  (key: "dueDate" | "allClearTitle", s: string): string;
  (
    key: "itemNofTotal" | "projectsInProgress" | "projectsReviewed",
    current: number,
    total: number,
  ): string;
}

export function createT(locale: Locale): TranslatorFn {
  const dict = LOCALES[locale];
  return ((key: string, ...args: Array<unknown>) => {
    const entry = dict[key as keyof TranslationDict];
    if (typeof entry === "function") {
      return (entry as (...a: Array<unknown>) => string)(...args);
    }
    return entry;
  }) as TranslatorFn;
}
