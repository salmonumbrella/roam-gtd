import { describe, expect, it } from "vitest";

import { LOCALES, createT } from "../i18n";

describe("i18n", () => {
  it("createT returns English strings by default", () => {
    const t = createT("en");
    expect(t("inbox")).toBe("Inbox");
    expect(t("weeklyReview")).toBe("Weekly Review");
  });

  it("createT returns Traditional Chinese strings", () => {
    const t = createT("zh-TW");
    expect(t("inbox")).toBe("收件匣");
    expect(t("weeklyReview")).toBe("每週回顧");
  });

  it("interpolation functions work for both locales", () => {
    const en = createT("en");
    const zh = createT("zh-TW");
    expect(en("itemCount", 5)).toBe("5 items");
    expect(zh("itemCount", 5)).toBe("5 個項目");
    expect(en("ageDays", 3)).toBe("3d old");
    expect(zh("ageDays", 3)).toBe("3 天前");
  });

  it("all locales have identical keys", () => {
    const enKeys = Object.keys(LOCALES.en).sort();
    const zhKeys = Object.keys(LOCALES["zh-TW"]).sort();
    expect(enKeys).toEqual(zhKeys);
  });
});
