import { stripTaskMarker } from "./task-text";

export function stripTodoPrefix(text: string): string {
  return stripTaskMarker(text);
}

function escapeRegex(input: string): string {
  return input.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

const TAG_BOUNDARY = String.raw`(?=$|\s|[.,!?;:)\]}])`;
const HASH_BRACKET_TAG_RE = /#\[\[([^\]]+)\]\]/g;
const HASH_SIMPLE_TAG_RE = /#([A-Za-z0-9/_-]+)/g;

export function hasWorkflowTag(blockString: string, tag: string): boolean {
  const normalizedTag = tag.trim();
  if (!blockString || !normalizedTag) {
    return false;
  }

  const escapedTag = escapeRegex(normalizedTag);
  const tagPatterns = [
    new RegExp(`#\\[\\[${escapedTag}\\]\\]${TAG_BOUNDARY}`, "i"),
    new RegExp(`#${escapedTag}${TAG_BOUNDARY}`, "i"),
  ];

  return tagPatterns.some((pattern) => pattern.test(blockString));
}

export function extractHashTags(blockString: string): Array<string> {
  if (!blockString) {
    return [];
  }

  const tags: Array<string> = [];
  const seen = new Set<string>();

  for (const match of blockString.matchAll(HASH_BRACKET_TAG_RE)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    const normalized = raw.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tags.push(raw);
  }

  for (const match of blockString.matchAll(HASH_SIMPLE_TAG_RE)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    const normalized = raw.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tags.push(raw);
  }

  return tags;
}
