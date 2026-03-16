import { fetchActiveProjects, fetchAllProjects } from "../teleport";
import type { ProjectSummary } from "../types";

export interface ProjectOption {
  searchText?: string;
  title: string;
  uid: string;
}

interface TriageProjectsCacheEntry {
  loadedAt: number;
  projects: Array<ProjectOption>;
}

interface LoadTriageProjectsArgs {
  now?: number;
  onUpdate?: (projects: Array<ProjectOption>) => void;
  seedProjects?: Array<ProjectOption>;
}

const TRIAGE_PROJECTS_CACHE_TTL_MS = 30_000;

let triageProjectsCache: TriageProjectsCacheEntry | null = null;
let triageProjectsInFlightProjects: Array<ProjectOption> | null = null;
let triageProjectsLoadPromise: Promise<Array<ProjectOption>> | null = null;
let triageProjectsLoadVersion = 0;

function collapseNamespacedPageSegment(title: string): string {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || !trimmedTitle.includes("/") || trimmedTitle.includes("://")) {
    return trimmedTitle;
  }
  const lastSeparatorIndex = trimmedTitle.lastIndexOf("/");
  const namespace = trimmedTitle.slice(0, lastSeparatorIndex).trim();
  if (!namespace || namespace.includes(" ")) {
    return trimmedTitle;
  }
  const alias = trimmedTitle.slice(lastSeparatorIndex + 1).trim();
  return alias || trimmedTitle;
}

