import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";

import { primePageTitleSearchSupport, searchPagesAsync } from "../contexts";
import { fetchAllPeople, sortPeopleEntries, type PersonEntry } from "../people";
import type { TriageInputService } from "../review/session/triage-input-service";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import {
  filterContextSearchOptions,
  getPrefixCachedTriageOptions,
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
import type { TriageCounterAction } from "../triage/step-logic";
import {
  buildProjectOptionLookup,
  buildProjectSearchTextLookup,
  filterProjectOptions as filterProjectOptionsBySearchText,
  getProjectOptionsFromSummaries,
  loadTriageProjects,
  type ProjectOption,
} from "../triage/support";

export interface InboxZeroFormState {
  contextQuery: string;
  delegateQuery: string;
  projectQuery: string;
  selectedProject: ProjectOption | null;
}

interface UseInboxZeroContextDelegateControllerArgs {
  currentItemText: string;
  currentItemUid: string | null;
  delegateInputRef: RefObject<HTMLInputElement>;
  mountedRef: MutableRefObject<boolean>;
  rememberCounterAction: (uid: string, action: TriageCounterAction) => void;
  scheduleWhenInputsOutsideAllowedAreIdle: (
    callback: () => void,
    delayMs: number,
    allowedFieldIds: string | Array<string>,
    retryDelayMs?: number,
  ) => () => void;
  settings: GtdSettings;
  store: ReturnType<typeof createGtdStore>;
  syncCounterActionForUidRef: MutableRefObject<
    ((uid: string, fallback?: string) => Promise<void>) | null
  >;
  triageService?: TriageInputService;
}

type CachedInboxZeroFormState = InboxZeroFormState;

function isHtmlInputElement(element: Element | null): element is HTMLInputElement {
  return element != null && element.nodeType === Node.ELEMENT_NODE && element.tagName === "INPUT";
}

function wouldDeletionEmptyInput(input: HTMLInputElement, key: "Backspace" | "Delete"): boolean {
  const { selectionEnd, selectionStart, value } = input;
  if (selectionStart == null || selectionEnd == null) {
    return false;
  }
  if (selectionStart === 0 && selectionEnd === value.length) {
    return true;
  }
  if (value.length !== 1 || selectionStart !== selectionEnd) {
    return false;
  }
  return key === "Backspace" ? selectionStart === 1 : selectionStart === 0;
}

export function useInboxZeroContextDelegateController(
  args: UseInboxZeroContextDelegateControllerArgs,
) {
  const {
    currentItemText,
    currentItemUid,
    delegateInputRef,
    mountedRef,
    rememberCounterAction,
    scheduleWhenInputsOutsideAllowedAreIdle,
    settings,
    store,
    syncCounterActionForUidRef,
    triageService,
  } = args;

  const [delegateQuery, setDelegateQuery] = useState("");
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);
  const [people, setPeople] = useState<Array<PersonEntry>>([]);
  const [pendingDelegateUid, setPendingDelegateUid] = useState<string | null>(null);
  const [contextQuery, setContextQuery] = useState("");
  const [contextOptions, setContextOptions] = useState<Array<string>>([]);
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<Array<ProjectOption>>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const [showDelegatePrompt, setShowDelegatePrompt] = useState(false);
  const peopleLoadedRef = useRef(false);
  const peopleLoadingRef = useRef(false);
  const peopleLoadVersionRef = useRef(0);
  const projectsLoadedRef = useRef(false);
  const projectsLoadingRef = useRef(false);
  const projectsLoadPromiseRef = useRef<Promise<void> | null>(null);
  const pendingPeopleLoadRef = useRef<(() => void) | null>(null);
  const pendingProjectsLoadRef = useRef<(() => void) | null>(null);
  const pendingContextSupportWarmupRef = useRef<(() => void) | null>(null);
  const intendedDelegateRef = useRef("");
  const intendedContextRef = useRef("");
  const intendedProjectRef = useRef("");
  const formStateRef = useRef<InboxZeroFormState>({
    contextQuery: "",
    delegateQuery: "",
    projectQuery: "",
    selectedProject: null,
  });
  const formStateCacheRef = useRef(new Map<string, CachedInboxZeroFormState>());
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const showDelegatePromptRef = useRef(showDelegatePrompt);
  showDelegatePromptRef.current = showDelegatePrompt;
  const contextSearchCacheRef = useRef(new Map<string, Array<string>>());
  const contextSearchRequestIdRef = useRef(0);
  const isResettingContextRef = useRef(false);
  const previousContextQueryRef = useRef("");

  formStateRef.current = {
    contextQuery,
    delegateQuery,
    projectQuery,
    selectedProject,
  };

  const syncFormStateFromDom = useCallback(() => {
    const readInput = (id: string): string | undefined => {
      const element = document.getElementById(id) as HTMLInputElement | null;
      return element ? element.value : undefined;
    };
    const nextContext = readInput(CONTEXT_AUTOCOMPLETE_ID);
    if (nextContext !== undefined && nextContext !== formStateRef.current.contextQuery) {
      formStateRef.current = { ...formStateRef.current, contextQuery: nextContext };
      intendedContextRef.current = nextContext;
    }
    const nextDelegate = readInput(DELEGATE_AUTOCOMPLETE_ID);
    if (nextDelegate !== undefined && nextDelegate !== formStateRef.current.delegateQuery) {
      formStateRef.current = { ...formStateRef.current, delegateQuery: nextDelegate };
      intendedDelegateRef.current = nextDelegate;
    }
    const nextProject = readInput(PROJECT_AUTOCOMPLETE_ID);
    if (nextProject !== undefined && nextProject !== formStateRef.current.projectQuery) {
      formStateRef.current = { ...formStateRef.current, projectQuery: nextProject };
      intendedProjectRef.current = nextProject;
    }
  }, []);

  const cacheFormState = useCallback(
    (uid: string): void => {
      syncFormStateFromDom();
      formStateCacheRef.current.set(uid, { ...formStateRef.current });
    },
    [syncFormStateFromDom],
  );

  const restoreFormState = useCallback((targetUid?: string): void => {
    const cached = targetUid ? formStateCacheRef.current.get(targetUid) : undefined;
    if (cached) {
      intendedContextRef.current = cached.contextQuery;
      intendedDelegateRef.current = cached.delegateQuery;
      intendedProjectRef.current = cached.projectQuery;
      return;
    }
    intendedContextRef.current = "";
    intendedDelegateRef.current = "";
    intendedProjectRef.current = "";
  }, []);

  const resetFormState = useCallback((): void => {
    intendedContextRef.current = "";
    intendedDelegateRef.current = "";
    intendedProjectRef.current = "";
    formStateRef.current = {
      contextQuery: "",
      delegateQuery: "",
      projectQuery: "",
      selectedProject: null,
    };
    setContextQuery("");
    setDelegateQuery("");
    setProjectQuery("");
    setSelectedProject(null);
  }, []);

  useEffect(() => {
    if (!currentItemUid) {
      return;
    }
    const cached = formStateCacheRef.current.get(currentItemUid);
    if (cached) {
      intendedContextRef.current = cached.contextQuery;
      intendedDelegateRef.current = cached.delegateQuery;
      intendedProjectRef.current = cached.projectQuery;
      setContextQuery(cached.contextQuery);
      setDelegateQuery(cached.delegateQuery);
      setProjectQuery(cached.projectQuery);
      setSelectedProject(cached.selectedProject);
      return;
    }
    resetFormState();
  }, [currentItemUid, resetFormState]);

  useEffect(() => {
    if (!triageService) {
      return;
    }

    const syncPeopleFromProvider = (): void => {
      const snapshot = triageService.getSnapshot("people");
      setPeople(snapshot.options);
      setIsPeopleLoading(snapshot.status === "warming");
    };

    syncPeopleFromProvider();
    return triageService.subscribe("people", syncPeopleFromProvider);
  }, [triageService]);

  useEffect(() => {
    if (!triageService) {
      return;
    }

    const syncProjectsFromProvider = (): void => {
      const snapshot = triageService.getSnapshot("project");
      setProjects(snapshot.options);
    };

    syncProjectsFromProvider();
    return triageService.subscribe("project", syncProjectsFromProvider);
  }, [triageService]);

  const requestPeopleLoad = useCallback(() => {
    if (triageService) {
      setIsPeopleLoading(true);
      void triageService.ensureWarm("people").catch(() => undefined);
      return;
    }
    if (peopleLoadedRef.current || peopleLoadingRef.current) {
      return;
    }
    const loadVersion = peopleLoadVersionRef.current;
    peopleLoadingRef.current = true;
    setIsPeopleLoading(true);
    void fetchAllPeople(settings.delegateTargetTags)
      .then((entries) => {
        if (!mountedRef.current || loadVersion !== peopleLoadVersionRef.current) {
          return;
        }
        setPeople(entries);
        peopleLoadedRef.current = true;
      })
      .catch(() => {
        if (!mountedRef.current || loadVersion !== peopleLoadVersionRef.current) {
          return;
        }
        setPeople([]);
      })
      .finally(() => {
        if (loadVersion === peopleLoadVersionRef.current) {
          peopleLoadingRef.current = false;
          setIsPeopleLoading(false);
        }
      });
  }, [mountedRef, settings.delegateTargetTags, triageService]);

  useEffect(() => {
    pendingPeopleLoadRef.current?.();
    pendingPeopleLoadRef.current = null;
    if (triageService) {
      triageService.invalidate("people");
      setIsPeopleLoading(false);
      setPeople(triageService.getSnapshot("people").options);
      return;
    }
    peopleLoadVersionRef.current += 1;
    peopleLoadedRef.current = false;
    peopleLoadingRef.current = false;
    setIsPeopleLoading(false);
    setPeople([]);
  }, [settings.delegateTargetTags, triageService]);

  const cancelScheduledAutocompleteWarmup = useCallback(
    (slotRef: MutableRefObject<(() => void) | null>): void => {
      slotRef.current?.();
      slotRef.current = null;
    },
    [],
  );

  const scheduleContextSupportWarmup = useCallback(() => {
    cancelScheduledAutocompleteWarmup(pendingContextSupportWarmupRef);
    pendingContextSupportWarmupRef.current = scheduleWhenInputsOutsideAllowedAreIdle(
      () => {
        pendingContextSupportWarmupRef.current = null;
        if (triageService) {
          void triageService.ensureWarm("context").catch(() => undefined);
          return;
        }
        void primePageTitleSearchSupport();
      },
      220,
      CONTEXT_AUTOCOMPLETE_ID,
    );
  }, [cancelScheduledAutocompleteWarmup, scheduleWhenInputsOutsideAllowedAreIdle, triageService]);

  const schedulePeopleLoadSoon = useCallback(
    (
      allowedFieldIds: string | Array<string> = DELEGATE_AUTOCOMPLETE_ID,
      retryDelayMs: number = 80,
      initialDelayMs: number = 320,
    ) => {
      if (peopleLoadedRef.current || peopleLoadingRef.current) {
        return;
      }
      cancelScheduledAutocompleteWarmup(pendingPeopleLoadRef);
      pendingPeopleLoadRef.current = scheduleWhenInputsOutsideAllowedAreIdle(
        () => {
          pendingPeopleLoadRef.current = null;
          requestPeopleLoad();
        },
        initialDelayMs,
        allowedFieldIds,
        retryDelayMs,
      );
    },
    [cancelScheduledAutocompleteWarmup, requestPeopleLoad, scheduleWhenInputsOutsideAllowedAreIdle],
  );

  const loadProjects = useCallback(async () => {
    if (triageService) {
      await triageService.ensureWarm("project");
      return;
    }
    if (projectsLoadedRef.current) {
      return;
    }
    if (projectsLoadPromiseRef.current) {
      return projectsLoadPromiseRef.current;
    }

    const loadPromise = (async () => {
      projectsLoadingRef.current = true;
      const cachedProjects = getProjectOptionsFromSummaries(store.getSnapshot().projects);
      let latestProjects = cachedProjects;
      try {
        if (cachedProjects.length > 0 && mountedRef.current) {
          setProjects(cachedProjects);
        }
        latestProjects = await loadTriageProjects({
          onUpdate: (nextProjects) => {
            latestProjects = nextProjects;
            if (mountedRef.current) {
              setProjects(nextProjects);
            }
          },
          seedProjects: cachedProjects,
        });
        if (!mountedRef.current) {
          return;
        }
        projectsLoadedRef.current = true;
      } catch (error) {
        // eslint-disable-next-line no-console -- keep triage stable when project lookup fails
        console.warn("[RoamGTD] Failed to load projects", error);
        if (mountedRef.current) {
          setProjects((existingProjects) =>
            existingProjects.length > 0 ? existingProjects : latestProjects,
          );
        }
      } finally {
        projectsLoadingRef.current = false;
        projectsLoadPromiseRef.current = null;
      }
    })();

    projectsLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }, [mountedRef, store, triageService]);

  const requestProjectsLoad = useCallback(() => {
    void loadProjects();
  }, [loadProjects]);

  const scheduleProjectsLoadSoon = useCallback(
    (
      allowedFieldIds: string | Array<string> = PROJECT_AUTOCOMPLETE_ID,
      retryDelayMs: number = 80,
      initialDelayMs: number = 320,
    ) => {
      if (projectsLoadedRef.current || projectsLoadingRef.current) {
        return;
      }
      cancelScheduledAutocompleteWarmup(pendingProjectsLoadRef);
      pendingProjectsLoadRef.current = scheduleWhenInputsOutsideAllowedAreIdle(
        () => {
          pendingProjectsLoadRef.current = null;
          requestProjectsLoad();
        },
        initialDelayMs,
        allowedFieldIds,
        retryDelayMs,
      );
    },
    [
      cancelScheduledAutocompleteWarmup,
      requestProjectsLoad,
      scheduleWhenInputsOutsideAllowedAreIdle,
    ],
  );

  useEffect(
    () => () => {
      cancelScheduledAutocompleteWarmup(pendingContextSupportWarmupRef);
      cancelScheduledAutocompleteWarmup(pendingPeopleLoadRef);
      cancelScheduledAutocompleteWarmup(pendingProjectsLoadRef);
    },
    [cancelScheduledAutocompleteWarmup],
  );

  useEffect(() => {
    if (!currentItemUid || triageService) {
      return;
    }
    const autocompleteWarmupFrameId = window.requestAnimationFrame(() => {
      void primePageTitleSearchSupport();
      void searchPagesAsync("a", 1);
      requestPeopleLoad();
      requestProjectsLoad();
    });
    return () => {
      window.cancelAnimationFrame(autocompleteWarmupFrameId);
    };
  }, [currentItemUid, requestPeopleLoad, requestProjectsLoad, triageService]);

  const projectLookup = useMemo(() => buildProjectOptionLookup(projects), [projects]);
  const projectSearchTextLookup = useMemo(() => buildProjectSearchTextLookup(projects), [projects]);

  const filteredPeople = useMemo(
    () =>
      people.filter((person) => person.title.toLowerCase().includes(delegateQuery.toLowerCase())),
    [delegateQuery, people],
  );
  const delegateOptions = useMemo(() => people.map((person) => person.title), [people]);
  const projectOptions = useMemo(() => projects.map((project) => project.title), [projects]);
  const filterProjectOptions = useCallback(
    (options: Array<string>, query: string): Array<string> =>
      filterProjectOptionsBySearchText(options, query, projectSearchTextLookup),
    [projectSearchTextLookup],
  );
  const filterContextOptions = useCallback(
    (options: Array<string>, query: string): Array<string> => {
      const filtered = filterContextSearchOptions(options, query);
      return filtered.length > 0 ? filtered : options;
    },
    [],
  );

  const readContextCache = useCallback((cacheKey: string): Array<string> | null => {
    return readCachedTriageOptions(contextSearchCacheRef.current, cacheKey);
  }, []);

  const writeContextCache = useCallback((cacheKey: string, options: Array<string>): void => {
    writeCachedTriageOptions(
      contextSearchCacheRef.current,
      cacheKey,
      options,
      CONTEXT_SEARCH_CACHE_LIMIT,
    );
  }, []);

  const getPrefixCachedContextOptions = useCallback(
    (cacheKey: string, query: string): Array<string> | null =>
      getPrefixCachedTriageOptions({
        cache: contextSearchCacheRef.current,
        cacheKey,
        limit: CONTEXT_SEARCH_MAX_RESULTS,
        query,
      }),
    [],
  );

  useEffect(() => {
    const query = contextQuery.trim();
    const previousQuery = previousContextQueryRef.current.trim();
    previousContextQueryRef.current = query;
    if (!query) {
      setContextOptions((previous) => (previous.length ? [] : previous));
      return;
    }
    const cacheKey = query.toLowerCase();
    if (triageService) {
      const cached = triageService.readContextOptions(query);
      if (cached) {
        setContextOptions(cached);
        return;
      }
      const prefixCached = triageService.readPrefixContextOptions(
        query,
        CONTEXT_SEARCH_MAX_RESULTS,
      );
      if (prefixCached !== null) {
        setContextOptions(prefixCached);
      }
      const requestId = contextSearchRequestIdRef.current + 1;
      contextSearchRequestIdRef.current = requestId;
      const runSearch = () => {
        void triageService
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
    const cached = readContextCache(cacheKey);
    if (cached) {
      setContextOptions(cached);
      return;
    }
    const prefixCached = getPrefixCachedContextOptions(cacheKey, query);
    if (prefixCached !== null) {
      setContextOptions(prefixCached);
    }
    const requestId = contextSearchRequestIdRef.current + 1;
    contextSearchRequestIdRef.current = requestId;
    const runSearch = () => {
      void loadContextPageOptions(query, CONTEXT_SEARCH_MAX_RESULTS)
        .then((nextOptions) => {
          if (!mountedRef.current || requestId !== contextSearchRequestIdRef.current) {
            return;
          }
          writeContextCache(cacheKey, nextOptions);
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
  }, [
    contextQuery,
    getPrefixCachedContextOptions,
    mountedRef,
    readContextCache,
    triageService,
    writeContextCache,
  ]);

  const handleContextInput = useCallback(
    (value: string) => {
      scheduleContextSupportWarmup();
      schedulePeopleLoadSoon([CONTEXT_AUTOCOMPLETE_ID, DELEGATE_AUTOCOMPLETE_ID], 100, 900);
      scheduleProjectsLoadSoon([CONTEXT_AUTOCOMPLETE_ID, PROJECT_AUTOCOMPLETE_ID], 120, 1450);
      const inputElement = document.getElementById(
        CONTEXT_AUTOCOMPLETE_ID,
      ) as HTMLInputElement | null;
      const normalizedValue = inputElement?.value ?? value;
      if (normalizedValue === intendedContextRef.current) {
        return;
      }
      intendedContextRef.current = normalizedValue;
      if (formStateRef.current.contextQuery !== normalizedValue) {
        formStateRef.current = { ...formStateRef.current, contextQuery: normalizedValue };
      }
      setContextQuery((previous) => (previous === normalizedValue ? previous : normalizedValue));
    },
    [scheduleContextSupportWarmup, schedulePeopleLoadSoon, scheduleProjectsLoadSoon],
  );

  useEffect(() => {
    const onContextInputEvent = (event: Event): void => {
      if (isResettingContextRef.current) {
        return;
      }
      const target = event.target as Element | null;
      if (!isHtmlInputElement(target) || target.id !== CONTEXT_AUTOCOMPLETE_ID) {
        return;
      }
      const nextValue = target.value;
      if (nextValue.length > 0) {
        return;
      }
      intendedContextRef.current = "";
      if (formStateRef.current.contextQuery !== "") {
        formStateRef.current = { ...formStateRef.current, contextQuery: "" };
      }
      contextSearchRequestIdRef.current += 1;
      setContextQuery((previous) => (previous === "" ? previous : ""));
      setContextOptions((previous) => (previous.length ? [] : previous));
    };

    document.addEventListener("input", onContextInputEvent, true);
    return () => {
      document.removeEventListener("input", onContextInputEvent, true);
    };
  }, []);

  useEffect(() => {
    const onAutocompleteDeleteKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      const target = event.target as Element | null;
      if (!isHtmlInputElement(target) || target.id !== CONTEXT_AUTOCOMPLETE_ID) {
        return;
      }
      if (!wouldDeletionEmptyInput(target, event.key as "Backspace" | "Delete")) {
        return;
      }
      event.preventDefault();
      contextSearchRequestIdRef.current += 1;
      requestAnimationFrame(() => {
        const input = document.getElementById(CONTEXT_AUTOCOMPLETE_ID) as HTMLInputElement | null;
        if (!input) {
          return;
        }
        intendedContextRef.current = "";
        formStateRef.current = { ...formStateRef.current, contextQuery: "" };
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(input, "");
        } else {
          input.value = "";
        }
        isResettingContextRef.current = true;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        isResettingContextRef.current = false;
        setContextQuery("");
        setContextOptions([]);
      });
    };
    document.addEventListener("keydown", onAutocompleteDeleteKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onAutocompleteDeleteKeyDown, true);
    };
  }, []);

  const handleDelegateInput = useCallback(
    (value: string) => {
      schedulePeopleLoadSoon();
      intendedDelegateRef.current = value;
      setDelegateQuery(value);
    },
    [schedulePeopleLoadSoon],
  );

  const handleProjectInput = useCallback(
    (value: string) => {
      scheduleProjectsLoadSoon();
      intendedProjectRef.current = value;
      setProjectQuery(value);
      const nextSelectedProject = projectLookup.get(value.trim().toLowerCase()) ?? null;
      setSelectedProject(nextSelectedProject);
      if (!currentItemUid) {
        return;
      }
      if (nextSelectedProject) {
        rememberCounterAction(currentItemUid, "project");
        return;
      }
      if (selectedProject) {
        void syncCounterActionForUidRef.current?.(currentItemUid, currentItemText);
      }
    },
    [
      currentItemText,
      currentItemUid,
      projectLookup,
      rememberCounterAction,
      scheduleProjectsLoadSoon,
      selectedProject,
      syncCounterActionForUidRef,
    ],
  );

  useEffect(() => {
    if (!showDelegatePrompt) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      delegateInputRef.current?.focus();
      delegateInputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [delegateInputRef, showDelegatePrompt]);

  const upsertLoadedPerson = useCallback(
    (person: PersonEntry): void => {
      if (triageService) {
        triageService.seed("people", [person]);
        return;
      }
      const hasPersonAlready = peopleRef.current.some(
        (entry) =>
          entry.uid === person.uid ||
          entry.title.localeCompare(person.title, undefined, { sensitivity: "accent" }) === 0,
      );
      if (!hasPersonAlready) {
        peopleLoadVersionRef.current += 1;
        peopleLoadedRef.current = false;
        peopleLoadingRef.current = false;
      }
      setPeople((current) => {
        const existingIndex = current.findIndex(
          (entry) =>
            entry.uid === person.uid ||
            entry.title.localeCompare(person.title, undefined, { sensitivity: "accent" }) === 0,
        );
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = person;
          return sortPeopleEntries(next);
        }
        return sortPeopleEntries([...current, person]);
      });
    },
    [triageService],
  );

  const setDelegatePromptOpen = useCallback((value: boolean): void => {
    setShowDelegatePrompt(value);
  }, []);

  const getFormState = useCallback((): InboxZeroFormState => {
    return { ...formStateRef.current };
  }, []);

  return {
    cacheFormState,
    contextOptions,
    contextQuery,
    delegateOptions,
    delegateQuery,
    filterContextOptions,
    filteredPeople,
    filterProjectOptions,
    formStateRef,
    getFormState,
    handleContextInput,
    handleDelegateInput,
    handleProjectInput,
    intendedContextRef,
    intendedDelegateRef,
    intendedProjectRef,
    isPeopleLoading,
    pendingDelegateUid,
    people,
    peopleRef,
    projectOptions,
    projectQuery,
    projects,
    requestPeopleLoad,
    requestProjectsLoad,
    resetFormState,
    restoreFormState,
    scheduleContextSupportWarmup,
    schedulePeopleLoadSoon,
    scheduleProjectsLoadSoon,
    selectedProject,
    setDelegatePromptOpen,
    setDelegateQuery,
    setPendingDelegateUid,
    setShowDelegatePrompt,
    showDelegatePrompt,
    showDelegatePromptRef,
    syncFormStateFromDom,
    upsertLoadedPerson,
  };
}
