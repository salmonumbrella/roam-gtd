import type { Locale } from "./i18n";
import type { RoamExtensionAPI, RoamSettingsPanelInput } from "./types/roam";

export interface GtdSettings {
  agentDelegationWebhookUrl: string;
  dailyPlanParent: string;
  dailyReviewNotify: boolean;
  dailyReviewStaleDays: number;
  delegateTargetTags: Array<string>;
  hideProcessButton: boolean;
  hotkeyDelegate: string;
  hotkeyDone: string;
  hotkeyProject: string;
  hotkeySomeday: string;
  hotkeyWatch: string;
  inboxPage: string;
  locale: Locale;
  reviewItemMode: "list" | "one-by-one";
  showTooltips: boolean;
  staleDays: number;
  tagDelegated: string;
  tagNextAction: string;
  tagSomeday: string;
  tagWaitingFor: string;
  topGoalAttr: string;
  triggerListPage: string;
  weeklyReviewDay: number;
  weeklyReviewNotify: boolean;
  weeklyReviewTime: string;
}

export const DEFAULT_SETTINGS: GtdSettings = {
  agentDelegationWebhookUrl: "",
  dailyPlanParent: "[[Plans, Priorities]]",
  dailyReviewNotify: true,
  dailyReviewStaleDays: 2,
  delegateTargetTags: ["people", "agents"],
  hideProcessButton: false,
  hotkeyDelegate: "d",
  hotkeyDone: "e",
  hotkeyProject: "p",
  hotkeySomeday: "s",
  hotkeyWatch: "w",
  inboxPage: "Triage",
  locale: "en",
  reviewItemMode: "list",
  showTooltips: true,
  staleDays: 14,
  tagDelegated: "delegated",
  tagNextAction: "up",
  tagSomeday: "someday",
  tagWaitingFor: "watch",
  topGoalAttr: "Top Goal",
  triggerListPage: "Trigger List",
  weeklyReviewDay: 0,
  weeklyReviewNotify: true,
  weeklyReviewTime: "09:00",
};

const SETTINGS_COMPARISON_FIELDS = {
  agentDelegationWebhookUrl: true,
  dailyPlanParent: true,
  dailyReviewNotify: true,
  dailyReviewStaleDays: true,
  delegateTargetTags: true,
  hideProcessButton: true,
  hotkeyDelegate: true,
  hotkeyDone: true,
  hotkeyProject: true,
  hotkeySomeday: true,
  hotkeyWatch: true,
  inboxPage: true,
  locale: true,
  reviewItemMode: true,
  showTooltips: true,
  staleDays: true,
  tagDelegated: true,
  tagNextAction: true,
  tagSomeday: true,
  tagWaitingFor: true,
  topGoalAttr: true,
  triggerListPage: true,
  weeklyReviewDay: true,
  weeklyReviewNotify: true,
  weeklyReviewTime: true,
} satisfies Record<keyof GtdSettings, true>;

const SETTINGS_COMPARISON_KEYS = Object.keys(SETTINGS_COMPARISON_FIELDS) as Array<
  keyof GtdSettings
>;

function serializeSettingsComparisonValue(value: GtdSettings[keyof GtdSettings]): string {
  if (Array.isArray(value)) {
    return value.join("\u001f");
  }
  return String(value);
}

export function getSettingsComparisonSignature(settings: GtdSettings): string {
  return SETTINGS_COMPARISON_KEYS.map(
    (key) => `${key}=${serializeSettingsComparisonValue(settings[key])}`,
  ).join("\u001e");
}

function asString(value: string | number | boolean | null | undefined, fallback: string): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeHotkeyInput(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed[0] ?? "";
}

function asHotkey(value: string | number | boolean | null | undefined, fallback: string): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = normalizeHotkeyInput(String(value));
  return normalized || fallback;
}

function asPositiveInt(
  value: string | number | boolean | null | undefined,
  fallback: number,
): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function asWeekday(value: string | number | boolean | null | undefined, fallback: number): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 6) {
    return fallback;
  }
  return Math.floor(n);
}

function asReviewMode(
  value: string | number | boolean | null | undefined,
): GtdSettings["reviewItemMode"] {
  return value === "one-by-one" ? "one-by-one" : "list";
}

function asLocale(value: string | number | boolean | null | undefined): GtdSettings["locale"] {
  return value === "zh-TW" ? "zh-TW" : "en";
}

