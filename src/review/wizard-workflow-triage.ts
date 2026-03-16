import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import type { UnifiedReviewRowTriageRequest } from "../components/UnifiedReviewRow";
import { executeRawQuery } from "../data";
import { fetchAllPeople, sortPeopleEntries, type PersonEntry } from "../people";
import { buildDelegatedPersonRefsQuery } from "../queries";
import type { GtdSettings } from "../settings";
import { loadTriageProjects, type ProjectOption } from "../triage/support";
import type { TodoItem } from "../types";
import {
  buildDelegatedPersonRefsCacheKey,
  cacheDelegatedPersonRefs,
  getCachedDelegatedPersonRefs,
  normalizeDelegatedPersonRefs,
  type DelegatedPersonRefsSnapshot,
} from "./wizard-runtime";
import {
  getWorkflowTriagePopoverPosition,
  isWorkflowReviewStepKey,
  type WizardStepKey,
} from "./wizard-support";

const DELEGATED_PERSON_REFS_PREFETCH_DELAY_MS = 150;
const EMPTY_DELEGATED_PERSON_REFS_SNAPSHOT: DelegatedPersonRefsSnapshot = {
  childPersonRefs: new Map(),
  people: [],
};
const EMPTY_WORKFLOW_TRIAGE_POSITION = { left: 0, top: 0 };

export interface ActiveWorkflowTriageState {
  anchorElement: HTMLElement;
  currentTag: string;
  item: TodoItem;
}

interface ResolveWorkflowControllerDetailArgs {
  delegatedPeople: Array<PersonEntry>;
  personDetailUid: string | null;
  requestedWorkflowTriage: ActiveWorkflowTriageState | null;
  stepKey: WizardStepKey;
  visibleItems: Array<TodoItem>;
}

interface UseReviewWizardWorkflowTriageArgs {
  delegatedItems: Array<TodoItem>;
  dialogBodyRef: MutableRefObject<HTMLDivElement | null>;
  isOpen: boolean;
  settings: GtdSettings;
  stepKey: WizardStepKey;
  visibleItems: Array<TodoItem>;
}

export function getNextWorkflowTriageRequest(
  activeWorkflowTriageUid: string | null,
  request: UnifiedReviewRowTriageRequest,
): ActiveWorkflowTriageState | null {
  if (activeWorkflowTriageUid === request.item.uid) {
    return null;
  }

  return {
    anchorElement: request.anchorElement,
    currentTag: request.currentTag,
    item: request.item,
  };
}

export function resolveWorkflowControllerDetail({
  delegatedPeople,
  personDetailUid,
  requestedWorkflowTriage,
  stepKey,
  visibleItems,
}: ResolveWorkflowControllerDetailArgs) {
  const activePersonDetail =
    stepKey !== "waitingDelegated" || personDetailUid == null
      ? null
      : (delegatedPeople.find((person) => person.uid === personDetailUid) ?? null);
  const activeWorkflowTriage =
    !isWorkflowReviewStepKey(stepKey) ||
    requestedWorkflowTriage == null ||
    !requestedWorkflowTriage.anchorElement.isConnected
      ? null
      : visibleItems.some((item) => item.uid === requestedWorkflowTriage.item.uid)
        ? requestedWorkflowTriage
        : null;

  return {
    activePersonDetail,
    activeWorkflowTriage,
    activeWorkflowTriageUid: activeWorkflowTriage?.item.uid ?? null,
  };
}

