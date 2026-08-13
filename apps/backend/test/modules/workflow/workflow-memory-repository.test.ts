import type { WorkflowDraft, WorkflowExecutionSpec } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import { InMemoryWorkflowRepository } from "../../../src/modules/workflow/workflow-memory.repository.js";

const UID = 9;
const OP_SUB_USER_ID = "17";
const DRAFT: WorkflowDraft = {
  edges: [],
  nodes: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe("InMemoryWorkflowRepository active Workflow limit", () => {
  it("rejects the fifty-first enable for a tenant", async () => {
    const repository = new InMemoryWorkflowRepository();
    for (let index = 0; index < 50; index += 1) {
      await createEnabledDefinition(repository, `active-${index}`);
    }
    const pending = await createValidatedDefinition(repository, "pending");

    await expect(enableDefinition(repository, pending.id)).resolves.toEqual({
      kind: "active-limit-exceeded",
    });
  });

  it("rejects resume while fifty other Workflows are active", async () => {
    const repository = new InMemoryWorkflowRepository();
    const paused = await createEnabledDefinition(repository, "paused");
    await transition(repository, paused.id, "active", "paused");
    for (let index = 0; index < 50; index += 1) {
      await createEnabledDefinition(repository, `active-${index}`);
    }

    await expect(transition(repository, paused.id, "paused", "active")).resolves.toEqual({
      kind: "active-limit-exceeded",
    });
  });

  it("frees active capacity when a Workflow is paused or stopped", async () => {
    const repository = new InMemoryWorkflowRepository();
    const active = [];
    for (let index = 0; index < 50; index += 1) {
      active.push(await createEnabledDefinition(repository, `active-${index}`));
    }
    const afterPause = await createValidatedDefinition(repository, "after-pause");
    const afterStop = await createValidatedDefinition(repository, "after-stop");

    await transition(repository, active[0]!.id, "active", "paused");
    await expect(enableDefinition(repository, afterPause.id)).resolves.toMatchObject({ kind: "success" });

    await transition(repository, active[1]!.id, "active", "stopped");
    await expect(enableDefinition(repository, afterStop.id)).resolves.toMatchObject({ kind: "success" });
  });
});

async function createEnabledDefinition(repository: InMemoryWorkflowRepository, name: string) {
  const definition = await createValidatedDefinition(repository, name);
  const result = await enableDefinition(repository, definition.id);
  if (result.kind !== "success") throw new Error(`Failed to enable ${name}`);
  return result.value.definition;
}

async function createValidatedDefinition(repository: InMemoryWorkflowRepository, name: string) {
  const created = await repository.createDefinition({
    description: "",
    draft: DRAFT,
    name,
    opSubUserId: OP_SUB_USER_ID,
    uid: UID,
    workflowType: "chatai_sop",
  });
  if (created.kind !== "success") throw new Error(`Failed to create ${name}`);
  const validated = await repository.markValidated({
    expectedDraftVersion: created.value.draftVersion,
    opSubUserId: OP_SUB_USER_ID,
    uid: UID,
    workflowId: created.value.id,
  });
  if (validated.kind !== "success") throw new Error(`Failed to validate ${name}`);
  return validated.value;
}

function enableDefinition(repository: InMemoryWorkflowRepository, workflowId: string) {
  return repository.enable({
    draft: DRAFT,
    executionSpec: executionSpec(workflowId),
    expectedDraftVersion: 1,
    opSubUserId: OP_SUB_USER_ID,
    specHash: "a".repeat(64),
    subjectType: "chatai_contact",
    triggerBinding: {
      eventType: "message.received",
      filter: {
        entryPolicy: { mode: "never" },
        eventType: "message.received",
        keywords: [],
        seatIds: [101],
      },
      subjectType: "chatai_contact",
    },
    uid: UID,
    workflowId,
    workflowType: "chatai_sop",
  });
}

function transition(
  repository: InMemoryWorkflowRepository,
  workflowId: string,
  currentStatus: "active" | "paused",
  status: "active" | "paused" | "stopped",
) {
  return repository.setRuntimeStatus({
    allowedCurrentStatuses: [currentStatus],
    opSubUserId: OP_SUB_USER_ID,
    status,
    statusReason: null,
    transitionedAt: new Date("2026-08-13T00:00:00.000Z"),
    uid: UID,
    workflowId,
  });
}

function executionSpec(workflowId: string): WorkflowExecutionSpec {
  const capability = { capabilityKey: "event.message.received", contractVersion: 1 } as const;
  return {
    edges: [{ id: "start-end", source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      {
        config: {
          entryPolicy: { mode: "never" },
          seatIds: [101],
          triggers: [{ keywords: [], type: "message.received" }],
        },
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
        requiredCapabilities: [capability],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [capability],
    revision: 1,
    schemaVersion: 2,
    terminalNodeId: "end",
    workflowId,
  };
}
