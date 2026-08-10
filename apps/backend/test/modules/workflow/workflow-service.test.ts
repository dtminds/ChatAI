import { describe, expect, it, vi } from "vitest";
import { createWorkflowDeploymentCapabilities } from "@chatai/workflow-engine";
import {
  InMemoryWorkflowRepository,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";

const operator = { roles: ["owner"], subUserId: "17", uid: 9 };

describe("WorkflowService", () => {
  it("creates a workflow with trimmed metadata", async () => {
    const service = createService();

    const created = await service.create(operator, {
      description: "  添加客户后发送欢迎消息  ",
      name: "  新客欢迎旅程  ",
      workflowType: "chatai_sop",
    });

    expect(created).toMatchObject({
      description: "添加客户后发送欢迎消息",
      name: "新客欢迎旅程",
    });
  });

  it("updates trimmed workflow metadata without changing the draft", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    const updated = await service.updateMetadata(operator, created.id, {
      description: "  引导新客完成首购  ",
      name: "  新客首购旅程  ",
    });

    expect(updated).toMatchObject({
      description: "引导新客完成首购",
      name: "新客首购旅程",
    });
    expect(updated.draft).toEqual(created.draft);
  });

  it("allows only owners and admins to access workflows", async () => {
    const service = createService();

    await expect(service.list({ roles: ["operator"], subUserId: "18", uid: 9 }))
      .rejects.toMatchObject({ code: "WORKFLOW_FORBIDDEN", statusCode: 403 });
    await expect(service.create(
      { roles: ["admin"], subUserId: "19", uid: 9 },
      { workflowType: "chatai_sop" },
    ))
      .resolves.toMatchObject({ runtimeStatus: "inactive" });
  });

  it("rejects the reserved Member SOP type before checking entitlement", async () => {
    const repository = new InMemoryWorkflowRepository();
    const entitlementCheck = vi.fn(async () => ({ entitled: true as const, unentitledSince: null }));
    const service = createService(repository, {
      entitlementPort: { check: entitlementCheck },
    });

    await expect(service.create(operator, { workflowType: "member_sop" }))
      .rejects.toMatchObject({ code: "WORKFLOW_TYPE_UNAVAILABLE", statusCode: 400 });
    expect(entitlementCheck).not.toHaveBeenCalled();
    await expect(repository.listDefinitions(operator.uid)).resolves.toEqual([]);
  });

  it("rejects node kinds outside the selected Workflow type policy", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "wecom_sop" });
    const startConfigured = withStartConfig(created.draft, {
      accountIds: ["account-a"],
      entryPolicy: { mode: "never" },
      triggers: [{ type: "contact.friend_added" }],
    });
    const draft = {
      ...startConfigured,
      edges: [
        { id: "start-message", source: "start", target: "message" },
        { id: "message-end", source: "message", target: "end" },
      ],
      nodes: [
        ...startConfigured.nodes.filter(node => node.id !== "end"),
        {
          data: {
            kind: "message" as const,
            label: "消息发送",
            metric: "",
            schemaVersion: 1,
            status: "ready" as const,
            title: "消息发送",
          },
          id: "message",
          position: { x: 340, y: 240 },
        },
        ...startConfigured.nodes.filter(node => node.id === "end"),
      ],
    };

    await expect(service.saveDraft(operator, created.id, {
      draft,
      expectedDraftVersion: created.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_TYPE_POLICY_VIOLATION", statusCode: 400 });
  });

  it.each([
    {
      expectedStatus: "paused",
      unentitledSince: "2026-08-09T00:00:00.000Z",
    },
    {
      expectedStatus: "stopped",
      unentitledSince: "2026-08-03T00:00:00.000Z",
    },
  ] as const)("moves entitled workflows to $expectedStatus when entitlement is lost", async ({
    expectedStatus,
    unentitledSince,
  }) => {
    const repository = new InMemoryWorkflowRepository();
    const allowed = createService(repository);
    const created = await createConfigured(allowed);
    await allowed.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await allowed.enable(operator, created.id);
    const denied = createService(repository, {
      clock: () => new Date("2026-08-10T00:00:00.000Z"),
      entitlementPort: {
        check: async () => ({ entitled: false, unentitledSince }),
      },
    });

    await expect(denied.publish(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_ENTITLEMENT_REQUIRED", statusCode: 403 });
    await expect(denied.get(operator, created.id)).resolves.toMatchObject({
      runtimeStatus: expectedStatus,
      statusReason: "entitlement_revoked",
    });
  });

  it("does not change Workflow status when the entitlement API is unavailable", async () => {
    const repository = new InMemoryWorkflowRepository();
    const allowed = createService(repository);
    const created = await createConfigured(allowed);
    await allowed.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await allowed.enable(operator, created.id);
    const unavailable = createService(repository, {
      entitlementPort: {
        check: async () => { throw new Error("Java unavailable"); },
      },
    });

    await expect(unavailable.publish(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_ENTITLEMENT_UNAVAILABLE", statusCode: 503 });
    await expect(unavailable.get(operator, created.id)).resolves.toMatchObject({
      runtimeStatus: "active",
      statusReason: null,
    });
  });

  it("validates before first enable and creates revision 1 on enable", async () => {
    const service = createService();
    const created = await createConfigured(service, { name: "新客培育" });

    const validated = await service.publish(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });

    expect(validated.validatedOnly).toBe(true);
    expect(validated.revision).toBeNull();
    expect(validated.definition.validatedDraftVersion).toBe(created.draftVersion);

    const enabled = await service.enable(operator, created.id);

    expect(enabled.runtimeStatus).toBe("active");
    expect(enabled.publishedRevision).toBe(1);
    expect(await service.listRevisions(operator, created.id)).toHaveLength(1);
  });

  it("publishes legacy rolling entry windows using the current maximum", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const legacyDraft = withStartConfig(created.draft, {
      accountIds: ["account-a"],
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 365,
        windowUnit: "day",
      },
      triggers: [{ type: "contact.friend_added" }],
    });

    const seeded = await repository.saveDraft({
      draft: legacyDraft,
      expectedDraftVersion: created.draftVersion,
      opSubUserId: operator.subUserId,
      uid: operator.uid,
      workflowId: created.id,
    });
    if (seeded.kind !== "success") throw new Error("legacy draft seed failed");
    const validated = await service.publish(operator, created.id, {
      expectedDraftVersion: seeded.value.draftVersion,
    });
    const enabled = await service.enable(operator, created.id);
    const [revision] = await service.listRevisions(operator, created.id);

    expect(getStartEntryPolicy(validated.definition.draft)).toMatchObject({ windowSize: 90, windowUnit: "day" });
    expect(getStartEntryPolicy(enabled.draft)).toMatchObject({ windowSize: 90, windowUnit: "day" });
    expect(getStartEntryPolicy(revision!.draft)).toMatchObject({ windowSize: 90, windowUnit: "day" });
  });

  it("publishes immutable revisions after first enable without changing pause state", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await service.enable(operator, created.id);
    const saved = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        accountIds: ["account-b"],
        entryPolicy: { mode: "never" },
        triggers: [{ type: "contact.friend_added" }],
      }),
      expectedDraftVersion: created.draftVersion,
    });
    await service.pause(operator, created.id);

    const published = await service.publish(operator, created.id, {
      expectedDraftVersion: saved.draftVersion,
    });

    expect(published.validatedOnly).toBe(false);
    expect(published.revision?.revision).toBe(2);
    expect(published.definition.runtimeStatus).toBe("paused");
  });

  it("reuses the published revision for position-only draft changes", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    const enabled = await service.enable(operator, created.id);
    const movedDraft = {
      ...enabled.draft,
      nodes: enabled.draft.nodes.map(node => node.id === "start"
        ? { ...node, position: { x: node.position.x + 120, y: node.position.y + 80 } }
        : node),
    };
    const saved = await service.saveDraft(operator, created.id, {
      draft: movedDraft,
      expectedDraftVersion: enabled.draftVersion,
    });

    const published = await service.publish(operator, created.id, {
      expectedDraftVersion: saved.draftVersion,
    });

    expect(published.revision?.revision).toBe(1);
    expect(published.definition.publishedRevision).toBe(1);
    expect(await service.listRevisions(operator, created.id)).toHaveLength(1);
  });

  it("reuses the published revision for viewport-only draft changes", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    const enabled = await service.enable(operator, created.id);
    const saved = await service.saveDraft(operator, created.id, {
      draft: { ...enabled.draft, viewport: { x: 320, y: 180, zoom: 0.72 } },
      expectedDraftVersion: enabled.draftVersion,
    });

    const published = await service.publish(operator, created.id, {
      expectedDraftVersion: saved.draftVersion,
    });

    expect(published.revision?.revision).toBe(1);
    expect(published.definition.publishedRevision).toBe(1);
    expect(await service.listRevisions(operator, created.id)).toHaveLength(1);
  });

  it("creates a new revision when wait configuration changes", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const configured = await service.saveDraft(operator, created.id, {
      draft: withWaitNode(withStartConfig(created.draft, {
        accountIds: ["account-a"],
        entryPolicy: { mode: "never" },
        triggers: [{ type: "contact.friend_added" }],
      }), { duration: 2, mode: "duration", unit: "day" }),
      expectedDraftVersion: created.draftVersion,
    });
    await service.publish(operator, created.id, { expectedDraftVersion: configured.draftVersion });
    const enabled = await service.enable(operator, created.id);
    const saved = await service.saveDraft(operator, created.id, {
      draft: withWaitConfig(enabled.draft, { duration: 3, mode: "duration", unit: "day" }),
      expectedDraftVersion: enabled.draftVersion,
    });

    const published = await service.publish(operator, created.id, {
      expectedDraftVersion: saved.draftVersion,
    });

    expect(published.revision?.revision).toBe(2);
    expect(published.definition.publishedRevision).toBe(2);
    expect(await service.listRevisions(operator, created.id)).toHaveLength(2);
  });

  it("publishes only the current revision trigger bindings after enable", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await createConfigured(service);

    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.friend_added",
    ))
      .resolves.toEqual([]);

    await service.enable(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.friend_added",
    ))
      .resolves.toMatchObject([{ revision: 1, workflowId: created.id }]);

    const changed = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        accountIds: ["account-b"],
        entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
        triggers: [{ tagIds: ["tag-vip"], type: "contact.tag_added" }],
      }),
      expectedDraftVersion: created.draftVersion,
    });
    await service.publish(operator, created.id, { expectedDraftVersion: changed.draftVersion });

    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.friend_added",
    ))
      .resolves.toEqual([]);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.tag_added",
    ))
      .resolves.toMatchObject([{
        filter: { accountIds: ["account-b"] },
        revision: 2,
        workflowId: created.id,
      }]);
  });

  it("retains trigger bindings across pause and hides them after stop or deletion", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await service.enable(operator, created.id);

    await service.pause(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.friend_added",
    ))
      .resolves.toEqual([]);
    await service.resume(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.friend_added",
    ))
      .resolves.toHaveLength(1);

    await service.stop(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.friend_added",
    ))
      .resolves.toEqual([]);
    await service.delete(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "chatai_contact",
      "contact.friend_added",
    ))
      .resolves.toEqual([]);
  });

  it("uses draft versions as optimistic locks", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    await service.saveDraft(operator, created.id, {
      draft: created.draft,
      expectedDraftVersion: 1,
    });

    await expect(service.saveDraft(operator, created.id, {
      draft: created.draft,
      expectedDraftVersion: 1,
    })).rejects.toMatchObject({ code: "WORKFLOW_DRAFT_CONFLICT", statusCode: 409 });
  });

  it("allows resume from paused but never from stopped", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await service.enable(operator, created.id);
    await service.pause(operator, created.id);

    await expect(service.resume(operator, created.id)).resolves.toMatchObject({ runtimeStatus: "active" });
    await service.stop(operator, created.id);
    await expect(service.resume(operator, created.id)).rejects.toMatchObject({ code: "WORKFLOW_STOPPED" });
    await expect(service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion }))
      .rejects.toMatchObject({ code: "WORKFLOW_STOPPED" });
  });

  it("logically deletes definitions and hides them from reads", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    await service.delete(operator, created.id);

    await expect(service.get(operator, created.id)).rejects.toMatchObject({
      code: "WORKFLOW_NOT_FOUND",
      statusCode: 404,
    });
    expect(await service.list(operator)).toEqual([]);
  });

  it("allows a deleted create request id to create a new definition", async () => {
    const service = createService();
    const first = await service.create(operator, {
      clientRequestId: "request-1",
      workflowType: "chatai_sop",
    });

    await service.delete(operator, first.id);
    const recreated = await service.create(operator, {
      clientRequestId: "request-1",
      workflowType: "chatai_sop",
    });

    expect(recreated.id).not.toBe(first.id);
  });

  it("rejects an idempotent create request reused for another Workflow type", async () => {
    const service = createService();
    await service.create(operator, {
      clientRequestId: "request-1",
      workflowType: "chatai_sop",
    });

    await expect(service.create(operator, {
      clientRequestId: "request-1",
      workflowType: "wecom_sop",
    })).rejects.toMatchObject({
      code: "WORKFLOW_CREATE_REQUEST_CONFLICT",
      statusCode: 409,
    });
  });

  it("restores an immutable revision into a new draft version", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await service.enable(operator, created.id);

    const restored = await service.restoreRevision(operator, created.id, 1, {
      expectedDraftVersion: created.draftVersion,
    });

    expect(restored.draftVersion).toBe(created.draftVersion + 1);
    expect(restored.validatedDraftVersion).toBeNull();
    expect(await service.listRevisions(operator, created.id)).toHaveLength(1);
  });
});

