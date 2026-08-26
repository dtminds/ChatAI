import { describe, expect, it, vi } from "vitest";
import type {
  ApiSuccessEnvelope,
  WorkflowDefinition,
  WorkflowPublishResult,
  WorkflowPublishReview,
  WorkflowRevision,
} from "@chatai/contracts";
import { RequestNormalizedError } from "@/lib/request";
import { createHttpWorkflowDraftRepository } from "@/pages/chat/workflow/workflow-http-repository";

describe("HTTP workflow repository", () => {
  it("loads the tenant capacity from its dedicated endpoint", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    client.get.mockResolvedValueOnce(envelope({
      capacityRejectedCountToday: 9,
      status: "warning",
      usagePercent: 87,
    }));
    const repository = createHttpWorkflowDraftRepository(client);

    await expect(repository.getCapacityOverview()).resolves.toEqual({
      capacityRejectedCountToday: 9,
      status: "warning",
      usagePercent: 87,
    });
    expect(client.get).toHaveBeenCalledWith("/server/workflows/capacity");
  });

  it("updates workflow metadata through the metadata endpoint", async () => {
    const definition = createDefinition({ description: "引导新客完成首购" });
    const client = createClient({ definition, revisions: [] });
    const repository = createHttpWorkflowDraftRepository(client);

    await repository.getDocument("42");
    await repository.updateDocumentMetadata("42", {
      description: "引导新客完成首购",
      name: "新客首购旅程",
    });

    expect(client.patch).toHaveBeenCalledWith("/server/workflows/42/metadata", {
      description: "引导新客完成首购",
      name: "新客首购旅程",
    });
  });

  it("sends the selected workflow type when creating a definition", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    const repository = createHttpWorkflowDraftRepository(client);

    await repository.createDocument({
      name: "企微客户旅程",
      workflowType: "wecom_sop",
    });

    expect(client.post).toHaveBeenCalledWith("/server/workflows", {
      name: "企微客户旅程",
      workflowType: "wecom_sop",
    });
  });

  it("does not replace the cached draft version with a stale metadata response", async () => {
    const initialDefinition = createDefinition();
    const client = createClient({ definition: initialDefinition, revisions: [] });
    let resolveMetadata!: (value: ApiSuccessEnvelope<WorkflowDefinition>) => void;
    client.patch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveMetadata = resolve;
    }));
    client.put
      .mockResolvedValueOnce(envelope(createDefinition({ draftVersion: 2 })))
      .mockResolvedValueOnce(envelope(createDefinition({ draftVersion: 3 })));
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    const metadataUpdate = repository.updateDocumentMetadata("42", {
      description: "引导新客完成首购",
      name: "新客首购旅程",
    });
    await repository.saveDraft("42", document.draft);
    resolveMetadata(envelope(createDefinition({
      description: "引导新客完成首购",
      name: "新客首购旅程",
    })));
    await metadataUpdate;
    await repository.saveDraft("42", document.draft);

    expect(client.put).toHaveBeenNthCalledWith(
      2,
      "/server/workflows/42/draft",
      expect.objectContaining({ expectedDraftVersion: 2 }),
    );
  });

  it("formats API timestamps for workflow views in Asia/Shanghai", async () => {
    const definition = createDefinition({
      publishedRevision: 1,
      updatedAt: "2026-07-11T11:21:55.000Z",
    });
    const revision = createRevision(definition, {
      publishedAt: "2026-07-11T07:12:06.000Z",
    });
    const client = createClient({ definition, revisions: [revision] });
    const repository = createHttpWorkflowDraftRepository(client);

    const document = await repository.getDocument("42");
    const { items: [listItem] } = await repository.listDocuments();

    expect(document).toMatchObject({
      publishedAt: "07-11 15:12:06",
      savedAt: "07-11 19:21:55",
      updatedAt: "07-11 19:21:55",
      versionHistory: [{ publishedAt: "07-11 15:12:06" }],
    });
    expect(listItem?.updatedAt).toBe("07-11 19:21:55");
    expect(listItem?.managedAccounts).toEqual([
      { avatarUrl: "https://example.com/avatar.png", id: 101, name: "销售一组" },
    ]);
  });

  it("does not invent a revision for an unpublished workflow", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    const repository = createHttpWorkflowDraftRepository(client);

    const document = await repository.getDocument("42");

    expect(document).toMatchObject({
      currentVersion: null,
      publishedDraft: null,
      publishedRevision: null,
      versionHistory: [],
    });
  });

  it("serializes saves using the draft version returned by the previous save", async () => {
    const client = createDeferredSaveClient(createDefinition());
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    const firstSave = repository.saveDraft("42", document.draft);
    const secondSave = repository.saveDraft("42", document.draft);

    await vi.waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
    expect(client.put).toHaveBeenNthCalledWith(
      1,
      "/server/workflows/42/draft",
      expect.objectContaining({ expectedDraftVersion: 1 }),
    );

    client.resolveSave(0, createDefinition({ draftVersion: 2 }));
    await firstSave;
    await vi.waitFor(() => expect(client.put).toHaveBeenCalledTimes(2));
    expect(client.put).toHaveBeenNthCalledWith(
      2,
      "/server/workflows/42/draft",
      expect.objectContaining({ expectedDraftVersion: 2 }),
    );

    client.resolveSave(1, createDefinition({ draftVersion: 3 }));
    await expect(secondSave).resolves.toMatchObject({ document: { draftVersion: 3 } });
  });

  it("continues the save queue after an earlier request fails", async () => {
    const client = createDeferredSaveClient(createDefinition());
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    const failedSave = repository.saveDraft("42", document.draft);
    const nextSave = repository.saveDraft("42", document.draft);
    await vi.waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));

    client.rejectSave(0, new RequestNormalizedError({ message: "network", status: 503 }));
    await expect(failedSave).rejects.toMatchObject({ code: "server" });
    await vi.waitFor(() => expect(client.put).toHaveBeenCalledTimes(2));

    client.resolveSave(1, createDefinition({ draftVersion: 2 }));
    await expect(nextSave).resolves.toMatchObject({ document: { draftVersion: 2 } });
  });

  it("normalizes draft conflicts and review validation failures", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");
    client.put.mockRejectedValueOnce(new RequestNormalizedError({
      code: "WORKFLOW_DRAFT_CONFLICT",
      message: "conflict",
      status: 409,
    }));

    await expect(repository.saveDraft("42", document.draft)).rejects.toMatchObject({
      code: "conflict",
    });

    client.post.mockRejectedValueOnce(new RequestNormalizedError({
      code: "WORKFLOW_VALIDATION_FAILED",
      message: "validation failed",
      status: 400,
    }));
    await expect(repository.submitReview("42")).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("preserves the backend business code for lifecycle conflicts", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    client.post.mockRejectedValueOnce(new RequestNormalizedError({
      code: "WORKFLOW_ACTIVE_LIMIT_EXCEEDED",
      message: "最多可同时运行 50 个 Workflow",
      status: 409,
    }));
    const repository = createHttpWorkflowDraftRepository(client);

    await expect(repository.enableDocument?.("42")).rejects.toMatchObject({
      apiCode: "WORKFLOW_ACTIVE_LIMIT_EXCEEDED",
      code: "conflict",
      message: "最多可同时运行 50 个 Workflow",
    });
  });

  it("loads a definition and revision history into one document", async () => {
    const definition = createDefinition({ publishedRevision: 1 });
    const revision = createRevision(definition);
    const client = createClient({ definition, revisions: [revision] });
    const repository = createHttpWorkflowDraftRepository(client);

    const document = await repository.getDocument("42");

    expect(document).toMatchObject({
      currentVersion: { revision: 1 },
      publishedRevision: 1,
      versionHistory: [{ revision: 1 }],
    });
    expect(client.get).toHaveBeenCalledWith("/server/workflows/42/revisions?limit=20");
  });

  it("uses explicit cursors when loading more versions and reviews", async () => {
    const definition = createDefinition();
    const client = createClient({ definition, revisions: [] });
    client.get.mockImplementation(async (url: string) => {
      if (url === "/server/workflows/42/revisions?limit=20&cursor=20") {
        return envelope({ items: [], nextCursor: null });
      }
      if (url === "/server/workflows/42/reviews?limit=20&cursor=40") {
        return envelope({ items: [], nextCursor: null });
      }
      return envelope(definition);
    });
    const repository = createHttpWorkflowDraftRepository(client);

    await repository.listVersions("42", "20");
    await repository.listReviews("42", "40");

    expect(client.get).toHaveBeenCalledWith("/server/workflows/42/revisions?limit=20&cursor=20");
    expect(client.get).toHaveBeenCalledWith("/server/workflows/42/reviews?limit=20&cursor=40");
  });

  it("restores an exact version without requiring it in the loaded history page", async () => {
    const definition = createDefinition({ publishedRevision: 100 });
    const loadedRevision = createRevision(definition, { id: "revision-100", revision: 100 });
    const exactRevision = createRevision(definition, { id: "revision-50", revision: 50 });
    const restoredDefinition = createDefinition({
      draft: exactRevision.draft,
      draftVersion: definition.draftVersion + 1,
      publishedRevision: 100,
    });
    const client = createClient({ definition, revisions: [loadedRevision] });
    client.get.mockImplementation(async (url: string) => {
      if (url === "/server/workflows/42/revisions/50") return envelope(exactRevision);
      if (url.includes("/revisions?")) {
        return envelope({ items: [loadedRevision], nextCursor: "100" });
      }
      return envelope(definition);
    });
    client.post.mockResolvedValueOnce(envelope(restoredDefinition));
    const repository = createHttpWorkflowDraftRepository(client);
    await repository.getDocument("42");
    const exactVersion = await repository.getVersion("42", 50);

    const restored = await repository.restoreVersion("42", exactVersion);

    expect(client.post).toHaveBeenCalledWith("/server/workflows/42/revisions/50/restore", {
      expectedDraftVersion: definition.draftVersion,
    });
    expect("restoredVersion" in restored ? restored.restoredVersion.revision : null).toBe(50);
  });

  it("submits review with the cached draft version and refreshes the document", async () => {
    const definition = createDefinition();
    const pendingDefinition = createDefinition({ currentReview: createReview() });
    const client = createClient({ definition, revisions: [] });
    client.post.mockImplementation(async (url: string) => {
      if (url.endsWith("/reviews")) return envelope({});
      throw new Error(`Unexpected POST ${url}`);
    });
    client.get.mockImplementation(async (url: string) => {
      if (url.includes("/revisions?")) return envelope({ items: [], nextCursor: null });
      return envelope(pendingDefinition);
    });
    const repository = createHttpWorkflowDraftRepository(client);
    await repository.getDocument("42");

    const result = await repository.submitReview("42");

    expect(client.post).toHaveBeenCalledWith("/server/workflows/42/reviews", {
      expectedDraftVersion: 1,
    });
    expect(result.currentReview?.status).toBe("pending");
  });

  it("routes review decisions to the dedicated endpoints", async () => {
    const review = createReview();
    const definition = createDefinition({ currentReview: review });
    const client = createClient({ definition, revisions: [] });
    client.post.mockImplementation(async (_url: string) => envelope<unknown>({}));
    const repository = createHttpWorkflowDraftRepository(client);

    await repository.approveReview("42", review.id, "通过");
    await repository.rejectReview("42", review.id, "请调整");
    await repository.withdrawReview("42", review.id);

    expect(client.post).toHaveBeenNthCalledWith(
      1,
      `/server/workflows/42/reviews/${review.id}/approve`,
      { comment: "通过" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      `/server/workflows/42/reviews/${review.id}/reject`,
      { reason: "请调整" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      3,
      `/server/workflows/42/reviews/${review.id}/withdraw`,
      {},
    );
  });

  it("restores a review snapshot using the cached draft version", async () => {
    const review = createReview({ status: "approved" });
    const definition = createDefinition({ currentReview: null, draftVersion: 4 });
    const restoredDefinition = createDefinition({ currentReview: review, draftVersion: 5 });
    const client = createClient({ definition, revisions: [] });
    client.post.mockImplementation(async (url: string) => {
      if (url.endsWith(`/reviews/${review.id}/restore`)) return envelope(restoredDefinition);
      throw new Error(`Unexpected POST ${url}`);
    });
    const repository = createHttpWorkflowDraftRepository(client);
    await repository.getDocument("42");

    const restored = await repository.restoreReview("42", review.id);

    expect(client.post).toHaveBeenCalledWith(
      `/server/workflows/42/reviews/${review.id}/restore`,
      { expectedDraftVersion: 4 },
    );
    expect(restored.currentReview).toMatchObject({ id: review.id, status: "approved" });
    expect(restored.draftVersion).toBe(5);
  });

  it("publishes by review id and refreshes the new revision", async () => {
    const review = createReview({ status: "approved" });
    const definition = createDefinition({ currentReview: review });
    const revision = createRevision(definition, { reviewId: review.id, revision: 1 });
    const result: WorkflowPublishResult = {
      definition: createDefinition({ publishedRevision: 1, currentReview: null }),
      revision,
    };
    const client = createClient({ definition, revisions: [] });
    client.post.mockImplementation(async (url: string) => {
      if (url.endsWith("/publish")) return envelope(result);
      throw new Error(`Unexpected POST ${url}`);
    });
    client.get.mockImplementation(async (url) => {
      if (url.includes("/revisions?")) return envelope({ items: [revision], nextCursor: null });
      return envelope(result.definition);
    });
    const repository = createHttpWorkflowDraftRepository(client);

    const published = await repository.publishReview("42", review.id);

    expect(client.post).toHaveBeenCalledWith("/server/workflows/42/publish", {
      reviewId: review.id,
    });
    expect("document" in published ? published.publishedRevision : null).toBe(1);
    expect("document" in published ? published.document.currentReview : null).toBeNull();
  });
});

