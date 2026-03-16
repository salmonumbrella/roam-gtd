import { primePageTitleSearchSupport } from "../../contexts";
import { fetchAllPeople, sortPeopleEntries, type PersonEntry } from "../../people";
import type { GtdSettings } from "../../settings";
import type { createGtdStore } from "../../store";
import { loadContextPageOptions } from "../../triage/context-search";
import { CONTEXT_SEARCH_CACHE_LIMIT, CONTEXT_SEARCH_MAX_RESULTS } from "../../triage/form-helpers";
import {
  buildProjectOptionLookup,
  buildProjectSearchTextLookup,
  getProjectOptionsFromSummaries,
  loadTriageProjects,
  type ProjectOption,
} from "../../triage/support";

type GtdStore = ReturnType<typeof createGtdStore>;

export type TriageProviderKey = "context" | "people" | "project";
export type TriageProviderStatus = "cold" | "warming" | "ready" | "error";

export interface TriageContextProviderSnapshot {
  data: {
    cache: Map<string, Array<string>>;
    lastQuery: string;
    supportWarmed: boolean;
  };
  error: Error | null;
  options: Array<string>;
  query: string;
  status: TriageProviderStatus;
}

export interface TriagePeopleProviderSnapshot {
  error: Error | null;
  options: Array<PersonEntry>;
  status: TriageProviderStatus;
}

export interface TriageProjectProviderSnapshot {
  data: {
    lookup: Map<string, ProjectOption>;
    searchTextLookup: Map<string, Array<string>>;
  };
  error: Error | null;
  options: Array<ProjectOption>;
  status: TriageProviderStatus;
}

export interface TriageProviderSnapshotMap {
  context: TriageContextProviderSnapshot;
  people: TriagePeopleProviderSnapshot;
  project: TriageProjectProviderSnapshot;
}

export interface TriageContextSeedSnapshot {
  options: Array<string>;
  query: string;
}

export interface TriageInputSeedMap {
  context: TriageContextSeedSnapshot;
  people: Array<PersonEntry>;
  project: Array<ProjectOption>;
}

export interface CreateTriageInputServiceArgs {
  settings: GtdSettings;
  store: GtdStore;
}

export interface TriageInputService {
  ensureWarm<K extends TriageProviderKey>(providerKey: K): Promise<void>;
  getSnapshot<K extends TriageProviderKey>(providerKey: K): TriageProviderSnapshotMap[K];
  getStatus(providerKey: TriageProviderKey): TriageProviderStatus;
  invalidate(providerKey: TriageProviderKey): void;
  queryContextOptions(query: string, limit?: number): Promise<Array<string>>;
  readContextOptions(query: string): Array<string> | null;
  readPrefixContextOptions(query: string, limit?: number): Array<string> | null;
  retry<K extends TriageProviderKey>(providerKey: K): Promise<void>;
  seed<K extends TriageProviderKey>(providerKey: K, nextSnapshot: TriageInputSeedMap[K]): void;
  subscribe(providerKey: TriageProviderKey, listener: () => void): () => void;
}

function resolveError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function cloneStringOptionsMap(cache: Map<string, Array<string>>): Map<string, Array<string>> {
  return new Map(Array.from(cache.entries(), ([key, options]) => [key, [...options]]));
}

function readCachedContextOptions(
  cache: Map<string, Array<string>>,
  cacheKey: string,
): Array<string> | null {
  const cached = cache.get(cacheKey);
  if (!cached) {
    return null;
  }
  cache.delete(cacheKey);
  cache.set(cacheKey, cached);
  return [...cached];
}

function writeCachedContextOptions(
  cache: Map<string, Array<string>>,
  cacheKey: string,
  options: Array<string>,
): void {
  if (cache.has(cacheKey)) {
    cache.delete(cacheKey);
  }
  cache.set(cacheKey, [...options]);
  if (cache.size > CONTEXT_SEARCH_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") {
      cache.delete(oldestKey);
    }
  }
}