function createService(
  repository = new InMemoryWorkflowRepository(),
  options: ConstructorParameters<typeof WorkflowService>[1] = {},
) {
  return new WorkflowService(repository, {
    deploymentCapabilities: createWorkflowDeploymentCapabilities([{
      capabilityKey: "event.contact.friend_added",
      contractVersion: 1,
    }, {
      capabilityKey: "event.contact.tag_added",
      contractVersion: 1,
    }]),
    entitlementPort: {
      check: async () => ({ entitled: true, unentitledSince: null }),
    },
    ...options,
  });
}

async function createConfigured(
  service: WorkflowService,
  input: { name?: string } = {},
) {
  const created = await service.create(operator, {
    ...input,
    workflowType: "chatai_sop",
  });
  const draft = withStartConfig(created.draft, {
    accountIds: ["account-a"],
    entryPolicy: { mode: "never" },
    triggers: [{ type: "contact.friend_added" }],
  });
  return service.saveDraft(operator, created.id, {
    draft,
    expectedDraftVersion: created.draftVersion,
  });
}

function withStartConfig(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
  config: Record<string, unknown>,
) {
  return {
    ...draft,
    nodes: draft.nodes.map(node => node.id === "start"
      ? { ...node, data: { ...node.data, ...config } }
      : node),
  };
}

function withWaitNode(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
  config: { duration: number; mode: "duration"; unit: "day" | "hour" | "minute" },
) {
  return {
    ...draft,
    edges: [
      { id: "start-wait", source: "start", target: "wait", type: "workflowEdge" },
      { id: "wait-end", source: "wait", target: "end", type: "workflowEdge" },
    ],
    nodes: [
      ...draft.nodes.filter(node => node.id !== "end"),
      {
        data: {
          ...config,
          kind: "wait" as const,
          label: "等待",
          metric: "",
          schemaVersion: 1,
          status: "ready" as const,
          title: "等待",
        },
        id: "wait",
        position: { x: 340, y: 240 },
        selected: false,
        type: "workflowNode",
      },
      ...draft.nodes.filter(node => node.id === "end"),
    ],
  };
}

function withWaitConfig(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
  config: { duration: number; mode: "duration"; unit: "day" | "hour" | "minute" },
) {
  return {
    ...draft,
    nodes: draft.nodes.map(node => node.id === "wait"
      ? { ...node, data: { ...node.data, ...config } }
      : node),
  };
}

function getStartEntryPolicy(draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"]) {
  return (draft.nodes.find(node => node.id === "start")!.data as { entryPolicy?: unknown }).entryPolicy;
}