export function useReviewWizardWorkflowTriage({
  delegatedItems,
  dialogBodyRef,
  isOpen,
  settings,
  stepKey,
  visibleItems,
}: UseReviewWizardWorkflowTriageArgs) {
  const [requestedWorkflowTriage, setRequestedWorkflowTriage] =
    useState<ActiveWorkflowTriageState | null>(null);
  const [workflowTriagePosition, setWorkflowTriagePosition] = useState(
    EMPTY_WORKFLOW_TRIAGE_POSITION,
  );
  const [delegatedPersonRefsState, setDelegatedPersonRefsState] = useState<{
    key: string;
    snapshot: DelegatedPersonRefsSnapshot;
  } | null>(null);
  const [triagePeople, setTriagePeople] = useState<Array<PersonEntry>>([]);
  const [triageProjects, setTriageProjects] = useState<Array<ProjectOption>>([]);
  const triagePeopleLoadedRef = useRef(false);
  const triageProjectsLoadedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (!triagePeopleLoadedRef.current) {
      triagePeopleLoadedRef.current = true;
      void fetchAllPeople(settings.delegateTargetTags)
        .then((entries) => {
          setTriagePeople(sortPeopleEntries(entries));
        })
        .catch(() => {
          triagePeopleLoadedRef.current = false;
        });
    }
    if (!triageProjectsLoadedRef.current) {
      triageProjectsLoadedRef.current = true;
      void (async () => {
        try {
          await loadTriageProjects({
            onUpdate: (projects) => {
              setTriageProjects(projects);
            },
          });
        } catch {
          triageProjectsLoadedRef.current = false;
        }
      })();
    }
  }, [isOpen, settings.delegateTargetTags]);

  const delegatedUidKey = useMemo(
    () =>
      stepKey === "upcoming" || stepKey === "waitingDelegated"
        ? delegatedItems.map((item) => item.uid).join("\u001f")
        : "",
    [delegatedItems, stepKey],
  );
  const delegatedPersonRefsCacheKey = useMemo(() => {
    if (!isOpen || (stepKey !== "upcoming" && stepKey !== "waitingDelegated")) {
      return null;
    }
    const blockUids = delegatedUidKey ? delegatedUidKey.split("\u001f") : [];
    if (blockUids.length === 0 || settings.delegateTargetTags.length === 0) {
      return null;
    }
    return buildDelegatedPersonRefsCacheKey(blockUids, settings.delegateTargetTags);
  }, [delegatedUidKey, isOpen, settings.delegateTargetTags, stepKey]);
  const cachedDelegatedPersonRefs = useMemo(
    () =>
      delegatedPersonRefsCacheKey == null
        ? null
        : getCachedDelegatedPersonRefs(delegatedPersonRefsCacheKey),
    [delegatedPersonRefsCacheKey],
  );
  const delegatedPersonRefsSnapshot = useMemo(() => {
    if (cachedDelegatedPersonRefs) {
      return cachedDelegatedPersonRefs;
    }
    if (
      delegatedPersonRefsCacheKey != null &&
      delegatedPersonRefsState?.key === delegatedPersonRefsCacheKey
    ) {
      return delegatedPersonRefsState.snapshot;
    }
    return EMPTY_DELEGATED_PERSON_REFS_SNAPSHOT;
  }, [cachedDelegatedPersonRefs, delegatedPersonRefsCacheKey, delegatedPersonRefsState]);

  useEffect(() => {
    if (!delegatedPersonRefsCacheKey || cachedDelegatedPersonRefs) {
      return;
    }

    const blockUids = delegatedUidKey ? delegatedUidKey.split("\u001f") : [];
    if (
      blockUids.length === 0 ||
      settings.delegateTargetTags.length === 0 ||
      delegatedPersonRefsState?.key === delegatedPersonRefsCacheKey
    ) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(
      () => {
        void executeRawQuery(
          buildDelegatedPersonRefsQuery(),
          blockUids,
          settings.delegateTargetTags,
        )
          .then((rows) => {
            if (cancelled) {
              return;
            }
            const next = normalizeDelegatedPersonRefs(rows);
            cacheDelegatedPersonRefs(delegatedPersonRefsCacheKey, next);
            setDelegatedPersonRefsState({
              key: delegatedPersonRefsCacheKey,
              snapshot: next,
            });
          })
          .catch(() => {
            if (cancelled) {
              return;
            }
          });
      },
      stepKey === "upcoming" ? DELEGATED_PERSON_REFS_PREFETCH_DELAY_MS : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    cachedDelegatedPersonRefs,
    delegatedPersonRefsCacheKey,
    delegatedPersonRefsState,
    delegatedUidKey,
    settings.delegateTargetTags,
    stepKey,
  ]);

  const { activeWorkflowTriage, activeWorkflowTriageUid } = useMemo(
    () =>
      resolveWorkflowControllerDetail({
        delegatedPeople: [],
        personDetailUid: null,
        requestedWorkflowTriage: isOpen ? requestedWorkflowTriage : null,
        stepKey,
        visibleItems,
      }),
    [isOpen, requestedWorkflowTriage, stepKey, visibleItems],
  );

  const closeWorkflowTriage = useCallback(() => {
    setRequestedWorkflowTriage(null);
  }, []);

  const getNextWorkflowTriagePosition = useCallback(
    (workflowTriage: ActiveWorkflowTriageState | null) => {
      const bodyElement = dialogBodyRef.current;
      if (!workflowTriage || !bodyElement) {
        return null;
      }

      const { anchorElement } = workflowTriage;
      if (!anchorElement.isConnected) {
        return null;
      }

      return getWorkflowTriagePopoverPosition({
        anchorRect: anchorElement.getBoundingClientRect(),
        containerRect: bodyElement.getBoundingClientRect(),
        containerWidth: bodyElement.clientWidth,
      });
    },
    [dialogBodyRef],
  );

  const openWorkflowTriage = useCallback(
    (request: UnifiedReviewRowTriageRequest) => {
      const nextWorkflowTriage = getNextWorkflowTriageRequest(activeWorkflowTriageUid, request);
      const nextPosition = getNextWorkflowTriagePosition(nextWorkflowTriage);
      if (nextPosition) {
        setWorkflowTriagePosition((currentPosition) =>
          currentPosition.left === nextPosition.left && currentPosition.top === nextPosition.top
            ? currentPosition
            : nextPosition,
        );
      }
      setRequestedWorkflowTriage(() => nextWorkflowTriage);
    },
    [activeWorkflowTriageUid, getNextWorkflowTriagePosition],
  );

  const clearWorkflowTriageForUid = useCallback((uid: string) => {
    setRequestedWorkflowTriage((current) => (current?.item.uid === uid ? null : current));
  }, []);

  useEffect(() => {
    if (!isOpen || !activeWorkflowTriage || !isWorkflowReviewStepKey(stepKey)) {
      return;
    }

    const handleReposition = () => {
      const nextPosition = getNextWorkflowTriagePosition(activeWorkflowTriage);
      if (!nextPosition) {
        closeWorkflowTriage();
        return;
      }
      setWorkflowTriagePosition((currentPosition) =>
        currentPosition.left === nextPosition.left && currentPosition.top === nextPosition.top
          ? currentPosition
          : nextPosition,
      );
    };

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [activeWorkflowTriage, closeWorkflowTriage, getNextWorkflowTriagePosition, isOpen, stepKey]);

  return {
    activeWorkflowTriage,
    activeWorkflowTriageUid,
    clearWorkflowTriageForUid,
    closeWorkflowTriage,
    delegatedChildPersonRefs: delegatedPersonRefsSnapshot.childPersonRefs,
    delegatedPeople: delegatedPersonRefsSnapshot.people,
    openWorkflowTriage,
    triagePeople,
    triageProjects,
    workflowTriagePosition,
  };
}
