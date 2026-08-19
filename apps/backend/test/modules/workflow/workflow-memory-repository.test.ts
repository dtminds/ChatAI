import type { WorkflowDraft, WorkflowExecutionSpec } from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
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
    const pending = await createPublishedDefinition(repository, "pending");

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
    const afterPause = await createPublishedDefinition(repository, "after-pause");
    const afterStop = await createPublishedDefinition(repository, "after-stop");

    await transition(repository, active[0]!.id, "active", "paused");
    await expect(enableDefinition(repository, afterPause.id)).resolves.toMatchObject({ kind: "success" });

    await transition(repository, active[1]!.id, "active", "stopped");
    await expect(enableDefinition(repository, afterStop.id)).resolves.toMatchObject({ kind: "success" });
  });
});

describe("InMemoryWorkflowRepository review ordering", () => {
  it("returns the newest current review when attempts are created in the same millisecond", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T00:00:00.000Z"));
    try {
      const repository = new InMemoryWorkflowRepository();
      const published = await createPublishedDefinition(repository, "review-ordering");
      const saved = await repository.saveDraft({
        draft: DRAFT,
        draftSemanticHash: "changed-draft-hash",
        expectedDraftVersion: published.draftVersion,
        opSubUserId: OP_SUB_USER_ID,
        uid: UID,
        workflowId: published.id,
      });
      if (saved.kind !== "success") throw new Error("Failed to save changed draft");
      const first = await repository.submitReview(reviewInput({
        basePublishedRevision: published.publishedRevision,
        candidateHash: "b".repeat(64),
        draftSemanticHash: "changed-draft-hash",
        expectedDraftVersion: saved.value.draftVersion,
        revision: 2,
        workflowId: published.id,
      }));
      if (first.kind !== "success") throw new Error("Failed to submit first review");
      await repository.decideReview({
        comment: "请调整",
        decision: "rejected",
        opSubUserId: "18",
        reviewId: first.value.id,
        uid: UID,
        workflowId: published.id,
      });
      const second = await repository.submitReview(reviewInput({
        basePublishedRevision: published.publishedRevision,
        candidateHash: "c".repeat(64),
        draftSemanticHash: "changed-draft-hash",
        expectedDraftVersion: saved.value.draftVersion,
        revision: 2,
        workflowId: published.id,
      }));
      if (second.kind !== "success") throw new Error("Failed to submit second review");

      await expect(repository.findCurrentReview(UID, published.id)).resolves.toMatchObject({
        id: second.value.id,
        status: "pending",
      });
      await repository.withdrawReview({
        opSubUserId: OP_SUB_USER_ID,
        reviewId: second.value.id,
        uid: UID,
        workflowId: published.id,
      });
      await expect(repository.findCurrentReview(UID, published.id)).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

async function createEnabledDefinition(repository: InMemoryWorkflowRepository, name: string) {
  const definition = await createPublishedDefinition(repository, name);
  const result = await enableDefinition(repository, definition.id);
  if (result.kind !== "success") throw new Error(`Failed to enable ${name}`);
  return result.value;
}

async function createPublishedDefinition(repository: InMemoryWorkflowRepository, name: string) {
  const created = await repository.createDefinition({
    description: "",
    draft: DRAFT,
    draftSemanticHash: "draft-hash",
    name,
    opSubUserId: OP_SUB_USER_ID,
    uid: UID,
    workflowType: "chatai_sop",
  });
  if (created.kind !== "success") throw new Error(`Failed to create ${name}`);
  const submitted = await repository.submitReview(reviewInput({
    basePublishedRevision: null,
    candidateHash: "a".repeat(64),
    expectedDraftVersion: created.value.draftVersion,
    revision: 1,
    workflowId: created.value.id,
  }));
  if (submitted.kind !== "success") throw new Error(`Failed to submit ${name}`);
  const approved = await repository.decideReview({
    comment: null,
    decision: "approved",
    opSubUserId: OP_SUB_USER_ID,
    reviewId: submitted.value.id,
    uid: UID,
    workflowId: created.value.id,
  });
  if (approved.kind !== "success") throw new Error(`Failed to approve ${name}`);
  const published = await repository.publishRevision({
    candidateHash: approved.value.candidateHash,
    opSubUserId: OP_SUB_USER_ID,
    reviewId: approved.value.id,
    uid: UID,
    workflowId: created.value.id,
  });
  if (published.kind !== "success") throw new Error(`Failed to publish ${name}`);
  return published.value.definition;
}

function reviewInput(input: {
  basePublishedRevision: number | null;
  candidateHash: string;
  draftSemanticHash?: string;
  expectedDraftVersion: number;
  revision: number;
  workflowId: string;
}) {
  return {
    basePublishedRevision: input.basePublishedRevision,
    candidateHash: input.candidateHash,
    changeSummary: {
      addedNodes: [],
      changedNodes: [],
      firstPublication: input.basePublishedRevision === null,
      pathChanged: true,
      removedNodes: [],
      triggerChanged: true,
    },
    checkedAt: new Date("2026-08-16T00:00:00.000Z"),
    draft: DRAFT,
    draftSemanticHash: input.draftSemanticHash ?? "draft-hash",
    executionSpec: executionSpec(input.workflowId, input.revision),
    expectedDraftVersion: input.expectedDraftVersion,
    opSubUserId: OP_SUB_USER_ID,
    subjectType: "chatai_contact",
    triggerBindings: [],
    uid: UID,
    workflowId: input.workflowId,
    workflowType: "chatai_sop",
  };
}

function enableDefinition(repository: InMemoryWorkflowRepository, workflowId: string) {
  return repository.enable({
    opSubUserId: OP_SUB_USER_ID,
    uid: UID,
    workflowId,
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

function executionSpec(workflowId: string, revision = 1): WorkflowExecutionSpec {
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
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
      },
    ],
    revision,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId,
  };
}
