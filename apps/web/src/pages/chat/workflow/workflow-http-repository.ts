import type {
  ApiSuccessEnvelope,
  WorkflowDefinition as ApiWorkflowDefinition,
  WorkflowPublishResult as ApiWorkflowPublishResult,
  WorkflowRevision as ApiWorkflowRevision,
} from "@chatai/contracts";
import { http, RequestNormalizedError } from "@/lib/request";
import { hydrateWorkflowDraft } from "./workflow-draft-normalizer";
import {
  cloneWorkflowDraft,
  createWorkflowDraftHash,
  getWorkflowConversion,
  getWorkflowTrigger,
} from "./workflow-draft-persistence";
import {
  WorkflowRepositoryError,
  type WorkflowDocument,
  type WorkflowDraftImportResult,
  type WorkflowDraftPublishResult,
  type WorkflowDraftRepository,
  type WorkflowDraftRestoreResult,
  type WorkflowDraftSaveResult,
  type WorkflowListItem,
  type WorkflowVersionHistoryItem,
} from "./workflow-repository-types";
import type { WorkflowDraft } from "./types";

type WorkflowHttpClient = {
  delete(url: string): Promise<unknown>;
  get(url: string): Promise<unknown>;
  patch(url: string, data?: unknown): Promise<unknown>;
  post(url: string, data?: unknown): Promise<unknown>;
  put(url: string, data?: unknown): Promise<unknown>;
};

