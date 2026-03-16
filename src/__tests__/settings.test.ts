import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SETTINGS,
  createSettingsPanelConfig,
  getSettings,
  getSettingsComparisonSignature,
} from "../settings";
import type { RoamExtensionAPI, RoamSettingsPanelInput } from "../types/roam";

function createMockExtensionAPI(
  values: Map<string, string | number | boolean | null | undefined>,
  set = vi.fn(),
): RoamExtensionAPI {
  return {
    settings: {
      get: (key: string) => values.get(key),
      panel: {
        create: (_input: RoamSettingsPanelInput) => {
          return;
        },
      },
      set,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DEFAULT_SETTINGS", () => {
  it("defaults locale to en", () => {
    expect(DEFAULT_SETTINGS.locale).toBe("en");
  });
});

describe("getSettings", () => {
  it("returns defaults when values are missing", () => {
    const settings = getSettings(createMockExtensionAPI(new Map()));
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("returns configured values when present", () => {
    const values = new Map<string, string | number | boolean | null | undefined>([
      ["gtd-tag-next-action", "next"],
      ["gtd-tag-waiting-for", "waiting"],
      ["gtd-tag-delegated", "delegate"],
      ["gtd-tag-someday", "later"],
      ["gtd-inbox-page", "Inbox"],
      ["gtd-daily-plan-parent", "[[Plan Block]]"],
      ["gtd-agent-delegation-webhook-url", "https://example.com/webhook"],
      ["gtd-stale-days", 9],
      ["gtd-top-goal-attr", "Top Priority"],
      ["gtd-review-item-mode", "one-by-one"],
    ]);

    const settings = getSettings(createMockExtensionAPI(values));

    expect(settings.tagNextAction).toBe("next");
    expect(settings.tagWaitingFor).toBe("waiting");
    expect(settings.tagDelegated).toBe("delegate");
    expect(settings.tagSomeday).toBe("later");
    expect(settings.inboxPage).toBe("Inbox");
    expect(settings.dailyPlanParent).toBe("[[Plan Block]]");
    expect(settings.agentDelegationWebhookUrl).toBe("https://example.com/webhook");
    expect(settings.staleDays).toBe(9);
    expect(settings.topGoalAttr).toBe("Top Priority");
    expect(settings.reviewItemMode).toBe("one-by-one");
  });

  it("returns default hotkey settings", () => {
    const mockAPI = {
      settings: { get: () => null },
    } as unknown as RoamExtensionAPI;
    const s = getSettings(mockAPI);
    expect(s.hotkeyDone).toBe("e");
    expect(s.hotkeyWatch).toBe("w");
    expect(s.hotkeyDelegate).toBe("d");
    expect(s.hotkeySomeday).toBe("s");
    expect(s.hotkeyProject).toBe("p");
  });

  it("normalizes configured hotkeys to one lowercase character", () => {
    const values = new Map<string, string | number | boolean | null | undefined>([
      ["gtd-hotkey-done", " Enter "],
      ["gtd-hotkey-watch", "WW"],
      ["gtd-hotkey-delegate", "Delegate"],
      ["gtd-hotkey-someday", " SomeDay "],
      ["gtd-hotkey-project", "Project"],
    ]);

    const settings = getSettings(createMockExtensionAPI(values));

    expect(settings.hotkeyDone).toBe("e");
    expect(settings.hotkeyWatch).toBe("w");
    expect(settings.hotkeyDelegate).toBe("d");
    expect(settings.hotkeySomeday).toBe("s");
    expect(settings.hotkeyProject).toBe("p");
  });

  it("normalizes tag lists, locale, weekday, and boolean settings", () => {
    const values = new Map<string, string | number | boolean | null | undefined>([
      ["gtd-delegate-target-tags", " #People, [[agents]], people "],
      ["gtd-locale", "zh-TW"],
      ["gtd-weekly-review-day", "6"],
      ["gtd-weekly-review-notify", "false"],
      ["gtd-show-tooltips", "false"],
      ["gtd-hide-process-button", "true"],
      ["gtd-stale-days", "0"],
    ]);

    const settings = getSettings(createMockExtensionAPI(values));

    expect(settings.delegateTargetTags).toEqual(["People", "agents"]);
    expect(settings.locale).toBe("zh-TW");
    expect(settings.weeklyReviewDay).toBe(6);
    expect(settings.weeklyReviewNotify).toBe(false);
    expect(settings.showTooltips).toBe(false);
    expect(settings.hideProcessButton).toBe(true);
    expect(settings.staleDays).toBe(DEFAULT_SETTINGS.staleDays);
  });
});

describe("createSettingsPanelConfig", () => {
  it("builds a quick-add button when settings.set is available", async () => {
    const set = vi.fn(() => Promise.resolve());
    const config = createSettingsPanelConfig(
      DEFAULT_SETTINGS,
      createMockExtensionAPI(new Map([["gtd-delegate-target-tags", "agents"]]), set),
    );
    const quickAdd = config.settings.find(
      (setting) => setting.id === "gtd-delegate-target-tags-add",
    );

    vi.stubGlobal("window", {
      prompt: vi.fn(() => "#[[People]]"),
    });

    expect(quickAdd).toBeDefined();
    expect(quickAdd?.action.type).toBe("button");
    if (quickAdd?.action.type !== "button") {
      throw new Error("Expected quick-add action to be a button");
    }
    await quickAdd.action.onClick?.({} as Event);

    expect(set).toHaveBeenCalledWith("gtd-delegate-target-tags", "agents, People");
  });

  it("normalizes hotkey input actions before saving", async () => {
    const set = vi.fn(() => Promise.resolve());
    const config = createSettingsPanelConfig(
      DEFAULT_SETTINGS,
      createMockExtensionAPI(new Map(), set),
    );
    const hotkeySetting = config.settings.find((setting) => setting.id === "gtd-hotkey-done");

    vi.stubGlobal("Node", { ELEMENT_NODE: 1 });

    const input = { nodeType: 1, tagName: "INPUT", value: " Enter " };
    if (hotkeySetting?.action.type !== "input") {
      throw new Error("Expected hotkey action to be an input");
    }
    await hotkeySetting.action.onChange?.({ target: input } as unknown as Event);

    expect(input.value).toBe("e");
    expect(set).toHaveBeenCalledWith("gtd-hotkey-done", "e");
  });

  it("falls back to plain input actions when settings.set is unavailable", () => {
    const config = createSettingsPanelConfig(DEFAULT_SETTINGS);
    const hotkeySetting = config.settings.find((setting) => setting.id === "gtd-hotkey-done");
    const quickAdd = config.settings.find(
      (setting) => setting.id === "gtd-delegate-target-tags-add",
    );

    expect(hotkeySetting?.action).toEqual({
      placeholder: DEFAULT_SETTINGS.hotkeyDone,
      type: "input",
    });
    expect(quickAdd).toBeUndefined();
  });
});

describe("getSettingsComparisonSignature", () => {
  it("changes when daily review settings change", () => {
    const baseline = getSettingsComparisonSignature(DEFAULT_SETTINGS);

    expect(
      getSettingsComparisonSignature({
        ...DEFAULT_SETTINGS,
        dailyReviewNotify: !DEFAULT_SETTINGS.dailyReviewNotify,
      }),
    ).not.toBe(baseline);
    expect(
      getSettingsComparisonSignature({
        ...DEFAULT_SETTINGS,
        dailyReviewStaleDays: DEFAULT_SETTINGS.dailyReviewStaleDays + 1,
      }),
    ).not.toBe(baseline);
  });
});