function createClient({
  definition,
  revisions,
}: {
  definition: WorkflowDefinition;
  revisions: WorkflowRevision[];
}) {
  return {
    delete: vi.fn(async (_url: string): Promise<unknown> => envelope<unknown>({})),
    get: vi.fn(async (url: string): Promise<unknown> => {
      if (url.includes("/revisions?")) return envelope({ items: revisions, nextCursor: null });
      if (url === "/server/workflows" || url.startsWith("/server/workflows?")) {
        return envelope({ items: [toListDefinition(definition)], nextCursor: null });
      }
      return envelope<WorkflowDefinition>(definition);
    }),
    patch: vi.fn(async (_url: string, _body?: unknown): Promise<unknown> => envelope<WorkflowDefinition>(definition)),
    post: vi.fn(async (_url: string, _body?: unknown): Promise<unknown> => envelope<WorkflowDefinition>(definition)),
    put: vi.fn(async (_url: string, _body?: unknown): Promise<unknown> => envelope<WorkflowDefinition>(definition)),
  };
}

function toListDefinition(definition: WorkflowDefinition) {
  return {
    canOperate: definition.permissions.canOperate,
    description: definition.description,
    hasUnpublishedChanges: definition.hasUnpublishedChanges,
    id: definition.id,
    managedAccountCount: 1,
    managedAccounts: [{ avatarUrl: "https://example.com/avatar.png", id: 101, name: "销售一组" }],
    name: definition.name,
    publishedRevision: definition.publishedRevision,
    runtimeStatus: definition.runtimeStatus,
    trigger: "用户消息",
    updatedAt: definition.updatedAt,
    workflowType: definition.workflowType,
  };
}

