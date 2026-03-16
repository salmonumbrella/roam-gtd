import { describe, expect, it } from "vitest";

import {
  applyConfirmedScheduleIntent,
  applyUnsetScheduleIntent,
  getCurrentScheduleState,
} from "../inbox-zero/schedule-controller";

describe("Inbox zero schedule controller helpers", () => {
  const march12 = new Date(Date.UTC(2026, 2, 12));

  it("derives the current due date from the in-memory schedule unless unset was requested", () => {
    expect(
      getCurrentScheduleState({
        currentItemUid: "todo-1",
        persistedCurrentDueDate: "March 11th, 2026",
        scheduledByUid: {
          "todo-1": {
            date: march12,
            roamDate: "March 12th, 2026",
            time: null,
          },
        },
        unsetDueByUid: {},
      }),
    ).toMatchObject({
      currentDueDateValue: "March 12th, 2026",
      dueUnsetRequestedForCurrent: false,
      isCurrentItemScheduled: true,
    });
  });

  it("clears the due date when unset is requested for the current item", () => {
    expect(
      getCurrentScheduleState({
        currentItemUid: "todo-1",
        persistedCurrentDueDate: "March 11th, 2026",
        scheduledByUid: {
          "todo-1": {
            date: march12,
            roamDate: "March 12th, 2026",
            time: null,
          },
        },
        unsetDueByUid: { "todo-1": true },
      }),
    ).toMatchObject({
      currentDueDateValue: "",
      dueUnsetRequestedForCurrent: true,
      isCurrentItemScheduled: false,
    });
  });

  it("confirming a schedule removes an unset request and stores the new intent", () => {
    const result = applyConfirmedScheduleIntent({
      intent: {
        date: march12,
        roamDate: "March 12th, 2026",
        time: null,
      },
      scheduledByUid: {},
      uid: "todo-1",
      unsetDueByUid: { "todo-1": true },
    });

    expect(result).toEqual({
      scheduledByUid: {
        "todo-1": {
          date: march12,
          roamDate: "March 12th, 2026",
          time: null,
        },
      },
      unsetDueByUid: {},
    });
  });

  it("unsetting a schedule removes the stored intent and marks the uid for due-date removal", () => {
    const result = applyUnsetScheduleIntent({
      scheduledByUid: {
        "todo-1": {
          date: march12,
          roamDate: "March 12th, 2026",
          time: null,
        },
      },
      uid: "todo-1",
      unsetDueByUid: {},
    });

    expect(result).toEqual({
      scheduledByUid: {},
      unsetDueByUid: { "todo-1": true },
    });
  });
});
