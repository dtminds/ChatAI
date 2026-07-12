import { describe, expect, it, vi } from "vitest";
import type {
  ApiSuccessEnvelope,
  WorkflowDefinition,
  WorkflowPublishResult,
  WorkflowRevision,
} from "@chatai/contracts";
import { RequestNormalizedError } from "@/lib/request";
import { createHttpWorkflowDraftRepository } from "@/pages/chat/workflow/workflow-http-repository";

describe("HTTP workflow draft repository", () => {
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
    const client = createClient({
      definition,
      revisions: [{
        draft: definition.draft,
        id: "revision-1",
        publishedAt: "2026-07-11T07:12:06.000Z",
        revision: 1,
        workflowId: "42",
      }],
    });
    const repository = createHttpWorkflowDraftRepository(client);

    const document = await repository.getDocument("42");
    const [listItem] = await repository.listDocuments();

    expect(document).toMatchObject({
      publishedAt: "07-11 15:12:06",
      savedAt: "07-11 19:21:55",
      updatedAt: "07-11 19:21:55",
      versionHistory: [{ publishedAt: "07-11 15:12:06" }],
    });
    expect(listItem?.updatedAt).toBe("07-11 19:21:55");
  });

  it("maps definitions and revision history without inventing an unpublished revision", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    const repository = createHttpWorkflowDraftRepository(client);

    const document = await repository.getDocument("42");

    expect(document).toMatchObject({
      currentVersion: null,
      id: "42",
      publishedDraft: null,
      publishedRevision: null,
      revision: 1,
      status: "Draft",
      versionHistory: [],
    });
  });

  it("sends the cached draft version when saving", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    await repository.saveDraft("42", document.draft);

    expect(client.put).toHaveBeenCalledWith(
      "/server/workflows/42/draft",
      expect.objectContaining({ expectedDraftVersion: 1 }),
    );
  });

  it("serializes saves so each request uses the version returned by the previous save", async () => {
    const client = createDeferredSaveClient(createDefinition());
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    const firstSave = repository.saveDraft("42", document.draft);
    const secondSave = repository.saveDraft("42", document.draft);

    await vi.waitFor(() => expect(client.put).toHaveBeenCalled());
    expect(client.put).toHaveBeenCalledTimes(1);
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

  it("represents first publish as validation only and does not synthesize revision one", async () => {
    const definition = createDefinition({ validatedDraftVersion: 1 });
    const client = createClient({
      definition,
      publishResult: { definition, revision: null, validatedOnly: true },
      revisions: [],
    });
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    const result = await repository.publishDraft("42", document.draft);

    expect(result.publishedRevision).toBeNull();
    expect("version" in result ? result.version : result.currentVersion).toBeNull();
  });

  it("normalizes backend revision conflicts", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    client.put.mockRejectedValueOnce(new RequestNormalizedError({
      code: "WORKFLOW_DRAFT_CONFLICT",
      message: "conflict",
      status: 409,
    }));
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    await expect(repository.saveDraft("42", document.draft)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("normalizes backend draft validation failures", async () => {
    const client = createClient({ definition: createDefinition(), revisions: [] });
    client.post.mockRejectedValueOnce(new RequestNormalizedError({
      code: "WORKFLOW_VALIDATION_FAILED",
      message: "validation failed",
      status: 400,
    }));
    const repository = createHttpWorkflowDraftRepository(client);
    const document = await repository.getDocument("42");

    await expect(repository.publishDraft("42", document.draft)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("enables a validated draft through the lifecycle endpoint", async () => {
    const definition = createDefinition({ validatedDraftVersion: 1 });
    const enabled = createDefinition({
      publishedRevision: 1,
      runtimeStatus: "active",
      validatedDraftVersion: 1,
    });
    const client = createClient({ definition, revisions: [] });
    client.post.mockResolvedValueOnce(envelope(enabled));
    const repository = createHttpWorkflowDraftRepository(client);

    const document = await repository.enableDocument?.("42");

    expect(client.post).toHaveBeenCalledWith("/server/workflows/42/enable");
    expect(document).toMatchObject({ publishedRevision: 1, runtimeStatus: "active" });
  });
});

function createClient({
  definition,
  publishResult,
  revisions,
}: {
  definition: WorkflowDefinition;
  publishResult?: WorkflowPublishResult;
  revisions: WorkflowRevision[];
}) {
  return {
    delete: vi.fn(async () => ({ data: { deleted: true }, success: true })),
    get: vi.fn(async (url: string) => {
      if (url.endsWith("/revisions")) return envelope(revisions);
      if (url === "/server/workflows") return envelope([definition]);
      return envelope(definition);
    }),
    patch: vi.fn(async () => envelope(definition)),
    post: vi.fn(async (url: string) => {
      if (url.endsWith("/publish")) return envelope(publishResult ?? {
        definition,
        revision: null,
        validatedOnly: true,
      });
      return envelope(definition);
    }),
    put: vi.fn(async () => envelope({ ...definition, draftVersion: definition.draftVersion + 1 })),
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
    createdAt: "2026-07-10T00:00:00.000Z",
    description: "",
    draft: {
      edges: [{ id: "edge-start-end", source: "start", target: "end" }],
      nodes: [createNode("start"), createNode("end")],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    draftVersion: 1,
    id: "42",
    name: "新客培育",
    permissions: {
      canDelete: true,
      canEdit: true,
      canOperate: true,
      canPublish: true,
      canView: true,
    },
    publishedRevision: null,
    runtimeStatus: "inactive",
    updatedAt: "2026-07-10T00:00:00.000Z",
    validatedDraftVersion: null,
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
      summary: "",
      title: kind,
    },
    id: kind,
    position: { x: 0, y: 0 },
  };
}
