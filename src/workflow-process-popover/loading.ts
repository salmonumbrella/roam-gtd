import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchAllPeople, sortPeopleEntries, type PersonEntry } from "../people";
import type { TriageInputService } from "../review/session/triage-input-service";
import {
  filterContextSearchOptions,
  loadContextPageOptions,
  readCachedTriageOptions,
  writeCachedTriageOptions,
} from "../triage/context-search";
import {
  CONTEXT_AUTOCOMPLETE_ID,
  CONTEXT_SEARCH_CACHE_LIMIT,
  CONTEXT_SEARCH_DEBOUNCE_MS,
  CONTEXT_SEARCH_MAX_RESULTS,
  DELEGATE_AUTOCOMPLETE_ID,
  PROJECT_AUTOCOMPLETE_ID,
} from "../triage/form-helpers";
import {
  buildProjectOptionLookup,
  buildProjectSearchTextLookup,
  filterNamespacedPageOptions,
  filterProjectOptions as filterProjectOptionsBySearchText,
  loadTriageProjects,
  type ProjectOption,
} from "../triage/support";

interface UseWorkflowProcessPopoverLoadingArgs {
  delegateTargetTags: Array<string>;
  initialPeople?: Array<PersonEntry>;
  initialProjects?: Array<ProjectOption>;
  isOpen: boolean;
  triageInputService?: TriageInputService;
  triageService?: TriageInputService;
}

interface ReadInputValueArgs {
  projectLookup: Map<string, ProjectOption>;
  value: string;
}

export interface WorkflowProcessPopoverDomFormValues {
  contextQuery: string;
  delegateQuery: string;
  projectQuery: string;
  selectedProject: ProjectOption | null;
}

export function readWorkflowProcessContextCache(
  cache: Map<string, Array<string>>,
  cacheKey: string,
): Array<string> | null {
  return readCachedTriageOptions(cache, cacheKey);
}

export function writeWorkflowProcessContextCache(
  cache: Map<string, Array<string>>,
  cacheKey: string,
  options: Array<string>,
): void {
  writeCachedTriageOptions(cache, cacheKey, options, CONTEXT_SEARCH_CACHE_LIMIT);
}

export function readWorkflowProcessProjectSelection({
  projectLookup,
  value,
}: ReadInputValueArgs): ProjectOption | null {
  return projectLookup.get(value.trim().toLowerCase()) ?? null;
}

