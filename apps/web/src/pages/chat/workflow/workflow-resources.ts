import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowCapacityOverview, WorkflowTenantOverview } from "@chatai/contracts";
import {
  getWorkflowDraftRepository,
  normalizeWorkflowRepositoryError,
  WorkflowRepositoryError,
} from "./workflow-draft-service";
import type {
  WorkflowDocument,
  WorkflowDraftRepository,
  WorkflowListInput,
  WorkflowListPage,
} from "./workflow-draft-service";

export type WorkflowResourceStatus = "error" | "loading" | "not-found" | "ready";

type WorkflowResourceState<TData> = {
  data: TData | null;
  error: WorkflowRepositoryError | null;
  status: WorkflowResourceStatus;
};

export function useWorkflowDocumentResource(
  workflowId: string | undefined,
  repository: WorkflowDraftRepository = getWorkflowDraftRepository(),
) {
  const loadRequestRef = useRef(0);
  const [state, setState] = useState<WorkflowResourceState<WorkflowDocument>>({
    data: null,
    error: null,
    status: workflowId ? "loading" : "not-found",
  });

  const reload = useCallback(async () => {
    if (!workflowId) {
      setState({ data: null, error: null, status: "not-found" });
      return;
    }

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setState({ data: null, error: null, status: "loading" });

    try {
      const document = await Promise.resolve(repository.getDocument(workflowId));

      if (loadRequestRef.current === requestId) {
        setState({ data: document, error: null, status: "ready" });
      }
    }
    catch (error) {
      if (loadRequestRef.current !== requestId) {
        return;
      }

      const repositoryError = normalizeWorkflowRepositoryError(error);
      setState({
        data: null,
        error: repositoryError,
        status: repositoryError.code === "not-found" ? "not-found" : "error",
      });
    }
  }, [repository, workflowId]);

  useEffect(() => {
    void reload();

    return () => {
      loadRequestRef.current += 1;
    };
  }, [reload]);

  return {
    document: state.data,
    error: state.error,
    reload,
    status: state.status,
  };
}

export function useWorkflowListResource(
  repository: WorkflowDraftRepository = getWorkflowDraftRepository(),
  input: WorkflowListInput = {},
) {
  const loadRequestRef = useRef(0);
  const inputKey = JSON.stringify([
    input.cursor ?? null,
    input.limit ?? null,
    input.query ?? null,
    input.status ?? null,
  ]);
  const [state, setState] = useState<WorkflowResourceState<WorkflowListPage> & {
    inputKey: string;
    repository: WorkflowDraftRepository;
  }>({
    data: null,
    error: null,
    inputKey,
    repository,
    status: "loading",
  });
  const stateMatchesInput = state.inputKey === inputKey && state.repository === repository;

  const reload = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setState((currentState) => ({
      data: currentState.inputKey === inputKey && currentState.repository === repository
        ? currentState.data
        : null,
      error: null,
      inputKey,
      repository,
      status: "loading",
    }));

    try {
      const documents = await Promise.resolve(repository.listDocuments(input));

      if (loadRequestRef.current === requestId) {
        setState({ data: documents, error: null, inputKey, repository, status: "ready" });
      }
    }
    catch (error) {
      if (loadRequestRef.current === requestId) {
        setState({
          data: null,
          error: normalizeWorkflowRepositoryError(error),
          inputKey,
          repository,
          status: "error",
        });
      }
    }
  }, [input.cursor, input.limit, input.query, input.status, inputKey, repository]);

  useEffect(() => {
    void reload();

    return () => {
      loadRequestRef.current += 1;
    };
  }, [reload]);

  return {
    error: stateMatchesInput ? state.error : null,
    items: stateMatchesInput ? state.data?.items ?? [] : [],
    nextCursor: stateMatchesInput ? state.data?.nextCursor ?? null : null,
    reload,
    status: stateMatchesInput ? state.status : "loading",
    total: stateMatchesInput ? state.data?.total ?? 0 : 0,
  };
}

export function useWorkflowCapacityResource(
  repository: WorkflowDraftRepository = getWorkflowDraftRepository(),
) {
  const loadRequestRef = useRef(0);
  const [state, setState] = useState<WorkflowResourceState<WorkflowCapacityOverview>>({
    data: null,
    error: null,
    status: "loading",
  });

  const reload = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setState(current => ({ ...current, error: null, status: "loading" }));
    try {
      const data = await Promise.resolve(repository.getCapacityOverview());
      if (loadRequestRef.current === requestId) {
        setState({ data, error: null, status: "ready" });
      }
    } catch (error) {
      if (loadRequestRef.current === requestId) {
        setState({
          data: null,
          error: normalizeWorkflowRepositoryError(error),
          status: "error",
        });
      }
    }
  }, [repository]);

  useEffect(() => {
    void reload();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [reload]);

  return {
    overview: state.data,
    reload,
    status: state.status,
  };
}

export function useWorkflowTenantOverviewResource(
  repository: WorkflowDraftRepository = getWorkflowDraftRepository(),
) {
  const loadRequestRef = useRef(0);
  const [state, setState] = useState<WorkflowResourceState<WorkflowTenantOverview>>({
    data: null,
    error: null,
    status: "loading",
  });

  const reload = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setState(current => ({ ...current, error: null, status: "loading" }));
    try {
      if (!repository.getTenantOverview) {
        throw new WorkflowRepositoryError("server", "Workflow 概览不可用");
      }
      const data = await Promise.resolve(repository.getTenantOverview());
      if (loadRequestRef.current === requestId) {
        setState({ data, error: null, status: "ready" });
      }
    } catch (error) {
      if (loadRequestRef.current === requestId) {
        setState({
          data: null,
          error: normalizeWorkflowRepositoryError(error),
          status: "error",
        });
      }
    }
  }, [repository]);

  useEffect(() => {
    void reload();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [reload]);

  return {
    overview: state.data,
    reload,
    status: state.status,
  };
}

export { normalizeWorkflowRepositoryError };
