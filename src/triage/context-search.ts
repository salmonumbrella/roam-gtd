import { searchPagesAsync } from "../contexts";

export function readCachedTriageOptions(
  cache: Map<string, Array<string>>,
  cacheKey: string,
): Array<string> | null {
  const cached = cache.get(cacheKey);
  if (!cached) {
    return null;
  }
  cache.delete(cacheKey);
  cache.set(cacheKey, cached);
  return cached;
}

export function writeCachedTriageOptions(
  cache: Map<string, Array<string>>,
  cacheKey: string,
  options: Array<string>,
  limit: number,
): void {
  if (cache.has(cacheKey)) {
    cache.delete(cacheKey);
  }
  cache.set(cacheKey, options);
  if (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") {
      cache.delete(oldestKey);
    }
  }
}

export function filterContextSearchOptions(options: Array<string>, query: string): Array<string> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return options;
  }
  return options.filter((option) => option.toLowerCase().includes(trimmed));
}

export function getPrefixCachedTriageOptions(args: {
  cache: Map<string, Array<string>>;
  cacheKey: string;
  limit: number;
  query: string;
}): Array<string> | null {
  const { cache, cacheKey, limit, query } = args;
  for (let prefixLength = cacheKey.length - 1; prefixLength >= 1; prefixLength -= 1) {
    const prefixKey = cacheKey.slice(0, prefixLength);
    const prefixCached = readCachedTriageOptions(cache, prefixKey);
    if (!prefixCached) {
      continue;
    }
    return filterContextSearchOptions(prefixCached, query).slice(0, limit);
  }
  return null;
}

export async function loadContextPageOptions(query: string, limit: number): Promise<Array<string>> {
  const results = await searchPagesAsync(query, limit);
  return results.map((context) => context.title);
}
