import type { WorkflowExecutionSpec, WorkflowStartConfig } from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "../src/index.js";

const now = new Date("2026-08-24T08:30:15.123Z");

describe("workflow direct entry", () => {
  it("starts from the published direct-push revision without retaining workflowId in projection", async () => {
    const { repository, service } = createHarness(directStart({
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      seatIds: [101],
    }));

    const started = await service.startDirectRun(directInput());

    expect(started).toMatchObject({
      deduplicated: false,
      kind: "success",
      run: {
        context: {
          trigger: {
            eventType: "workflow.direct_entry",
            projection: {
              externalUserId: 3267,
              seatId: 101,
              thirdExternalUserId: "chatai-contact-1",
              workUserId: 201,
            },
          },
        },
        subjectId: "chatai-contact-1",
        subjectType: "chatai_contact",
        workflowId: "31",
      },
    });
    expect(started.run.context.trigger).not.toHaveProperty("projection.workflowId");

    await expect(service.startDirectRun(directInput({ entryEventId: "event-2" })))
      .resolves.toMatchObject({ kind: "active-run-rejected" });
    repository.runs[0]!.status = "completed";
    await expect(service.startDirectRun(directInput({ entryEventId: "event-2" })))
      .resolves.toMatchObject({ deduplicated: false, kind: "success" });
  });

  it("rejects a direct event when the published Start mode or identity scope does not match", async () => {
    const eventService = createHarness({
      entryPolicy: { mode: "never" },
      seatIds: [101],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
    }).service;
    await expect(eventService.startDirectRun(directInput())).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_UNAVAILABLE",
    });

    const directService = createHarness(directStart({
      entryPolicy: { mode: "never" },
      seatIds: [102],
    })).service;
    await expect(directService.startDirectRun(directInput())).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_IDENTITY_INVALID",
    });
  });

  it("uses WeCom identity fields for a WeCom Workflow", async () => {
    const { service } = createHarness({
      entryMode: "direct-push",
      entryPolicy: { mode: "never" },
      triggers: [],
      workUserIds: [201],
    }, "wecom_sop");

    await expect(service.startDirectRun(directInput({
      payload: { externalUserId: 3267, workUserId: 201, workflowId: "31" },
      source: "wecom",
    }))).resolves.toMatchObject({
      kind: "success",
      run: { subjectId: "3267", subjectType: "wecom_contact" },
    });
  });

  it("rejects a direct entry matched against a stale binding revision", async () => {
    const { service } = createHarness(directStart({
      entryPolicy: { mode: "never" },
      seatIds: [101],
    }));

    await expect(service.startDirectRun(directInput({ expectedRevision: 2 })))
      .rejects.toMatchObject({ code: "WORKFLOW_DEFINITION_STALE" });
  });

  it("applies tenant capacity to direct entry", async () => {
    const { service } = createHarness(directStart({
      entryPolicy: { mode: "never" },
      seatIds: [101],
    }), "chatai_sop", 0);

    await expect(service.startDirectRun(directInput()))
      .resolves.toEqual({ kind: "capacity-rejected" });
  });
});

function createHarness(
  startConfig: WorkflowStartConfig,
  workflowType: "chatai_sop" | "wecom_sop" = "chatai_sop",
  activeRunLimit = 10_000,
) {
  const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
  const executionSpec = createExecutionSpec(startConfig);
  const service = new WorkflowRuntimeService({
    applyEntitlementLoss: vi.fn(),
    findDefinition: vi.fn(async (uid: number, workflowId: string) =>
      uid === 9 && workflowId === "31"
        ? {
            bizStatus: 1 as const,
            publishedRevision: 1,
            runtimeStatus: "active" as const,
            statusReason: null,
            workflowType,
          }
        : null),
    findRevision: vi.fn(async () => ({
      executionSpec,
      revision: 1,
      subjectType: workflowType === "chatai_sop" ? "chatai_contact" as const : "wecom_contact" as const,
      workflowType,
    })),
  }, repository, undefined, {
    clock: () => now,
    entitlementPort: {
      check: async () => ({ activeRunLimit, entitled: true, unentitledSince: null }),
    },
  });
  return { repository, service };
}

function createExecutionSpec(startConfig: WorkflowStartConfig): WorkflowExecutionSpec {
  return {
    edges: [{ id: "start-end", source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      { config: startConfig, id: "start", kind: "start", nodeSchemaVersion: 1 },
      { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1 },
    ],
    revision: 1,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId: "31",
  };
}

function directStart(
  config: Omit<Extract<WorkflowStartConfig, { seatIds: number[] }>, "entryMode" | "triggers">,
): WorkflowStartConfig {
  return { ...config, entryMode: "direct-push", triggers: [] };
}

function directInput(
  overrides: Partial<Parameters<WorkflowRuntimeService["startDirectRun"]>[0]> = {},
): Parameters<WorkflowRuntimeService["startDirectRun"]>[0] {
  return {
    entryEventId: "event-1",
    expectedRevision: 1,
    occurredAt: now.toISOString(),
    payload: {
      externalUserId: 3267,
      seatId: 101,
      thirdExternalUserId: "chatai-contact-1",
      workUserId: 201,
      workflowId: "31",
    },
    payloadVersion: 1,
    source: "chatai",
    uid: 9,
    ...overrides,
  };
}