function createDeferredSaveClient(definition: WorkflowDefinition) {
  const pendingSaves: Array<{
    reject: (error: unknown) => void;
    resolve: (value: ApiSuccessEnvelope<WorkflowDefinition>) => void;
  }> = [];
  const client = createClient({ definition, revisions: [] });
  client.put.mockImplementation(() => new Promise((resolve, reject) => {
    pendingSaves.push({ reject, resolve });
  }));
  return {
    ...client,
    rejectSave(index: number, error: unknown) {
      pendingSaves[index]?.reject(error);
    },
    resolveSave(index: number, nextDefinition: WorkflowDefinition) {
      pendingSaves[index]?.resolve(envelope(nextDefinition));
    },
  };
}

function envelope<T>(data: T): ApiSuccessEnvelope<T> {
  return { data, success: true };
}

function createDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    capabilitySummary: { runtimeSupportedNodeKinds: ["start", "wait", "end"] },
    createdAt: "2026-08-16T00:00:00.000Z",
    currentReview: null,
    description: "",
    draft: {
      edges: [{ id: "edge-start-end", source: "start", target: "end" }],
      nodes: [createNode("start"), createNode("end")],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    draftVersion: 1,
    hasUnpublishedChanges: true,
    id: "42",
    name: "新客培育",
    permissions: {
      canDelete: true,
      canEdit: true,
      canOperate: true,
      canPublish: false,
      canView: true,
    },
    publishedRevision: null,
    runtimeStatus: "inactive",
    statusReason: null,
    updatedAt: "2026-08-16T00:00:00.000Z",
    workflowType: "chatai_sop",
    ...overrides,
  };
}