function stripProjectTitleMarkup(title?: string | null): string {
  const trimmedTitle = title?.trim() ?? "";
  if (!trimmedTitle) {
    return "";
  }
  return trimmedTitle
    .replace(/^Project::\s*/i, "")
    .replaceAll(/\(\s*#?\[\[([^[\]]+)\]\]\s*\)/g, (_match, innerTitle: string) => {
      const collapsedInnerTitle = collapseNamespacedPageSegment(innerTitle);
      return collapsedInnerTitle ? ` ${collapsedInnerTitle}` : "";
    })
    .replaceAll(/#?\[\[([^[\]]+)\]\]/g, (_match, innerTitle: string) => innerTitle.trim())
    .replaceAll(/\s+/g, " ")
    .trim();
}

function buildProjectOptionSearchText(title?: string | null): string {
  return stripProjectTitleMarkup(title).toLowerCase();
}

function getFreshTriageProjectsCache(now: number): Array<ProjectOption> | null {
  if (
    triageProjectsCache == null ||
    now - triageProjectsCache.loadedAt >= TRIAGE_PROJECTS_CACHE_TTL_MS
  ) {
    return null;
  }
  return triageProjectsCache.projects;
}

function mergeSeedProjects(
  seedProjects: Array<ProjectOption>,
  projects: Array<ProjectOption>,
): Array<ProjectOption> {
  if (seedProjects.length === 0) {
    return projects;
  }
  return mergeProjectOptions(seedProjects, projects);
}

export function formatNamespacedPageDisplayTitle(title?: string | null): string {
  const strippedTitle = stripProjectTitleMarkup(title);
  if (!strippedTitle) {
    return "";
  }
  const withoutNamespacedAliasParens = strippedTitle.replaceAll(
    /\(\s*([^\s()]+\/[^()]+)\s*\)/g,
    (_match, namespacedSegment: string) => {
      const collapsedSegment = collapseNamespacedPageSegment(namespacedSegment);
      return collapsedSegment && collapsedSegment !== namespacedSegment
        ? ` ${collapsedSegment}`
        : ` (${namespacedSegment})`;
    },
  );
  const withCollapsedInlineNamespaces = withoutNamespacedAliasParens.replaceAll(
    /(^|[\s(])#?([^\s()]+\/[^\s()]+)/g,
    (_match, prefix: string, namespacedSegment: string) =>
      `${prefix}${collapseNamespacedPageSegment(namespacedSegment)}`,
  );
  return collapseNamespacedPageSegment(withCollapsedInlineNamespaces)
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function filterNamespacedPageOptions(options: Array<string>, query: string): Array<string> {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return options;
  }
  return options.filter((option) => {
    const normalizedOption = option.toLowerCase();
    const normalizedAlias = formatNamespacedPageDisplayTitle(option).toLowerCase();
    return normalizedOption.includes(trimmedQuery) || normalizedAlias.includes(trimmedQuery);
  });
}

export function mergeProjectOptions(...groups: Array<Array<ProjectOption>>): Array<ProjectOption> {
  const byUid = new Map<string, ProjectOption>();
  for (const group of groups) {
    for (const project of group) {
      const rawTitle = project.searchText || project.title;
      const title = formatNamespacedPageDisplayTitle(rawTitle);
      if (!title || byUid.has(project.uid)) {
        continue;
      }
      byUid.set(project.uid, {
        searchText: buildProjectOptionSearchText(rawTitle),
        title,
        uid: project.uid,
      });
    }
  }
  return Array.from(byUid.values());
}

export function buildProjectOptionLookup(
  projects: Array<ProjectOption>,
): Map<string, ProjectOption> {
  const lookup = new Map<string, ProjectOption>();
  for (const project of projects) {
    lookup.set(project.title.toLowerCase(), project);
    if (project.searchText) {
      lookup.set(project.searchText, project);
    }
  }
  return lookup;
}

export function buildProjectSearchTextLookup(
  projects: Array<ProjectOption>,
): Map<string, Array<string>> {
  const lookup = new Map<string, Array<string>>();
  for (const project of projects) {
    const searchTexts = [project.title.toLowerCase()];
    if (project.searchText) {
      searchTexts.push(project.searchText);
    }
    lookup.set(project.title, searchTexts);
  }
  return lookup;
}

export function filterProjectOptions(
  options: Array<string>,
  query: string,
  projectSearchTextLookup: Map<string, Array<string>>,
): Array<string> {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return options;
  }
  return options.filter((option) => {
    const searchTexts = projectSearchTextLookup.get(option) ?? [option.toLowerCase()];
    return searchTexts.some((searchText) => searchText.includes(trimmedQuery));
  });
}

export function getProjectOptionsFromSummaries(
  projects: Array<ProjectSummary>,
): Array<ProjectOption> {
  return mergeProjectOptions(
    projects.map((project) => ({
      searchText: project.pageTitle,
      title: project.pageTitle,
      uid: project.pageUid,
    })),
  );
}

export function invalidateTriageProjectsCache(): void {
  triageProjectsLoadVersion += 1;
  triageProjectsCache = null;
  triageProjectsInFlightProjects = null;
  triageProjectsLoadPromise = null;
}

export async function loadTriageProjects({
  now = Date.now(),
  onUpdate,
  seedProjects = [],
}: LoadTriageProjectsArgs = {}): Promise<Array<ProjectOption>> {
  const loadVersion = triageProjectsLoadVersion;
  const mergedSeedProjects = mergeProjectOptions(seedProjects);
  const cachedProjects = getFreshTriageProjectsCache(now);
  if (cachedProjects) {
    const mergedProjects = mergeSeedProjects(mergedSeedProjects, cachedProjects);
    onUpdate?.(mergedProjects);
    return mergedProjects;
  }

  const currentInFlightProjects = triageProjectsInFlightProjects;
  if (currentInFlightProjects) {
    onUpdate?.(mergeSeedProjects(mergedSeedProjects, currentInFlightProjects));
  }
  if (triageProjectsLoadPromise) {
    const loadedProjects = await triageProjectsLoadPromise;
    const mergedProjects = mergeSeedProjects(mergedSeedProjects, loadedProjects);
    if (triageProjectsLoadVersion === loadVersion) {
      onUpdate?.(mergedProjects);
    }
    return mergedProjects;
  }

  const loadPromise = (async () => {
    const activeProjects = mergeProjectOptions(await fetchActiveProjects());
    if (triageProjectsLoadVersion !== loadVersion) {
      return activeProjects;
    }
    triageProjectsInFlightProjects = activeProjects;
    onUpdate?.(mergeSeedProjects(mergedSeedProjects, activeProjects));

    const loadedProjects = mergeProjectOptions(activeProjects, await fetchAllProjects());
    if (triageProjectsLoadVersion !== loadVersion) {
      return loadedProjects;
    }
    triageProjectsInFlightProjects = loadedProjects;
    triageProjectsCache = {
      loadedAt: Date.now(),
      projects: loadedProjects,
    };
    return loadedProjects;
  })().finally(() => {
    if (triageProjectsLoadVersion === loadVersion) {
      triageProjectsInFlightProjects = null;
    }
    if (triageProjectsLoadPromise === loadPromise) {
      triageProjectsLoadPromise = null;
    }
  });
  triageProjectsLoadPromise = loadPromise;

  const loadedProjects = await loadPromise;
  const mergedProjects = mergeSeedProjects(mergedSeedProjects, loadedProjects);
  if (triageProjectsLoadVersion === loadVersion) {
    onUpdate?.(mergedProjects);
  }
  return mergedProjects;
}