function filterContextOptions(options: Array<string>, query: string): Array<string> {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return [...options];
  }
  return options.filter((option) => option.toLowerCase().includes(trimmedQuery));
}

function readPrefixCachedContextOptions(args: {
  cache: Map<string, Array<string>>;
  cacheKey: string;
  limit: number;
  query: string;
}): Array<string> | null {
  const { cache, cacheKey, limit, query } = args;
  for (let prefixLength = cacheKey.length - 1; prefixLength >= 1; prefixLength -= 1) {
    const prefixKey = cacheKey.slice(0, prefixLength);
    const prefixCached = readCachedContextOptions(cache, prefixKey);
    if (!prefixCached) {
      continue;
    }
    return filterContextOptions(prefixCached, query).slice(0, limit);
  }
  return null;
}

function createContextSnapshot(
  overrides: Partial<TriageContextProviderSnapshot> = {},
): TriageContextProviderSnapshot {
  return {
    data: {
      cache: new Map<string, Array<string>>(),
      lastQuery: "",
      supportWarmed: false,
    },
    error: null,
    options: [],
    query: "",
    status: "cold",
    ...overrides,
  };
}

function createPeopleSnapshot(
  overrides: Partial<TriagePeopleProviderSnapshot> = {},
): TriagePeopleProviderSnapshot {
  return {
    error: null,
    options: [],
    status: "cold",
    ...overrides,
  };
}

function createProjectSnapshot(
  options: Array<ProjectOption> = [],
  overrides: Partial<TriageProjectProviderSnapshot> = {},
): TriageProjectProviderSnapshot {
  const nextOptions = [...options];
  return {
    data: {
      lookup: buildProjectOptionLookup(nextOptions),
      searchTextLookup: buildProjectSearchTextLookup(nextOptions),
    },
    error: null,
    options: nextOptions,
    status: nextOptions.length > 0 ? "ready" : "cold",
    ...overrides,
  };
}

function mergePeopleOptions(
  current: Array<PersonEntry>,
  nextEntries: Array<PersonEntry>,
): Array<PersonEntry> {
  const byKey = new Map<string, PersonEntry>();
  for (const entry of current) {
    byKey.set(entry.uid || entry.title.trim().toLowerCase(), entry);
  }
  for (const entry of nextEntries) {
    byKey.set(entry.uid || entry.title.trim().toLowerCase(), entry);
  }
  return sortPeopleEntries(Array.from(byKey.values()));
}

function mergeProjectProviderOptions(
  current: Array<ProjectOption>,
  nextEntries: Array<ProjectOption>,
): Array<ProjectOption> {
  const merged = new Map<string, ProjectOption>();
  for (const project of current) {
    merged.set(project.uid, { ...project });
  }
  for (const project of nextEntries) {
    if (!project.title.trim()) {
      continue;
    }
    merged.set(project.uid, { ...project });
  }
  return Array.from(merged.values());
}

function mergeSeededProjectOptions(
  current: Array<ProjectOption>,
  seeded: Array<ProjectOption>,
): Array<ProjectOption> {
  if (current.length === 0) {
    return seeded;
  }
  if (seeded.length === 0) {
    return current;
  }
  const merged = new Map(current.map((project) => [project.uid, project]));
  for (const project of seeded) {
    if (!merged.has(project.uid)) {
      merged.set(project.uid, project);
    }
  }
  return Array.from(merged.values());
}

