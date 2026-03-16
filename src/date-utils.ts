const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_INDEX: Record<string, number> = MONTH_NAMES.reduce<Record<string, number>>(
  (acc, month, index) => {
    acc[month.toLowerCase()] = index;
    return acc;
  },
  {},
);

function ordinalSuffix(day: number): string {
  if (day % 10 === 1 && day !== 11) {
    return "st";
  }
  if (day % 10 === 2 && day !== 12) {
    return "nd";
  }
  if (day % 10 === 3 && day !== 13) {
    return "rd";
  }
  return "th";
}

export function formatRoamDate(date: Date): string {
  const day = date.getDate();
  return `${MONTH_NAMES[date.getMonth()]} ${day}${ordinalSuffix(day)}, ${date.getFullYear()}`;
}

export function parseRoamDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})$/);
  if (!match) {
    return null;
  }

  const monthIndex = MONTH_INDEX[match[1].toLowerCase()];
  if (monthIndex == null) {
    return null;
  }

  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(year)) {
    return null;
  }

  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function getISOWeekBounds(date: Date): { end: Date; start: Date } {
  const start = getMondayOfWeek(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { end, start };
}

export function toRoamLogId(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getMonthLogIdRange(date: Date): { end: number; start: number } {
  const start = toRoamLogId(new Date(date.getFullYear(), date.getMonth(), 1));
  const end = toRoamLogId(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return { end, start };
}
