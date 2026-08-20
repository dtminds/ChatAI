import type {
  ApiSuccessEnvelope,
  WorkflowDefinition as ApiWorkflowDefinition,
  WorkflowPublishReviewPage,
  WorkflowPublishResult as ApiWorkflowPublishResult,
  WorkflowRevision as ApiWorkflowRevision,
  WorkflowRevisionPage,
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

const workflowHistoryPageSize = 20;

export function createHttpWorkflowDraftRepository(
  client: WorkflowHttpClient = http,
): WorkflowDraftRepository {
  const definitions = new Map<string, ApiWorkflowDefinition>();
  const revisions = new Map<string, ApiWorkflowRevision[]>();
  const revisionCursors = new Map<string, string | null>();
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
        const [definition, versionPage] = await Promise.all([
          getDefinition(client, workflowId),
          getRevisions(client, workflowId),
        ]);
        definitions.set(workflowId, definition);
        revisions.set(workflowId, versionPage.items);
        revisionCursors.set(workflowId, versionPage.nextCursor);
        return toDocument(definition, versionPage.items, versionPage.nextCursor);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async getVersion(workflowId, revision) {
      try {
        const record = unwrap<ApiWorkflowRevision>(await client.get(
          `/server/workflows/${workflowId}/revisions/${revision}`,
        ));
        return toVersionHistoryItem(record);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async createDocument(input) {
      try {
        const definition = unwrap<ApiWorkflowDefinition>(await client.post("/server/workflows", input));
        definitions.set(definition.id, definition);
        revisions.set(definition.id, []);
        revisionCursors.set(definition.id, null);
        return toDocument(definition, [], null);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async deleteDocument(workflowId) {
      try {
        await client.delete(`/server/workflows/${workflowId}`);
        definitions.delete(workflowId);
        revisions.delete(workflowId);
        revisionCursors.delete(workflowId);
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
          return toSaveResult(toDocument(
            definition,
            revisions.get(workflowId) ?? [],
            revisionCursors.get(workflowId) ?? null,
          ));
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

    async submitReview(workflowId) {
      return enqueueWorkflowWrite(writeQueues, workflowId, async () => {
        try {
          const current = await requireCachedDefinition(client, definitions, workflowId);
          await client.post(
            `/server/workflows/${workflowId}/reviews`,
            { expectedDraftVersion: current.draftVersion },
          );
          return await refreshDocument(client, definitions, revisions, revisionCursors, workflowId);
        } catch (error) {
          throw normalizeHttpError(error);
        }
      });
    },

    async listReviews(workflowId, cursor) {
      try {
        return await getReviews(client, workflowId, cursor);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async listVersions(workflowId, cursor) {
      try {
        const page = await getRevisions(client, workflowId, cursor);
        const current = revisions.get(workflowId) ?? [];
        const knownRevisions = new Set(current.map(item => item.revision));
        const merged = [...current, ...page.items.filter(item => !knownRevisions.has(item.revision))];
        revisions.set(workflowId, merged);
        revisionCursors.set(workflowId, page.nextCursor);
        return {
          items: page.items.map(toVersionHistoryItem),
          nextCursor: page.nextCursor,
        };
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    approveReview: (workflowId, reviewId, comment) => mutateReview(
      client,
      definitions,
      revisions,
      revisionCursors,
      workflowId,
      reviewId,
      "approve",
      comment ? { comment } : {},
    ),
    rejectReview: (workflowId, reviewId, reason) => mutateReview(
      client,
      definitions,
      revisions,
      revisionCursors,
      workflowId,
      reviewId,
      "reject",
      { reason },
    ),
    withdrawReview: (workflowId, reviewId) => mutateReview(
      client,
      definitions,
      revisions,
      revisionCursors,
      workflowId,
      reviewId,
      "withdraw",
    ),
    async publishReview(workflowId, reviewId) {
      return enqueueWorkflowWrite(writeQueues, workflowId, async () => {
        try {
          const result = unwrap<ApiWorkflowPublishResult>(await client.post(
            `/server/workflows/${workflowId}/publish`,
            { reviewId },
          ));
          definitions.set(workflowId, result.definition);
          const nextPage = await getRevisions(client, workflowId);
          revisions.set(workflowId, nextPage.items);
          revisionCursors.set(workflowId, nextPage.nextCursor);
          const document = toDocument(result.definition, nextPage.items, nextPage.nextCursor);
          const version = toVersionHistoryItem(result.revision);
          return {
            document,
            draft: cloneWorkflowDraft(result.revision.draft as WorkflowDraft),
            draftHash: createWorkflowDraftHash(result.revision.draft as WorkflowDraft),
            publishedAt: result.revision.publishedAt,
            publishedRevision: result.revision.revision,
            revision: document.revision,
            updatedAt: document.updatedAt,
            version,
          } satisfies WorkflowDraftPublishResult;
        } catch (error) {
          throw normalizeHttpError(error);
        }
      });
    },

    async restoreVersion(workflowId, restoredVersion) {
      try {
        const current = await requireCachedDefinition(client, definitions, workflowId);
        const revision = restoredVersion.revision;
        const definition = unwrap<ApiWorkflowDefinition>(await client.post(
          `/server/workflows/${workflowId}/revisions/${revision}/restore`,
          { expectedDraftVersion: current.draftVersion },
        ));
        definitions.set(workflowId, definition);
        const document = toDocument(
          definition,
          revisions.get(workflowId) ?? [],
          revisionCursors.get(workflowId) ?? null,
        );
        return {
          ...toSaveResult(document),
          restoredAt: document.updatedAt,
          restoredVersion,
        } satisfies WorkflowDraftRestoreResult;
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    async restoreReview(workflowId, reviewId) {
      return enqueueWorkflowWrite(writeQueues, workflowId, async () => {
        try {
          const current = await requireCachedDefinition(client, definitions, workflowId);
          const definition = unwrap<ApiWorkflowDefinition>(await client.post(
            `/server/workflows/${workflowId}/reviews/${reviewId}/restore`,
            { expectedDraftVersion: current.draftVersion },
          ));
          definitions.set(workflowId, definition);
          return toDocument(
            definition,
            revisions.get(workflowId) ?? [],
            revisionCursors.get(workflowId) ?? null,
          );
        } catch (error) {
          throw normalizeHttpError(error);
        }
      });
    },

    async updateDocumentMetadata(workflowId, metadata) {
      try {
        const definition = unwrap<ApiWorkflowDefinition>(await client.patch(
          `/server/workflows/${workflowId}/metadata`,
          metadata,
        ));
        const current = definitions.get(workflowId);
        const updatedDefinition = current
          ? {
              ...current,
              description: definition.description,
              name: definition.name,
              updatedAt: definition.updatedAt > current.updatedAt
                ? definition.updatedAt
                : current.updatedAt,
            }
          : definition;
        definitions.set(workflowId, updatedDefinition);
        return toDocument(
          updatedDefinition,
          revisions.get(workflowId) ?? [],
          revisionCursors.get(workflowId) ?? null,
        );
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },

    enableDocument: (workflowId) => operateDocument(client, definitions, revisions, revisionCursors, workflowId, "enable"),
    pauseDocument: (workflowId) => operateDocument(client, definitions, revisions, revisionCursors, workflowId, "pause"),
    resumeDocument: (workflowId) => operateDocument(client, definitions, revisions, revisionCursors, workflowId, "resume"),
    stopDocument: (workflowId) => operateDocument(client, definitions, revisions, revisionCursors, workflowId, "stop"),
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
  revisionCursors: Map<string, string | null>,
  workflowId: string,
  operation: "enable" | "pause" | "resume" | "stop",
) {
  try {
    const definition = unwrap<ApiWorkflowDefinition>(await client.post(
      `/server/workflows/${workflowId}/${operation}`,
    ));
    definitions.set(workflowId, definition);
    const nextPage = operation === "enable"
      ? await getRevisions(client, workflowId)
      : {
          items: revisions.get(workflowId) ?? [],
          nextCursor: revisionCursors.get(workflowId) ?? null,
        };
    revisions.set(workflowId, nextPage.items);
    revisionCursors.set(workflowId, nextPage.nextCursor);
    return toDocument(definition, nextPage.items, nextPage.nextCursor);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function getDefinition(client: WorkflowHttpClient, workflowId: string) {
  return unwrap<ApiWorkflowDefinition>(await client.get(`/server/workflows/${workflowId}`));
}

async function refreshDocument(
  client: WorkflowHttpClient,
  definitions: Map<string, ApiWorkflowDefinition>,
  revisions: Map<string, ApiWorkflowRevision[]>,
  revisionCursors: Map<string, string | null>,
  workflowId: string,
) {
  const [definition, versionPage] = await Promise.all([
    getDefinition(client, workflowId),
    getRevisions(client, workflowId),
  ]);
  definitions.set(workflowId, definition);
  revisions.set(workflowId, versionPage.items);
  revisionCursors.set(workflowId, versionPage.nextCursor);
  return toDocument(definition, versionPage.items, versionPage.nextCursor);
}

async function mutateReview(
  client: WorkflowHttpClient,
  definitions: Map<string, ApiWorkflowDefinition>,
  revisions: Map<string, ApiWorkflowRevision[]>,
  revisionCursors: Map<string, string | null>,
  workflowId: string,
  reviewId: string,
  action: "approve" | "reject" | "withdraw",
  body: Record<string, unknown> = {},
) {
  try {
    await client.post(`/server/workflows/${workflowId}/reviews/${reviewId}/${action}`, body);
    return await refreshDocument(client, definitions, revisions, revisionCursors, workflowId);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function getRevisions(client: WorkflowHttpClient, workflowId: string, cursor?: string) {
  return unwrap<WorkflowRevisionPage>(await client.get(
    createHistoryPageUrl(`/server/workflows/${workflowId}/revisions`, cursor),
  ));
}

async function getReviews(client: WorkflowHttpClient, workflowId: string, cursor?: string) {
  return unwrap<WorkflowPublishReviewPage>(await client.get(
    createHistoryPageUrl(`/server/workflows/${workflowId}/reviews`, cursor),
  ));
}

function createHistoryPageUrl(path: string, cursor?: string) {
  const query = new URLSearchParams({ limit: String(workflowHistoryPageSize) });
  if (cursor) query.set("cursor", cursor);
  return `${path}?${query.toString()}`;
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
  versionHistoryNextCursor: string | null,
): WorkflowDocument {
  const listItem = toListItem(definition);
  const draft = toDraft(definition.draft);
  const versionHistory = revisionRecords.map(toVersionHistoryItem);
  const currentVersion = definition.publishedRevision === null
    ? null
    : versionHistory.find((version) => version.revision === definition.publishedRevision) ?? null;
  const publishedDraft = currentVersion ? cloneWorkflowDraft(currentVersion.draft) : null;
  return {
    ...listItem,
    currentVersion,
    draft,
    draftHash: createWorkflowDraftHash(draft),
    draftVersion: definition.draftVersion,
    permissions: {
      canEdit: definition.permissions.canEdit,
      canOperate: definition.permissions.canOperate,
      canPublish: definition.permissions.canPublish,
    },
    publishedAt: currentVersion?.publishedAt ?? null,
    publishedDraft,
    publishedRevision: definition.publishedRevision,
    revision: definition.draftVersion,
    runtimeStatus: definition.runtimeStatus,
    savedAt: listItem.updatedAt,
    currentReview: definition.currentReview,
    hasUnpublishedChanges: definition.hasUnpublishedChanges,
    versionHistory,
    versionHistoryNextCursor,
  };
}

function toListItem(definition: ApiWorkflowDefinition): WorkflowListItem {
  const draft = toDraft(definition.draft);
  return {
    canOperate: definition.permissions.canOperate,
    capabilitySummary: definition.capabilitySummary,
    conversion: getWorkflowConversion(draft) ?? "-",
    description: definition.description,
    entered: "-",
    id: definition.id,
    name: definition.name,
    nodes: draft.nodes.length,
    owner: "当前账号",
    publishedRevision: definition.publishedRevision,
    runtimeStatus: definition.runtimeStatus,
    status: definition.runtimeStatus === "active"
      ? "Published"
      : definition.runtimeStatus === "paused"
        ? "Paused"
        : definition.runtimeStatus === "stopped"
          ? "Stopped"
          : definition.publishedRevision !== null ? "Published" : "Draft",
    trigger: getWorkflowTrigger(draft) ?? "未配置",
    updatedAt: formatWorkflowDisplayTime(definition.updatedAt),
    workflowType: definition.workflowType,
    currentReview: definition.currentReview,
    hasUnpublishedChanges: definition.hasUnpublishedChanges,
  };
}

function toVersionHistoryItem(revision: ApiWorkflowRevision): WorkflowVersionHistoryItem {
  return {
    draft: toDraft(revision.draft),
    id: `${revision.workflowId}-r${revision.revision}`,
    name: `版本 ${revision.revision}`,
    publishedAt: formatWorkflowDisplayTime(revision.publishedAt),
    revision: revision.revision,
  };
}

function formatWorkflowDisplayTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
  }).formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${lookup("month")}-${lookup("day")} ${lookup("hour")}:${lookup("minute")}:${lookup("second")}`;
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
    return new WorkflowRepositoryError(code, error.message, {
      apiCode: error.code,
      cause: error,
    });
  }
  return new WorkflowRepositoryError("network", error instanceof Error ? error.message : "Workflow 请求失败", {
    cause: error,
  });
}
