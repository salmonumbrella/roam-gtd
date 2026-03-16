export interface PersonEntry {
  lastInteractionTime?: number;
  title: string;
  uid: string;
}

const HASH_BRACKET_TAG_RE = /#\[\[([^\]]+)\]\]/g;
const HASH_SIMPLE_TAG_RE = /#(\w+)/g;
const PAGE_REF_RE = /#?\[\[([^\]]+)\]\]/g;

function normalizeTitleKey(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeDelegateTarget(value: string): string {
  return value.trim().replace(/^#/, "").replace(/^\[\[/, "").replace(/\]\]$/, "").toLowerCase();
}

function toTitleCase(value: string): string {
  if (!value) {
    return value;
  }
  return value.replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Extracts candidate person tags from block text.
 *
 * Bracket form `#[[Person Name]]` is always extracted.
 * Simple form `#Tag` is only extracted when the tag starts with an uppercase
 * letter (person names are capitalized; GTD tags like #up, #watch are not).
 */
export function extractPersonTags(text: string): Array<string> {
  const tags: Array<string> = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(HASH_BRACKET_TAG_RE)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      tags.push(name);
    }
  }

  for (const match of text.matchAll(HASH_SIMPLE_TAG_RE)) {
    const name = match[1];
    if (!seen.has(name) && /^[A-Z]/.test(name) && !["TODO", "DONE", "ARCHIVED"].includes(name)) {
      seen.add(name);
      tags.push(name);
    }
  }

  return tags;
}

export function findPeopleInText(text: string, people: Array<PersonEntry>): Array<PersonEntry> {
  const peopleLookup = new Map(people.map((person) => [normalizeTitleKey(person.title), person]));
  const found: Array<PersonEntry> = [];
  const seen = new Set<string>();

  const collectIfKnownPerson = (title: string): void => {
    const normalizedTitle = normalizeTitleKey(title);
    if (!normalizedTitle || seen.has(normalizedTitle)) {
      return;
    }
    const person = peopleLookup.get(normalizedTitle);
    if (!person) {
      return;
    }
    seen.add(normalizedTitle);
    found.push(person);
  };

  for (const tag of extractPersonTags(text)) {
    collectIfKnownPerson(tag);
  }

  for (const match of text.matchAll(PAGE_REF_RE)) {
    const title = match[1];
    if (typeof title === "string") {
      collectIfKnownPerson(title);
    }
  }

  return found;
}

export function findPersonInText(text: string, people: Array<PersonEntry>): PersonEntry | null {
  return findPeopleInText(text, people)[0] ?? null;
}

export function buildTagTitleCandidates(tagTitle: string): Array<string> {
  const normalized = normalizeDelegateTarget(tagTitle);
  if (!normalized) {
    return [];
  }
  const candidates = new Set<string>([
    tagTitle.trim().replace(/^#/, "").replace(/^\[\[/, "").replace(/\]\]$/, "").trim(),
    normalized,
    toTitleCase(normalized),
  ]);
  return Array.from(candidates).filter((candidate) => candidate.length > 0);
}