function createRevision(
  definition: WorkflowDefinition,
  overrides: Partial<WorkflowRevision> = {},
): WorkflowRevision {
  return {
    draft: definition.draft,
    id: "revision-1",
    publishedAt: "2026-08-16T00:00:00.000Z",
    reviewId: "review-1",
    revision: 1,
    subjectType: "chatai_contact",
    workflowId: definition.id,
    workflowType: definition.workflowType,
    ...overrides,
  };
}

function createReview(overrides: Partial<WorkflowPublishReview> = {}): WorkflowPublishReview {
  return {
    basePublishedRevision: null,
    changeSummary: {
      addedNodes: [],
      changedNodes: [],
      firstPublication: true,
      pathChanged: false,
      removedNodes: [],
      triggerChanged: false,
    },
    checkedAt: "2026-08-16T00:00:00.000Z",
    id: "review-1",
    publishedAt: null,
    publishedBySubUserId: null,
    resultingRevision: null,
    reviewComment: null,
    reviewedAt: null,
    reviewedBySubUserId: null,
    sourceDraftVersion: 1,
    status: "pending",
    submittedAt: "2026-08-16T00:00:00.000Z",
    submittedBySubUserId: "sub-user-1",
    workflowId: "42",
    ...overrides,
  };
}

function createNode(kind: "end" | "start") {
  return {
    data: {
      kind,
      label: kind,
      metric: "",
      schemaVersion: 1,
      status: "ready" as const,
      title: kind,
    },
    id: kind,
    position: { x: 0, y: 0 },
  };
}
