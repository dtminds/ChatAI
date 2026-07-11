import { describe, expect, it } from "vitest";
import {
  InMemoryWorkflowRepository,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";

const operator = { roles: ["owner"], subUserId: "17", uid: 9 };

describe("WorkflowService", () => {
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
      draft: { ...created.draft, viewport: { x: 50, y: 25, zoom: 1 } },
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
  const draft = {
    ...created.draft,
    nodes: created.draft.nodes.map(node => node.id === "start"
      ? {
          ...node,
          data: {
            ...node.data,
            accountIds: ["account-a"],
            entryPolicy: { mode: "never" },
            triggers: [{ type: "contact.friend_added" }],
          },
        }
      : node),
  };
  return service.saveDraft(operator, created.id, {
    draft,
    expectedDraftVersion: created.draftVersion,
  });
}
