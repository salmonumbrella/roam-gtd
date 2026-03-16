import { describe, expect, it } from "vitest";

import {
  canonicalTaskMarker,
  canonicalizeTaskText,
  hasDoneOrArchivedMarker,
  hasClosedTaskMarker,
  hasTodoMarker,
  isOpenTaskText,
  matchBlockRefOnly,
  matchOptionalTaskBlockRef,
  parseTaskMarker,
  prependTaskMarker,
  replaceTaskMarker,
  stripTaskMarker,
  stripTaskStatusMacros,
} from "../task-text";

describe("task-text", () => {
  describe("parseTaskMarker", () => {
    it("parses canonical and legacy leading marker forms", () => {
      expect(parseTaskMarker("{{[[TODO]]}} hello")).toBe("todo");
      expect(parseTaskMarker("{{DONE}} hello")).toBe("done");
      expect(parseTaskMarker("[[ARCHIVED]] hello")).toBe("archived");
      expect(parseTaskMarker("TODO hello")).toBe("todo");
    });

    it("ignores inner marker-like text", () => {
      expect(parseTaskMarker("hello TODO")).toBeNull();
      expect(parseTaskMarker("meeting about [[DONE]] later")).toBeNull();
    });

    it("accepts a leading hyphen before the marker region", () => {
      expect(parseTaskMarker("- {{[[DONE]]}} hello")).toBe("done");
    });
  });

  describe("marker classification", () => {
    it("reports open and closed markers consistently", () => {
      expect(hasTodoMarker("{{[[TODO]]}} hello")).toBe(true);
      expect(hasTodoMarker("[[DONE]] hello")).toBe(false);
      expect(hasClosedTaskMarker("DONE hello")).toBe(true);
      expect(hasClosedTaskMarker("{{[[ARCHIVED]]}} hello")).toBe(true);
      expect(hasClosedTaskMarker("{{[[TODO]]}} hello")).toBe(false);
      expect(hasDoneOrArchivedMarker("{{[[TODO]]}} {{[[DONE]]}} hidden")).toBe(true);
      expect(hasDoneOrArchivedMarker("{{TODO}} {{ARCHIVED}} hidden")).toBe(true);
      expect(isOpenTaskText("{{[[TODO]]}} hello")).toBe(true);
      expect(isOpenTaskText("{{[[TODO]]}} {{[[DONE]]}} hidden")).toBe(false);
      expect(isOpenTaskText("[[TODO]] hello")).toBe(true);
      expect(isOpenTaskText("TODO hello")).toBe(true);
    });
  });

  describe("stripTaskMarker", () => {
    it("removes the leading task marker region only", () => {
      expect(stripTaskMarker("{{[[TODO]]}} hello")).toBe("hello");
      expect(stripTaskMarker("- {{[[DONE]]}} {{[[ARCHIVED]]}} hello")).toBe("hello");
    });

    it("preserves text without a leading task marker", () => {
      expect(stripTaskMarker("hello TODO")).toBe("hello TODO");
    });
  });

  describe("stripTaskStatusMacros", () => {
    it("removes macro-style task markers anywhere in the string", () => {
      expect(stripTaskStatusMacros("{{[[TODO]]}} one {{[[DONE]]}} two")).toBe("one two");
      expect(stripTaskStatusMacros("{{ TODO }} task")).toBe("task");
      expect(stripTaskStatusMacros("{{[[ DONE ]]}} task")).toBe("task");
    });

    it("can preserve archived markers when callers only want TODO/DONE stripped", () => {
      expect(stripTaskStatusMacros("{{[[ARCHIVED]]}} hidden", { includeArchived: false })).toBe(
        "{{[[ARCHIVED]]}} hidden",
      );
    });
  });

  describe("writing helpers", () => {
    it("returns canonical markers", () => {
      expect(canonicalTaskMarker("todo")).toBe("{{[[TODO]]}}");
      expect(canonicalTaskMarker("done")).toBe("{{[[DONE]]}}");
      expect(canonicalTaskMarker("archived")).toBe("{{[[ARCHIVED]]}}");
    });

    it("prepends canonical markers", () => {
      expect(prependTaskMarker("hello", "done")).toBe("{{[[DONE]]}} hello");
      expect(prependTaskMarker("", "archived")).toBe("{{[[ARCHIVED]]}}");
    });

    it("replaces existing marker regions idempotently", () => {
      expect(replaceTaskMarker("[[TODO]] hello", "done")).toBe("{{[[DONE]]}} hello");
      expect(replaceTaskMarker("{{[[ARCHIVED]]}} hello", "archived")).toBe(
        "{{[[ARCHIVED]]}} hello",
      );
      expect(replaceTaskMarker("hello", "archived")).toBe("{{[[ARCHIVED]]}} hello");
    });

    it("canonicalizes legacy leading forms without touching plain text", () => {
      expect(canonicalizeTaskText("[[TODO]] hello")).toBe("{{[[TODO]]}} hello");
      expect(canonicalizeTaskText("- DONE hello")).toBe("{{[[DONE]]}} hello");
      expect(canonicalizeTaskText("hello")).toBe("hello");
    });
  });

  describe("block ref helpers", () => {
    it("matches exact block-ref-only text", () => {
      expect(matchBlockRefOnly("((abc123))")).toEqual({ uid: "abc123" });
      expect(matchBlockRefOnly(" ((abc123)) ")).toEqual({ uid: "abc123" });
      expect(matchBlockRefOnly("((abc123)) extra")).toBeNull();
    });

    it("matches optional marker plus block ref text", () => {
      expect(matchOptionalTaskBlockRef("{{[[TODO]]}} ((abc123))")).toEqual({
        marker: "todo",
        uid: "abc123",
      });
      expect(matchOptionalTaskBlockRef("[[DONE]] ((abc123))")).toEqual({
        marker: "done",
        uid: "abc123",
      });
      expect(matchOptionalTaskBlockRef("((abc123))")).toEqual({
        marker: null,
        uid: "abc123",
      });
      expect(matchOptionalTaskBlockRef("{{[[TODO]]}} ((abc123)) later")).toBeNull();
    });
  });
});