export function useWorkflowProcessPopoverLoading({
  delegateTargetTags,
  initialPeople,
  initialProjects,
  isOpen,
  triageInputService,
  triageService,
}: UseWorkflowProcessPopoverLoadingArgs) {
  const sharedTriageService = triageService ?? triageInputService;
  const [contextQuery, setContextQuery] = useState("");
  const [contextOptions, setContextOptions] = useState<Array<string>>([]);
  const [delegateQuery, setDelegateQuery] = useState("");
  const [people, setPeople] = useState<Array<PersonEntry>>(
    () => initialPeople ?? sharedTriageService?.getSnapshot("people").options ?? [],
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<Array<ProjectOption>>(
    () => initialProjects ?? sharedTriageService?.getSnapshot("project").options ?? [],
  );
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const mountedRef = useRef(true);
  const previousContextQueryRef = useRef("");
  const contextSearchCacheRef = useRef(new Map<string, Array<string>>());
  const contextSearchRequestIdRef = useRef(0);
  const peopleLoadedRef = useRef(false);
  const peopleLoadingRef = useRef(false);
  const projectsLoadedRef = useRef(false);
  const projectsLoadingRef = useRef(false);

  const projectLookup = useMemo(() => buildProjectOptionLookup(projects), [projects]);
  const projectSearchTextLookup = useMemo(() => buildProjectSearchTextLookup(projects), [projects]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!initialPeople) {
      return;
    }
    setPeople(initialPeople);
  }, [initialPeople]);

  useEffect(() => {
    if (!sharedTriageService || initialPeople) {
      return;
    }

    const syncPeopleFromProvider = (): void => {
      setPeople(sharedTriageService.getSnapshot("people").options);
    };

    syncPeopleFromProvider();
    return sharedTriageService.subscribe("people", syncPeopleFromProvider);
  }, [initialPeople, sharedTriageService]);

  useEffect(() => {
    if (!initialProjects) {
      return;
    }
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    if (!sharedTriageService || initialProjects) {
      return;
    }

    const syncProjectsFromProvider = (): void => {
      setProjects(sharedTriageService.getSnapshot("project").options);
    };

    syncProjectsFromProvider();
    return sharedTriageService.subscribe("project", syncProjectsFromProvider);
  }, [initialProjects, sharedTriageService]);

  const requestPeopleLoad = useCallback(() => {
    if (sharedTriageService && !initialPeople) {
      void sharedTriageService.ensureWarm("people").catch(() => undefined);
      return;
    }
    if (initialPeople || peopleLoadedRef.current || peopleLoadingRef.current) {
      return;
    }
    peopleLoadingRef.current = true;
    void fetchAllPeople(delegateTargetTags)
      .then((entries) => {
        if (!mountedRef.current) {
          return;
        }
        setPeople(sortPeopleEntries(entries));
        peopleLoadedRef.current = true;
      })
      .catch(() => {
        if (!mountedRef.current) {
          return;
        }
        setPeople([]);
      })
      .finally(() => {
        peopleLoadingRef.current = false;
      });
  }, [delegateTargetTags, initialPeople, sharedTriageService]);

  const requestProjectsLoad = useCallback(() => {
    if (sharedTriageService && !initialProjects) {
      void sharedTriageService.ensureWarm("project").catch(() => undefined);
      return;
    }
    if (initialProjects || projectsLoadedRef.current || projectsLoadingRef.current) {
      return;
    }
    projectsLoadingRef.current = true;
    void (async () => {
      let latestProjects: Array<ProjectOption> = [];
      try {
        latestProjects = await loadTriageProjects({
          onUpdate: (nextProjects) => {
            latestProjects = nextProjects;
            if (mountedRef.current) {
              setProjects(nextProjects);
            }
          },
        });
        if (mountedRef.current) {
          projectsLoadedRef.current = true;
        }
      } catch {
        if (mountedRef.current) {
          setProjects((existing) => (existing.length > 0 ? existing : latestProjects));
        }
      } finally {
        projectsLoadingRef.current = false;
      }
    })();
  }, [initialProjects, sharedTriageService]);

  useEffect(() => {
    const query = contextQuery.trim();
    const previousQuery = previousContextQueryRef.current.trim();
    previousContextQueryRef.current = query;
    if (!query) {
      setContextOptions((previous) => (previous.length > 0 ? [] : previous));
      return;
    }

    const cacheKey = query.toLowerCase();
    if (sharedTriageService) {
      const cached = sharedTriageService.readContextOptions(query);
      if (cached) {
        setContextOptions(cached);
        return;
      }

      const prefixCached = sharedTriageService.readPrefixContextOptions(
        query,
        CONTEXT_SEARCH_MAX_RESULTS,
      );
      if (prefixCached !== null) {
        setContextOptions(prefixCached);
      }

      const requestId = contextSearchRequestIdRef.current + 1;
      contextSearchRequestIdRef.current = requestId;
      const runSearch = () => {
        void sharedTriageService
          .queryContextOptions(query, CONTEXT_SEARCH_MAX_RESULTS)
          .then((nextOptions) => {
            if (!mountedRef.current || requestId !== contextSearchRequestIdRef.current) {
              return;
            }
            setContextOptions(nextOptions);
          })
          .catch(() => {
            if (!mountedRef.current || requestId !== contextSearchRequestIdRef.current) {
              return;
            }
            setContextOptions([]);
          });
      };

      if (!previousQuery) {
        runSearch();
        return;
      }
      const timeoutId = window.setTimeout(runSearch, CONTEXT_SEARCH_DEBOUNCE_MS);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }
    const cached = readWorkflowProcessContextCache(contextSearchCacheRef.current, cacheKey);
    if (cached) {
      setContextOptions(cached);
      return;
    }

    const requestId = contextSearchRequestIdRef.current + 1;
    contextSearchRequestIdRef.current = requestId;
    const runSearch = () => {
      void loadContextPageOptions(query, CONTEXT_SEARCH_MAX_RESULTS)
        .then((nextOptions) => {
          if (!mountedRef.current || requestId !== contextSearchRequestIdRef.current) {
            return;
          }
          writeWorkflowProcessContextCache(contextSearchCacheRef.current, cacheKey, nextOptions);
          setContextOptions(nextOptions);
        })
        .catch(() => {
          if (!mountedRef.current || requestId !== contextSearchRequestIdRef.current) {
            return;
          }
          setContextOptions([]);
        });
    };

    if (!previousQuery) {
      runSearch();
      return;
    }
    const timeoutId = window.setTimeout(runSearch, CONTEXT_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [contextQuery, sharedTriageService]);

  const handleContextInput = useCallback((value: string) => {
    setContextQuery(value);
  }, []);

  const handleDelegateInput = useCallback(
    (value: string) => {
      requestPeopleLoad();
      setDelegateQuery(value);
    },
    [requestPeopleLoad],
  );

  const handleProjectInput = useCallback(
    (value: string) => {
      requestProjectsLoad();
      setProjectQuery(value);
      setSelectedProject(readWorkflowProcessProjectSelection({ projectLookup, value }));
    },
    [projectLookup, requestProjectsLoad],
  );

  const clearContextState = useCallback(() => {
    contextSearchRequestIdRef.current += 1;
    setContextQuery("");
    setContextOptions([]);
  }, []);

  const resetFormState = useCallback(() => {
    previousContextQueryRef.current = "";
    contextSearchRequestIdRef.current += 1;
    setContextQuery("");
    setContextOptions([]);
    setDelegateQuery("");
    setProjectQuery("");
    setSelectedProject(null);
  }, []);

  const filterContextOptions = useCallback(
    (options: Array<string>, query: string): Array<string> =>
      filterContextSearchOptions(options, query),
    [],
  );

  const filterProjectOptions = useCallback(
    (options: Array<string>, query: string): Array<string> =>
      filterProjectOptionsBySearchText(
        filterNamespacedPageOptions(options, query),
        query,
        projectSearchTextLookup,
      ),
    [projectSearchTextLookup],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onContextInputEvent = (event: Event): void => {
      const target = event.target as Element | null;
      if (
        !target ||
        target.nodeType !== Node.ELEMENT_NODE ||
        target.tagName !== "INPUT" ||
        (target as HTMLInputElement).id !== CONTEXT_AUTOCOMPLETE_ID
      ) {
        return;
      }
      if ((target as HTMLInputElement).value.length > 0) {
        return;
      }
      clearContextState();
    };

    document.addEventListener("input", onContextInputEvent, true);
    return () => document.removeEventListener("input", onContextInputEvent, true);
  }, [clearContextState, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onAutocompleteDeleteKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      const target = event.target as Element | null;
      if (
        !target ||
        target.nodeType !== Node.ELEMENT_NODE ||
        target.tagName !== "INPUT" ||
        (target as HTMLInputElement).id !== CONTEXT_AUTOCOMPLETE_ID
      ) {
        return;
      }
      const input = target as HTMLInputElement;
      const { selectionEnd, selectionStart, value } = input;
      if (selectionStart == null || selectionEnd == null) {
        return;
      }
      const clearsAll =
        (selectionStart === 0 && selectionEnd === value.length) ||
        (value.length === 1 &&
          selectionStart === selectionEnd &&
          ((event.key === "Backspace" && selectionStart === 1) ||
            (event.key === "Delete" && selectionStart === 0)));
      if (!clearsAll) {
        return;
      }
      event.preventDefault();
      window.requestAnimationFrame(() => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(input, "");
        } else {
          input.value = "";
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    document.addEventListener("keydown", onAutocompleteDeleteKeyDown, true);
    return () => document.removeEventListener("keydown", onAutocompleteDeleteKeyDown, true);
  }, [clearContextState, isOpen]);

  const readDomFormValues = useCallback(
    (readInputById: (id: string) => string | undefined): WorkflowProcessPopoverDomFormValues => {
      const nextContext = readInputById(CONTEXT_AUTOCOMPLETE_ID);
      const nextDelegate = readInputById(DELEGATE_AUTOCOMPLETE_ID);
      const nextProject = readInputById(PROJECT_AUTOCOMPLETE_ID);
      const normalizedProjectQuery = nextProject ?? projectQuery;
      return {
        contextQuery: nextContext ?? contextQuery,
        delegateQuery: nextDelegate ?? delegateQuery,
        projectQuery: normalizedProjectQuery,
        selectedProject: readWorkflowProcessProjectSelection({
          projectLookup,
          value: normalizedProjectQuery,
        }),
      };
    },
    [contextQuery, delegateQuery, projectLookup, projectQuery],
  );

  return {
    clearContextState,
    contextOptions,
    contextQuery,
    delegateOptions: people.map((person) => person.title),
    delegateQuery,
    filterContextOptions,
    filterProjectOptions,
    handleContextInput,
    handleDelegateInput,
    handleProjectInput,
    people,
    projectLookup,
    projectOptions: projects.map((project) => project.title),
    projectQuery,
    projects,
    readDomFormValues,
    requestPeopleLoad,
    requestProjectsLoad,
    resetFormState,
    selectedProject,
  };
}