export function createTriageInputService(args: CreateTriageInputServiceArgs): TriageInputService {
  const contextListeners = new Set<() => void>();
  const peopleListeners = new Set<() => void>();
  const projectListeners = new Set<() => void>();

  let contextVersion = 0;
  let peopleVersion = 0;
  let projectVersion = 0;

  let contextWarmPromise: Promise<void> | null = null;
  const contextQueryPromises = new Map<string, Promise<Array<string>>>();
  let peopleWarmPromise: Promise<void> | null = null;
  let projectWarmPromise: Promise<void> | null = null;

  let contextSnapshot = createContextSnapshot();
  let peopleSnapshot = createPeopleSnapshot();
  let projectSnapshot = createProjectSnapshot();

  const notify = (providerKey: TriageProviderKey): void => {
    const listeners =
      providerKey === "context"
        ? contextListeners
        : providerKey === "people"
          ? peopleListeners
          : projectListeners;
    for (const listener of listeners) {
      listener();
    }
  };

  const publishContext = (
    updater: (current: TriageContextProviderSnapshot) => TriageContextProviderSnapshot,
  ): void => {
    contextSnapshot = updater(contextSnapshot);
    notify("context");
  };

  const publishPeople = (
    updater: (current: TriagePeopleProviderSnapshot) => TriagePeopleProviderSnapshot,
  ): void => {
    peopleSnapshot = updater(peopleSnapshot);
    notify("people");
  };

  const publishProject = (
    updater: (current: TriageProjectProviderSnapshot) => TriageProjectProviderSnapshot,
  ): void => {
    projectSnapshot = updater(projectSnapshot);
    notify("project");
  };

  const writeContextResults = (query: string, options: Array<string>): void => {
    const cache = cloneStringOptionsMap(contextSnapshot.data.cache);
    const cacheKey = query.trim().toLowerCase();
    if (cacheKey) {
      writeCachedContextOptions(cache, cacheKey, options);
    }
    publishContext((current) => ({
      ...current,
      data: {
        ...current.data,
        cache,
        lastQuery: query,
      },
      error: null,
      options,
      query,
      status: current.data.supportWarmed || options.length > 0 ? "ready" : "cold",
    }));
  };

  const setProjectOptions = (options: Array<ProjectOption>, status: TriageProviderStatus): void => {
    publishProject(() =>
      createProjectSnapshot(options, {
        error: null,
        status,
      }),
    );
  };

  const runContextWarmup = (force: boolean): Promise<void> => {
    if (!force) {
      if (contextSnapshot.data.supportWarmed && contextSnapshot.status !== "error") {
        return Promise.resolve();
      }
      if (contextWarmPromise) {
        return contextWarmPromise;
      }
    } else if (contextWarmPromise) {
      return contextWarmPromise;
    }

    const requestVersion = contextVersion;
    publishContext((current) => ({
      ...current,
      error: null,
      status: "warming",
    }));

    const warmPromise = primePageTitleSearchSupport()
      .then(() => {
        if (requestVersion !== contextVersion) {
          return;
        }
        publishContext((current) => ({
          ...current,
          data: {
            ...current.data,
            supportWarmed: true,
          },
          error: null,
          status: "ready",
        }));
      })
      .catch((error: unknown) => {
        if (requestVersion !== contextVersion) {
          return;
        }
        const resolvedError = resolveError(error);
        publishContext((current) => ({
          ...current,
          error: resolvedError,
          status: "error",
        }));
        throw resolvedError;
      })
      .finally(() => {
        if (contextWarmPromise === warmPromise) {
          contextWarmPromise = null;
        }
      });

    contextWarmPromise = warmPromise;
    return warmPromise;
  };

  const runPeopleWarmup = (force: boolean): Promise<void> => {
    if (!force) {
      if (peopleSnapshot.status === "ready" && peopleSnapshot.options.length > 0) {
        return Promise.resolve();
      }
      if (peopleWarmPromise) {
        return peopleWarmPromise;
      }
    } else if (peopleWarmPromise) {
      return peopleWarmPromise;
    }

    const requestVersion = peopleVersion;
    publishPeople((current) => ({
      ...current,
      error: null,
      status: "warming",
    }));

    const warmPromise = fetchAllPeople(args.settings.delegateTargetTags)
      .then((entries) => {
        if (requestVersion !== peopleVersion) {
          return;
        }
        publishPeople(() => ({
          error: null,
          options: sortPeopleEntries(entries),
          status: "ready",
        }));
      })
      .catch((error: unknown) => {
        if (requestVersion !== peopleVersion) {
          return;
        }
        const resolvedError = resolveError(error);
        publishPeople((current) => ({
          ...current,
          error: resolvedError,
          status: "error",
        }));
        throw resolvedError;
      })
      .finally(() => {
        if (peopleWarmPromise === warmPromise) {
          peopleWarmPromise = null;
        }
      });

    peopleWarmPromise = warmPromise;
    return warmPromise;
  };

  const runProjectWarmup = (force: boolean): Promise<void> => {
    if (!force) {
      if (projectSnapshot.status === "ready" && projectSnapshot.options.length > 0) {
        return Promise.resolve();
      }
      if (projectWarmPromise) {
        return projectWarmPromise;
      }
    } else if (projectWarmPromise) {
      return projectWarmPromise;
    }

    const requestVersion = projectVersion;
    const seedProjects = getProjectOptionsFromSummaries(args.store.getSnapshot().projects);
    const seededOptions = mergeSeededProjectOptions(projectSnapshot.options, seedProjects);
    setProjectOptions(seededOptions, "warming");

    const warmPromise = loadTriageProjects({
      onUpdate: (nextProjects) => {
        if (requestVersion !== projectVersion) {
          return;
        }
        setProjectOptions(nextProjects, "warming");
      },
      seedProjects,
    })
      .then((projects) => {
        if (requestVersion !== projectVersion) {
          return;
        }
        setProjectOptions(projects, "ready");
      })
      .catch((error: unknown) => {
        if (requestVersion !== projectVersion) {
          return;
        }
        const resolvedError = resolveError(error);
        publishProject((current) => ({
          ...current,
          error: resolvedError,
          status: "error",
        }));
        throw resolvedError;
      })
      .finally(() => {
        if (projectWarmPromise === warmPromise) {
          projectWarmPromise = null;
        }
      });

    projectWarmPromise = warmPromise;
    return warmPromise;
  };

  return {
    ensureWarm(providerKey) {
      if (providerKey === "context") {
        return runContextWarmup(false);
      }
      if (providerKey === "people") {
        return runPeopleWarmup(false);
      }
      return runProjectWarmup(false);
    },
    getSnapshot(providerKey) {
      if (providerKey === "context") {
        return {
          ...contextSnapshot,
          data: {
            ...contextSnapshot.data,
            cache: cloneStringOptionsMap(contextSnapshot.data.cache),
          },
          options: [...contextSnapshot.options],
        } as TriageProviderSnapshotMap[typeof providerKey];
      }
      if (providerKey === "people") {
        return {
          ...peopleSnapshot,
          options: [...peopleSnapshot.options],
        } as TriageProviderSnapshotMap[typeof providerKey];
      }
      return {
        ...projectSnapshot,
        data: {
          lookup: new Map(projectSnapshot.data.lookup),
          searchTextLookup: new Map(projectSnapshot.data.searchTextLookup),
        },
        options: [...projectSnapshot.options],
      } as TriageProviderSnapshotMap[typeof providerKey];
    },
    getStatus(providerKey) {
      if (providerKey === "context") {
        return contextSnapshot.status;
      }
      if (providerKey === "people") {
        return peopleSnapshot.status;
      }
      return projectSnapshot.status;
    },
    invalidate(providerKey) {
      if (providerKey === "context") {
        contextVersion += 1;
        contextQueryPromises.clear();
        contextWarmPromise = null;
        publishContext((current) => ({
          ...current,
          data: {
            cache: new Map<string, Array<string>>(),
            lastQuery: "",
            supportWarmed: current.data.supportWarmed,
          },
          error: null,
          options: [],
          query: "",
          status: current.data.supportWarmed ? "ready" : "cold",
        }));
        return;
      }
      if (providerKey === "people") {
        peopleVersion += 1;
        peopleWarmPromise = null;
        peopleSnapshot = createPeopleSnapshot();
        notify("people");
        return;
      }
      projectVersion += 1;
      projectWarmPromise = null;
      projectSnapshot = createProjectSnapshot();
      notify("project");
    },
    queryContextOptions(query, limit = CONTEXT_SEARCH_MAX_RESULTS) {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        writeContextResults("", []);
        return Promise.resolve([]);
      }

      const exactCached = readCachedContextOptions(
        contextSnapshot.data.cache,
        trimmedQuery.toLowerCase(),
      );
      if (exactCached) {
        writeContextResults(trimmedQuery, exactCached);
        return Promise.resolve(exactCached);
      }

      const inFlight = contextQueryPromises.get(trimmedQuery.toLowerCase());
      if (inFlight) {
        return inFlight;
      }

      const requestVersion = contextVersion;
      const prefixCached = readPrefixCachedContextOptions({
        cache: contextSnapshot.data.cache,
        cacheKey: trimmedQuery.toLowerCase(),
        limit,
        query: trimmedQuery,
      });
      if (prefixCached !== null) {
        publishContext((current) => ({
          ...current,
          data: {
            ...current.data,
            lastQuery: trimmedQuery,
          },
          error: null,
          options: prefixCached,
          query: trimmedQuery,
          status: "warming",
        }));
      } else {
        publishContext((current) => ({
          ...current,
          data: {
            ...current.data,
            lastQuery: trimmedQuery,
          },
          error: null,
          query: trimmedQuery,
          status: "warming",
        }));
      }

      void runContextWarmup(false).catch(() => undefined);

      const searchPromise = loadContextPageOptions(trimmedQuery, limit)
        .then((options) => {
          if (requestVersion !== contextVersion) {
            return options;
          }
          writeContextResults(trimmedQuery, options);
          return options;
        })
        .catch((error: unknown) => {
          if (requestVersion !== contextVersion) {
            return [];
          }
          const resolvedError = resolveError(error);
          publishContext((current) => ({
            ...current,
            error: resolvedError,
            status: "error",
          }));
          throw resolvedError;
        })
        .finally(() => {
          if (contextQueryPromises.get(trimmedQuery.toLowerCase()) === searchPromise) {
            contextQueryPromises.delete(trimmedQuery.toLowerCase());
          }
        });

      contextQueryPromises.set(trimmedQuery.toLowerCase(), searchPromise);
      return searchPromise;
    },
    readContextOptions(query) {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return [];
      }
      return readCachedContextOptions(contextSnapshot.data.cache, trimmedQuery.toLowerCase());
    },
    readPrefixContextOptions(query, limit = CONTEXT_SEARCH_MAX_RESULTS) {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return [];
      }
      return readPrefixCachedContextOptions({
        cache: contextSnapshot.data.cache,
        cacheKey: trimmedQuery.toLowerCase(),
        limit,
        query: trimmedQuery,
      });
    },
    retry(providerKey) {
      if (providerKey === "context") {
        return runContextWarmup(true);
      }
      if (providerKey === "people") {
        return runPeopleWarmup(true);
      }
      return runProjectWarmup(true);
    },
    seed(providerKey, nextSnapshot) {
      if (providerKey === "context") {
        const contextSeed = nextSnapshot as TriageContextSeedSnapshot;
        writeContextResults(contextSeed.query, contextSeed.options);
        return;
      }
      if (providerKey === "people") {
        const peopleSeed = nextSnapshot as Array<PersonEntry>;
        publishPeople((current) => ({
          error: null,
          options: mergePeopleOptions(current.options, peopleSeed),
          status: "ready",
        }));
        return;
      }
      const projectSeed = nextSnapshot as Array<ProjectOption>;
      const mergedProjects = mergeProjectProviderOptions(projectSnapshot.options, projectSeed);
      setProjectOptions(mergedProjects, "ready");
    },
    subscribe(providerKey, listener) {
      const listeners =
        providerKey === "context"
          ? contextListeners
          : providerKey === "people"
            ? peopleListeners
            : projectListeners;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
