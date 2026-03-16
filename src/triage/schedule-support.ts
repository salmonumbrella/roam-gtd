import type { ScheduleIntent } from "../components/SchedulePopover";
import { fetchEventsForDate, hasConflict, isGoogleCalendarAvailable } from "../google-calendar";
import { formatDueDateTooltipLabel } from "./form-helpers";

export function getTriageDueDateTooltipLabel(args: {
  gcalTime: string | null;
  persistedDueDate: string;
  scheduleIntent: ScheduleIntent | null;
  unsetDue: boolean;
}): string | null {
  const { gcalTime, persistedDueDate, scheduleIntent, unsetDue } = args;
  if (unsetDue) {
    return null;
  }
  const baseLabel = formatDueDateTooltipLabel(scheduleIntent ?? undefined, persistedDueDate);
  if (!baseLabel) {
    return null;
  }
  if (scheduleIntent?.time || !gcalTime) {
    return baseLabel;
  }
  return `${baseLabel} at ${gcalTime}`;
}

export function matchCalendarEventTime(targetText: string, eventName: string): boolean {
  const normalizedTarget = targetText.toLowerCase().trim();
  const normalizedEvent = eventName.toLowerCase().trim();
  if (!normalizedTarget || !normalizedEvent) {
    return false;
  }
  if (normalizedTarget.includes(normalizedEvent) || normalizedEvent.includes(normalizedTarget)) {
    return true;
  }
  return normalizedTarget.slice(0, 30).includes(normalizedEvent.slice(0, 18));
}

export async function loadMatchedCalendarEventTimeLabel(args: {
  persistedDueDate: string;
  targetText: string;
}): Promise<string | null> {
  const { persistedDueDate, targetText } = args;
  if (!persistedDueDate.trim() || !isGoogleCalendarAvailable()) {
    return null;
  }
  try {
    const events = await fetchEventsForDate(persistedDueDate);
    const match = events.find((event) => matchCalendarEventTime(targetText, event.summary));
    const startTime = match?.start.dateTime;
    if (!startTime) {
      return null;
    }
    return new Date(startTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export function formatScheduleConflictMessage(args: {
  conflict: { endTime: string; eventName: string; startTime: string };
  scheduleConflictLabel: string;
}): string {
  const { conflict, scheduleConflictLabel } = args;
  const startFormatted = new Date(conflict.startTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const endFormatted = new Date(conflict.endTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${scheduleConflictLabel}: "${conflict.eventName}" ${startFormatted}-${endFormatted}`;
}

export async function resolveScheduleConflictMessage(args: {
  intent: ScheduleIntent;
  scheduleConflictLabel: string;
}): Promise<string | null> {
  const { intent, scheduleConflictLabel } = args;
  if (!intent.time || !isGoogleCalendarAvailable()) {
    return null;
  }
  try {
    const events = await fetchEventsForDate(intent.roamDate);
    const conflict = hasConflict(events, intent.date, 10);
    if (!conflict) {
      return null;
    }
    return formatScheduleConflictMessage({ conflict, scheduleConflictLabel });
  } catch {
    return null;
  }
}
