import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowCapacityOverview } from "@chatai/contracts";
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
  const [state, setState] = useState<WorkflowResourceState<WorkflowListPage>>({
    data: null,
    error: null,
    status: "loading",
  });

  const reload = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setState((currentState) => ({
      data: currentState.data,
      error: null,
      status: "loading",
    }));

    try {
      const documents = await Promise.resolve(repository.listDocuments(input));

      if (loadRequestRef.current === requestId) {
        setState({ data: documents, error: null, status: "ready" });
      }
    }
    catch (error) {
      if (loadRequestRef.current === requestId) {
        setState({
          data: null,
          error: normalizeWorkflowRepositoryError(error),
          status: "error",
        });
      }
    }
  }, [input.cursor, input.limit, input.query, input.status, repository]);

  useEffect(() => {
    void reload();

    return () => {
      loadRequestRef.current += 1;
    };
  }, [reload]);

  return {
    error: state.error,
    items: state.data?.items ?? [],
    nextCursor: state.data?.nextCursor ?? null,
    reload,
    status: state.status,
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

export { normalizeWorkflowRepositoryError };
