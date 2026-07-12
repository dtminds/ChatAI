import { describe, expect, it } from "vitest";
import {
  InMemoryWorkflowRepository,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";

const operator = { roles: ["owner"], subUserId: "17", uid: 9 };

describe("WorkflowService", () => {
  it("updates trimmed workflow metadata without changing the draft", async () => {
    const service = createService();
    const created = await service.create(operator, {});

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
    await expect(service.create({ roles: ["admin"], subUserId: "19", uid: 9 }, {}))
      .resolves.toMatchObject({ runtimeStatus: "inactive" });
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

  it("publishes only the current revision trigger bindings after enable", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = new WorkflowService(repository);
    const created = await createConfigured(service);

    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await expect(repository.listActiveTriggerBindings(operator.uid, "contact.friend_added"))
      .resolves.toEqual([]);

    await service.enable(operator, created.id);
    await expect(repository.listActiveTriggerBindings(operator.uid, "contact.friend_added"))
      .resolves.toMatchObject([{ revision: 1, workflowId: created.id }]);

    const changed = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        accountIds: ["account-b"],
        entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
        triggers: [{ tagIds: ["tag-vip"], type: "customer.tag_added" }],
      }),
      expectedDraftVersion: created.draftVersion,
    });
    await service.publish(operator, created.id, { expectedDraftVersion: changed.draftVersion });

    await expect(repository.listActiveTriggerBindings(operator.uid, "contact.friend_added"))
      .resolves.toEqual([]);
    await expect(repository.listActiveTriggerBindings(operator.uid, "customer.tag_added"))
      .resolves.toMatchObject([{
        filter: { accountIds: ["account-b"] },
        revision: 2,
        workflowId: created.id,
      }]);
  });

  it("retains trigger bindings across pause and hides them after stop or deletion", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = new WorkflowService(repository);
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await service.enable(operator, created.id);

    await service.pause(operator, created.id);
    await expect(repository.listActiveTriggerBindings(operator.uid, "contact.friend_added"))
      .resolves.toEqual([]);
    await service.resume(operator, created.id);
    await expect(repository.listActiveTriggerBindings(operator.uid, "contact.friend_added"))
      .resolves.toHaveLength(1);

    await service.stop(operator, created.id);
    await expect(repository.listActiveTriggerBindings(operator.uid, "contact.friend_added"))
      .resolves.toEqual([]);
    await service.delete(operator, created.id);
    await expect(repository.listActiveTriggerBindings(operator.uid, "contact.friend_added"))
      .resolves.toEqual([]);
  });

  it("uses draft versions as optimistic locks", async () => {
    const service = createService();
    const created = await service.create(operator, {});

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
    const created = await service.create(operator, {});

    await service.delete(operator, created.id);

    await expect(service.get(operator, created.id)).rejects.toMatchObject({
      code: "WORKFLOW_NOT_FOUND",
      statusCode: 404,
    });
    expect(await service.list(operator)).toEqual([]);
  });

  it("allows a deleted create request id to create a new definition", async () => {
    const service = createService();
    const first = await service.create(operator, { clientRequestId: "request-1" });

    await service.delete(operator, first.id);
    const recreated = await service.create(operator, { clientRequestId: "request-1" });

    expect(recreated.id).not.toBe(first.id);
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

function createService() {
  return new WorkflowService(new InMemoryWorkflowRepository());
}

async function createConfigured(
  service: WorkflowService,
  input: { name?: string } = {},
) {
  const created = await service.create(operator, input);
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