function normalizeTagToken(tag: string): string {
  return tag.trim().replace(/^#/, "").replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
}

function asTagList(
  value: string | number | boolean | null | undefined,
  fallback: Array<string>,
): Array<string> {
  const source = value == null ? fallback.join(",") : String(value);
  const seen = new Set<string>();
  const tags: Array<string> = [];
  for (const rawTag of source.split(/[\n,]/u)) {
    const normalized = normalizeTagToken(rawTag);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(normalized);
  }
  return tags.length > 0 ? tags : [...fallback];
}

export function getSettings(extensionAPI: RoamExtensionAPI): GtdSettings {
  return {
    agentDelegationWebhookUrl: asString(
      extensionAPI.settings.get("gtd-agent-delegation-webhook-url"),
      DEFAULT_SETTINGS.agentDelegationWebhookUrl,
    ),
    dailyPlanParent: asString(
      extensionAPI.settings.get("gtd-daily-plan-parent"),
      DEFAULT_SETTINGS.dailyPlanParent,
    ),
    dailyReviewNotify: extensionAPI.settings.get("gtd-daily-review-notify") !== "false",
    dailyReviewStaleDays: asPositiveInt(
      extensionAPI.settings.get("gtd-daily-review-stale-days"),
      DEFAULT_SETTINGS.dailyReviewStaleDays,
    ),
    delegateTargetTags: asTagList(
      extensionAPI.settings.get("gtd-delegate-target-tags"),
      DEFAULT_SETTINGS.delegateTargetTags,
    ),
    hideProcessButton: extensionAPI.settings.get("gtd-hide-process-button") === "true",
    hotkeyDelegate: asHotkey(
      extensionAPI.settings.get("gtd-hotkey-delegate"),
      DEFAULT_SETTINGS.hotkeyDelegate,
    ),
    hotkeyDone: asHotkey(extensionAPI.settings.get("gtd-hotkey-done"), DEFAULT_SETTINGS.hotkeyDone),
    hotkeyProject: asHotkey(
      extensionAPI.settings.get("gtd-hotkey-project"),
      DEFAULT_SETTINGS.hotkeyProject,
    ),
    hotkeySomeday: asHotkey(
      extensionAPI.settings.get("gtd-hotkey-someday"),
      DEFAULT_SETTINGS.hotkeySomeday,
    ),
    hotkeyWatch: asHotkey(
      extensionAPI.settings.get("gtd-hotkey-watch"),
      DEFAULT_SETTINGS.hotkeyWatch,
    ),
    inboxPage: asString(extensionAPI.settings.get("gtd-inbox-page"), DEFAULT_SETTINGS.inboxPage),
    locale: asLocale(extensionAPI.settings.get("gtd-locale")),
    reviewItemMode: asReviewMode(extensionAPI.settings.get("gtd-review-item-mode")),
    showTooltips: extensionAPI.settings.get("gtd-show-tooltips") !== "false",
    staleDays: asPositiveInt(
      extensionAPI.settings.get("gtd-stale-days"),
      DEFAULT_SETTINGS.staleDays,
    ),
    tagDelegated: asString(
      extensionAPI.settings.get("gtd-tag-delegated"),
      DEFAULT_SETTINGS.tagDelegated,
    ),
    tagNextAction: asString(
      extensionAPI.settings.get("gtd-tag-next-action"),
      DEFAULT_SETTINGS.tagNextAction,
    ),
    tagSomeday: asString(extensionAPI.settings.get("gtd-tag-someday"), DEFAULT_SETTINGS.tagSomeday),
    tagWaitingFor: asString(
      extensionAPI.settings.get("gtd-tag-waiting-for"),
      DEFAULT_SETTINGS.tagWaitingFor,
    ),
    topGoalAttr: asString(
      extensionAPI.settings.get("gtd-top-goal-attr"),
      DEFAULT_SETTINGS.topGoalAttr,
    ),
    triggerListPage: asString(
      extensionAPI.settings.get("gtd-trigger-list-page"),
      DEFAULT_SETTINGS.triggerListPage,
    ),
    weeklyReviewDay: asWeekday(
      extensionAPI.settings.get("gtd-weekly-review-day"),
      DEFAULT_SETTINGS.weeklyReviewDay,
    ),
    weeklyReviewNotify: extensionAPI.settings.get("gtd-weekly-review-notify") !== "false",
    weeklyReviewTime: asString(
      extensionAPI.settings.get("gtd-weekly-review-time"),
      DEFAULT_SETTINGS.weeklyReviewTime,
    ),
  };
}

export function createSettingsPanelConfig(
  defaults: GtdSettings = DEFAULT_SETTINGS,
  extensionAPI?: RoamExtensionAPI,
): RoamSettingsPanelInput {
  const createHotkeySettingAction = (
    id: string,
    placeholder: string,
  ): RoamSettingsPanelInput["settings"][number]["action"] => {
    if (!extensionAPI?.settings?.set) {
      return { placeholder, type: "input" };
    }
    return {
      onChange: (event: Event) => {
        const target = event.target;
        if (target == null || (target as { nodeType?: number }).nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        const input = target as HTMLInputElement;
        if (input.tagName !== "INPUT") {
          return;
        }
        const normalized = normalizeHotkeyInput(input.value);
        if (input.value !== normalized) {
          input.value = normalized;
        }
        void extensionAPI.settings.set?.(id, normalized);
      },
      placeholder,
      type: "input",
    };
  };

  const settings: RoamSettingsPanelInput["settings"] = [
    {
      action: { placeholder: defaults.tagNextAction, type: "input" },
      description: `Tag for next actions (default: ${defaults.tagNextAction})`,
      id: "gtd-tag-next-action",
      name: "Next Action Tag",
    },
    {
      action: { placeholder: defaults.tagWaitingFor, type: "input" },
      description: `Tag for waiting-for items (default: ${defaults.tagWaitingFor})`,
      id: "gtd-tag-waiting-for",
      name: "Waiting For Tag",
    },
    {
      action: { placeholder: defaults.tagDelegated, type: "input" },
      description: `Tag for delegated items (default: ${defaults.tagDelegated})`,
      id: "gtd-tag-delegated",
      name: "Delegated Tag",
    },
    {
      action: {
        placeholder: defaults.delegateTargetTags.join(", "),
        type: "input",
      },
      description:
        "Comma-separated page tags used in Delegate suggestions (e.g. people, agents, employee). First tag is the preferred template for newly created delegate pages.",
      id: "gtd-delegate-target-tags",
      name: "Delegate Target Tags",
    },
    {
      action: {
        placeholder: "https://example.com/webhooks/delegation",
        type: "input",
      },
      description:
        "Webhook URL notified when delegating to a page tagged #agents. Sends delegated block UID.",
      id: "gtd-agent-delegation-webhook-url",
      name: "Agent Delegation Webhook URL",
    },
    {
      action: { placeholder: defaults.tagSomeday, type: "input" },
      description: `Tag for someday/maybe items (default: ${defaults.tagSomeday})`,
      id: "gtd-tag-someday",
      name: "Someday/Maybe Tag",
    },
    {
      action: createHotkeySettingAction("gtd-hotkey-done", defaults.hotkeyDone),
      description: `Hotkey to mark done (default: ${defaults.hotkeyDone})`,
      id: "gtd-hotkey-done",
      name: "Hotkey: Done",
    },
    {
      action: createHotkeySettingAction("gtd-hotkey-watch", defaults.hotkeyWatch),
      description: `Hotkey for waiting/watch (default: ${defaults.hotkeyWatch})`,
      id: "gtd-hotkey-watch",
      name: "Hotkey: Watch",
    },
    {
      action: createHotkeySettingAction("gtd-hotkey-delegate", defaults.hotkeyDelegate),
      description: `Hotkey for delegate (default: ${defaults.hotkeyDelegate})`,
      id: "gtd-hotkey-delegate",
      name: "Hotkey: Delegate",
    },
    {
      action: createHotkeySettingAction("gtd-hotkey-someday", defaults.hotkeySomeday),
      description: `Hotkey for someday/maybe (default: ${defaults.hotkeySomeday})`,
      id: "gtd-hotkey-someday",
      name: "Hotkey: Someday",
    },
    {
      action: createHotkeySettingAction("gtd-hotkey-project", defaults.hotkeyProject),
      description: `Hotkey to focus project search (default: ${defaults.hotkeyProject})`,
      id: "gtd-hotkey-project",
      name: "Hotkey: Project",
    },
    {
      action: { placeholder: defaults.inboxPage, type: "input" },
      description: `Page name for inbox/triage (default: ${defaults.inboxPage})`,
      id: "gtd-inbox-page",
      name: "Inbox Page",
    },
    {
      action: { placeholder: defaults.dailyPlanParent, type: "input" },
      description: `Parent block text for daily-note next actions (default: ${defaults.dailyPlanParent})`,
      id: "gtd-daily-plan-parent",
      name: "Daily Note Parent Block",
    },
    {
      action: { placeholder: String(defaults.staleDays), type: "input" },
      description: `Days before a TODO is considered stale (default: ${defaults.staleDays})`,
      id: "gtd-stale-days",
      name: "Stale Threshold (days)",
    },
    {
      action: { placeholder: defaults.topGoalAttr, type: "input" },
      description: `Attribute name for daily top goal (default: ${defaults.topGoalAttr})`,
      id: "gtd-top-goal-attr",
      name: "Top Goal Attribute",
    },
    {
      action: { placeholder: defaults.triggerListPage, type: "input" },
      description: `Page name for trigger list embed (default: ${defaults.triggerListPage})`,
      id: "gtd-trigger-list-page",
      name: "Trigger List Page",
    },
    {
      action: {
        items: ["list", "one-by-one"],
        type: "select",
      },
      description: "How items appear in the weekly review wizard",
      id: "gtd-review-item-mode",
      name: "Review Item Mode",
    },
    {
      action: {
        items: ["en", "zh-TW"],
        type: "select",
      },
      description: "UI language (English or Traditional Chinese)",
      id: "gtd-locale",
      name: "Language",
    },
    {
      action: {
        items: ["0", "1", "2", "3", "4", "5", "6"],
        type: "select",
      },
      description: "Day of week for review reminder (0=Sun, 1=Mon, ..., 6=Sat)",
      id: "gtd-weekly-review-day",
      name: "Weekly Review Day",
    },
    {
      action: { placeholder: defaults.weeklyReviewTime, type: "input" },
      description: `Time for review reminder in HH:MM (default: ${defaults.weeklyReviewTime})`,
      id: "gtd-weekly-review-time",
      name: "Weekly Review Time",
    },
    {
      action: {
        items: ["true", "false"],
        type: "select",
      },
      description: "Show a macOS notification when it's time for weekly review",
      id: "gtd-weekly-review-notify",
      name: "Weekly Review Notification",
    },
    {
      action: {
        items: ["true", "false"],
        type: "select",
      },
      description: "Show a notification when inbox has items older than the stale threshold",
      id: "gtd-daily-review-notify",
      name: "Daily Review Notification",
    },
    {
      action: { placeholder: String(defaults.dailyReviewStaleDays), type: "input" },
      description: `Inbox item age (days) that triggers daily review notification (default: ${defaults.dailyReviewStaleDays})`,
      id: "gtd-daily-review-stale-days",
      name: "Daily Review Stale Threshold",
    },
    {
      action: {
        items: ["true", "false"],
        type: "select",
      },
      description: "Show tooltips on hover for buttons in the review wizard",
      id: "gtd-show-tooltips",
      name: "Show Tooltips",
    },
    {
      action: {
        items: ["false", "true"],
        type: "select",
      },
      description:
        "Hide the Process button in inbox triage. Power users can use Cmd+Shift+Enter instead.",
      id: "gtd-hide-process-button",
      name: "Hide Process Button",
    },
  ];

  if (extensionAPI?.settings?.set) {
    settings.push({
      action: {
        content: "+ Add Delegate Tag",
        onClick: async () => {
          const rawInput = window.prompt(
            "Add a delegate target tag/page (example: employee or #[[employee]])",
          );
          if (!rawInput) {
            return;
          }
          const nextTags = asTagList(
            [extensionAPI.settings.get("gtd-delegate-target-tags"), rawInput]
              .filter((value): value is string | number | boolean => value != null)
              .map(String)
              .join(", "),
            defaults.delegateTargetTags,
          );
          await extensionAPI.settings.set?.("gtd-delegate-target-tags", nextTags.join(", "));
        },
        type: "button",
      },
      description: "Click to append a single tag/page to Delegate Target Tags.",
      id: "gtd-delegate-target-tags-add",
      name: "Delegate Tag Quick Add",
    });
  }

  return {
    settings,
    tabTitle: "Roam GTD",
  };
}