export function createHttpWorkflowDraftRepository(
  client: WorkflowHttpClient = http,
): WorkflowDraftRepository {
  const definitions = new Map<string, ApiWorkflowDefinition>();
  const revisions = new Map<string, ApiWorkflowRevision[]>();
  const writeQueues = new Map<string, Promise<void>>();

  const repository: WorkflowDraftRepository = {
    async listDocuments() {
      try {
        const items = unwrap<ApiWorkflowDefinition[]>(await client.get("/server/workflows"));
        items.forEach((definition) => definitions.set(definition.id, definition));
        return items.map(toListItem);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async getDocument(workflowId) {
      try {
        const [definition, versionHistory] = await Promise.all([
          getDefinition(client, workflowId),
          getRevisions(client, workflowId),
        ]);
        definitions.set(workflowId, definition);
        revisions.set(workflowId, versionHistory);
        return toDocument(definition, versionHistory);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async createDocument(input = {}) {
      try {
        const definition = unwrap<ApiWorkflowDefinition>(await client.post("/server/workflows", input));
        definitions.set(definition.id, definition);
        revisions.set(definition.id, []);
        return toDocument(definition, []);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async deleteDocument(workflowId) {
      try {
        await client.delete(`/server/workflows/${workflowId}`);
        definitions.delete(workflowId);
        revisions.delete(workflowId);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async saveDraft(workflowId, draft) {
      return enqueueWorkflowWrite(writeQueues, workflowId, async () => {
        try {
          const current = await requireCachedDefinition(client, definitions, workflowId);
          const definition = unwrap<ApiWorkflowDefinition>(await client.put(
            `/server/workflows/${workflowId}/draft`,
            { draft, expectedDraftVersion: current.draftVersion },
          ));
          definitions.set(workflowId, definition);
          return toSaveResult(toDocument(definition, revisions.get(workflowId) ?? []));
        } catch (error) {
          throw normalizeHttpError(error);
        }
      });
    },

    async importDraft(workflowId, draft) {
      const saved = await repository.saveDraft(workflowId, draft);
      const result = "document" in saved ? saved : toSaveResult(saved);
      return { ...result, importedAt: result.savedAt } satisfies WorkflowDraftImportResult;
    },

    async publishDraft(workflowId) {
      try {
        const current = await requireCachedDefinition(client, definitions, workflowId);
        const result = unwrap<ApiWorkflowPublishResult>(await client.post(
          `/server/workflows/${workflowId}/publish`,
          { expectedDraftVersion: current.draftVersion },
        ));
        definitions.set(workflowId, result.definition);
        const nextRevisions = result.revision
          ? [result.revision, ...(revisions.get(workflowId) ?? []).filter((item) => item.revision !== result.revision!.revision)]
          : revisions.get(workflowId) ?? [];
        revisions.set(workflowId, nextRevisions);
        const document = toDocument(result.definition, nextRevisions);
        const draft = cloneWorkflowDraft(document.draft);
        const draftHash = createWorkflowDraftHash(draft);

        if (result.validatedOnly || !result.revision) {
          return {
            document,
            draft,
            draftHash,
            publishedAt: null,
            publishedRevision: null,
            revision: document.revision,
            updatedAt: document.updatedAt,
            validatedOnly: true,
            version: null,
          } satisfies WorkflowDraftPublishResult;
        }

        const version = toVersionHistoryItem(result.revision);
        return {
          document,
          draft,
          draftHash,
          publishedAt: result.revision.publishedAt,
          publishedRevision: result.revision.revision,
          revision: document.revision,
          updatedAt: document.updatedAt,
          validatedOnly: false,
          version,
        } satisfies WorkflowDraftPublishResult;
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async restoreVersion(workflowId, versionId) {
      try {
        const current = await requireCachedDefinition(client, definitions, workflowId);
        const revision = parseRevisionId(versionId);
        const definition = unwrap<ApiWorkflowDefinition>(await client.post(
          `/server/workflows/${workflowId}/revisions/${revision}/restore`,
          { expectedDraftVersion: current.draftVersion },
        ));
        definitions.set(workflowId, definition);
        const document = toDocument(definition, revisions.get(workflowId) ?? []);
        const restoredVersion = document.versionHistory.find((item) => item.revision === revision);
        if (!restoredVersion) {
          throw new WorkflowRepositoryError("not-found", "Workflow 版本不存在");
        }
        return {
          ...toSaveResult(document),
          restoredAt: document.updatedAt,
          restoredVersion,
        } satisfies WorkflowDraftRestoreResult;
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async renameDocument(workflowId, name) {
      try {
        const definition = unwrap<ApiWorkflowDefinition>(await client.patch(
          `/server/workflows/${workflowId}/name`,
          { name },
        ));
        definitions.set(workflowId, definition);
        return toDocument(definition, revisions.get(workflowId) ?? []);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    enableDocument: (workflowId) => operateDocument(client, definitions, revisions, workflowId, "enable"),
    pauseDocument: (workflowId) => operateDocument(client, definitions, revisions, workflowId, "pause"),
    resumeDocument: (workflowId) => operateDocument(client, definitions, revisions, workflowId, "resume"),
    stopDocument: (workflowId) => operateDocument(client, definitions, revisions, workflowId, "stop"),
  };

  return repository;
}

function enqueueWorkflowWrite<T>(
  queues: Map<string, Promise<void>>,
  workflowId: string,
  operation: () => Promise<T>,
) {
  const previous = queues.get(workflowId) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const settled = result.then(() => undefined, () => undefined);
  queues.set(workflowId, settled);
  void settled.finally(() => {
    if (queues.get(workflowId) === settled) queues.delete(workflowId);
  });
  return result;
}

async function operateDocument(
  client: WorkflowHttpClient,
  definitions: Map<string, ApiWorkflowDefinition>,
  revisions: Map<string, ApiWorkflowRevision[]>,
  workflowId: string,
  operation: "enable" | "pause" | "resume" | "stop",
) {
  try {
    const definition = unwrap<ApiWorkflowDefinition>(await client.post(
      `/server/workflows/${workflowId}/${operation}`,
    ));
    definitions.set(workflowId, definition);
    const nextRevisions = operation === "enable"
      ? await getRevisions(client, workflowId)
      : revisions.get(workflowId) ?? [];
    revisions.set(workflowId, nextRevisions);
    return toDocument(definition, nextRevisions);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function getDefinition(client: WorkflowHttpClient, workflowId: string) {
  return unwrap<ApiWorkflowDefinition>(await client.get(`/server/workflows/${workflowId}`));
}

async function getRevisions(client: WorkflowHttpClient, workflowId: string) {
  return unwrap<ApiWorkflowRevision[]>(await client.get(`/server/workflows/${workflowId}/revisions`));
}

async function requireCachedDefinition(
  client: WorkflowHttpClient,
  cache: Map<string, ApiWorkflowDefinition>,
  workflowId: string,
) {
  const cached = cache.get(workflowId);
  if (cached) return cached;
  const definition = await getDefinition(client, workflowId);
  cache.set(workflowId, definition);
  return definition;
}

function toDocument(
  definition: ApiWorkflowDefinition,
  revisionRecords: ApiWorkflowRevision[],
): WorkflowDocument {
  const draft = toDraft(definition.draft);
  const versionHistory = revisionRecords.map(toVersionHistoryItem);
  const currentVersion = definition.publishedRevision === null
    ? null
    : versionHistory.find((version) => version.revision === definition.publishedRevision) ?? null;
  const publishedDraft = currentVersion ? cloneWorkflowDraft(currentVersion.draft) : null;
  return {
    ...toListItem(definition),
    currentVersion,
    draft,
    draftHash: createWorkflowDraftHash(draft),
    draftVersion: definition.draftVersion,
    permissions: {
      canEdit: definition.permissions.canEdit,
      canPublish: definition.permissions.canPublish,
    },
    publishedAt: currentVersion?.publishedAt ?? null,
    publishedDraft,
    publishedRevision: definition.publishedRevision,
    revision: definition.draftVersion,
    runtimeStatus: definition.runtimeStatus,
    savedAt: definition.updatedAt,
    validatedDraftVersion: definition.validatedDraftVersion,
    versionHistory,
  };
}

function toListItem(definition: ApiWorkflowDefinition): WorkflowListItem {
  const draft = toDraft(definition.draft);
  return {
    conversion: getWorkflowConversion(draft) ?? "-",
    entered: "-",
    id: definition.id,
    name: definition.name,
    nodes: draft.nodes.length,
    owner: "当前账号",
    status: definition.runtimeStatus === "active"
      ? "Published"
      : definition.runtimeStatus === "paused"
        ? "Paused"
        : definition.runtimeStatus === "stopped"
          ? "Stopped"
          : "Draft",
    trigger: getWorkflowTrigger(draft) ?? "未配置",
    updatedAt: definition.updatedAt,
  };
}

function toVersionHistoryItem(revision: ApiWorkflowRevision): WorkflowVersionHistoryItem {
  return {
    draft: toDraft(revision.draft),
    id: `${revision.workflowId}-r${revision.revision}`,
    name: `版本 ${revision.revision}`,
    publishedAt: revision.publishedAt,
    revision: revision.revision,
  };
}

function toSaveResult(document: WorkflowDocument): WorkflowDraftSaveResult {
  return {
    document,
    draft: cloneWorkflowDraft(document.draft),
    draftHash: document.draftHash,
    revision: document.revision,
    savedAt: document.savedAt,
    updatedAt: document.updatedAt,
  };
}

function toDraft(draft: ApiWorkflowDefinition["draft"]): WorkflowDraft {
  return hydrateWorkflowDraft(draft as unknown as WorkflowDraft);
}

function parseRevisionId(versionId: string) {
  const match = /-r(\d+)$/.exec(versionId);
  if (!match) throw new WorkflowRepositoryError("validation", "Workflow 版本标识无效");
  return Number(match[1]);
}

function unwrap<T>(response: unknown): T {
  if (!response || typeof response !== "object" || !("data" in response)) {
    throw new WorkflowRepositoryError("server", "Workflow 服务返回无效数据");
  }
  return (response as ApiSuccessEnvelope<T>).data;
}

function normalizeHttpError(error: unknown) {
  if (error instanceof WorkflowRepositoryError) return error;
  if (error instanceof RequestNormalizedError) {
    const code = error.status === 401
      ? "unauthorized"
      : error.status === 403
        ? "forbidden"
        : error.status === 404
          ? "not-found"
          : error.status === 409
            ? "conflict"
            : error.status === 400 || error.status === 422
              ? "validation"
              : error.status && error.status >= 500
                ? "server"
                : "network";
    return new WorkflowRepositoryError(code, error.message, { cause: error });
  }
  return new WorkflowRepositoryError("network", error instanceof Error ? error.message : "Workflow 请求失败", {
    cause: error,
  });
}
