import { describe, expect, it, vi } from "vitest";
import { createWorkflowDeploymentCapabilities } from "@chatai/workflow-engine";
import {
  InMemoryWorkflowLlmTestAttemptRepository,
} from "@chatai/workflow-runtime";
import {
  InMemoryWorkflowRepository,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";

const operator = { roles: ["owner"], subUserId: "17", uid: 9 };

describe("WorkflowService", () => {
  it("creates isolated LLM test Attempts from the current draft snapshot", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
      llmTestMode: "mock",
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withLlmNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });

    const first = await service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "退款什么时候到账" },
    });
    const second = await service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "物流什么时候到" },
    });

    expect(first).toMatchObject({
      executionMode: "mock",
      inputValues: { "input-message": "退款什么时候到账", "input-tone": "简洁" },
      nodeId: "llm-1",
      output: null,
      status: "running",
      workflowId: created.id,
    });
    expect(first.attemptId).not.toBe(second.attemptId);
    expect(attempts.attempts).toHaveLength(2);
    expect(attempts.attempts[0]).toMatchObject({
      node: { id: "llm-1", kind: "llm" },
      payload: {
        kind: "message-list",
        messageList: [
          { content: "请用简洁方式处理", role: "system" },
          { content: "退款什么时候到账", role: "user" },
        ],
      },
    });
  });

  it("rejects stale, invalid, or unavailable LLM test Attempt requests", async () => {
    const repository = new InMemoryWorkflowRepository();
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(repository, {
      llmTestAttemptRepository: attempts,
      llmTestMode: "mock",
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withLlmNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });

    await expect(service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion - 1,
      inputValues: { "input-message": "test" },
    })).rejects.toMatchObject({ code: "WORKFLOW_DRAFT_CONFLICT", statusCode: 409 });
    await expect(service.createLlmTestAttempt(operator, created.id, "start", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: {},
    })).rejects.toMatchObject({ code: "WORKFLOW_LLM_TEST_NODE_INVALID", statusCode: 400 });
    await expect(service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: {},
    })).rejects.toMatchObject({ code: "WORKFLOW_LLM_TEST_INPUT_INVALID", statusCode: 400 });
    await expect(service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": 42 },
    })).rejects.toMatchObject({ code: "WORKFLOW_LLM_TEST_INPUT_INVALID", statusCode: 400 });
    await expect(service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "test", unknown: "value" },
    })).rejects.toMatchObject({ code: "WORKFLOW_LLM_TEST_INPUT_INVALID", statusCode: 400 });
    expect(attempts.attempts).toHaveLength(0);

    const disabled = createService(repository, { llmTestMode: "disabled" });
    await expect(disabled.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "test" },
    })).rejects.toMatchObject({ code: "WORKFLOW_LLM_TEST_UNAVAILABLE", statusCode: 503 });
  });

  it("rejects LLM test inputs that render an empty system prompt", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
      llmTestMode: "mock",
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const draft = withLlmNode(created.draft);
    const saved = await service.saveDraft(operator, created.id, {
      draft: {
        ...draft,
        nodes: draft.nodes.map(node => node.id === "llm-1"
          ? {
              ...node,
              data: {
                ...node.data,
                systemPrompt: [{
                  selector: ["input", "input-message"] as [string, string],
                  type: "variable" as const,
                }],
                userPrompt: [],
              },
            }
          : node),
      },
      expectedDraftVersion: created.draftVersion,
    });

    await expect(service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "" },
    })).rejects.toMatchObject({ code: "WORKFLOW_LLM_TEST_INPUT_INVALID", statusCode: 400 });
    expect(attempts.attempts).toHaveLength(0);
  });

  it("isolates LLM test Attempts by tenant, Workflow, and node", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
      llmTestMode: "mock",
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withLlmNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });
    const attempt = await service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "test" },
    });

    await expect(service.getLlmTestAttempt(operator, created.id, "llm-2", attempt.attemptId))
      .rejects.toMatchObject({ code: "WORKFLOW_LLM_TEST_ATTEMPT_NOT_FOUND", statusCode: 404 });
    await expect(service.getLlmTestAttempt({ ...operator, uid: 10 }, created.id, "llm-1", attempt.attemptId))
      .rejects.toMatchObject({ code: "WORKFLOW_NOT_FOUND", statusCode: 404 });
    await expect(service.getLlmTestAttempt(operator, created.id, "llm-1", attempt.attemptId))
      .resolves.toMatchObject({ attemptId: attempt.attemptId });
  });

  it("stops the current LLM test Attempt without letting a late result replace cancellation", async () => {
    let now = new Date("2099-01-01T00:00:00.000Z");
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      clock: () => now,
      llmTestAttemptRepository: attempts,
      llmTestMode: "mock",
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withLlmNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });
    const attempt = await service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "test" },
    });
    await attempts.claimLlmTestAttemptBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      limit: 1,
      now: new Date("2099-01-01T00:00:00.000Z"),
    });
    now = new Date("2099-01-01T00:00:01.000Z");

    await expect(service.cancelLlmTestAttempt(
      operator,
      created.id,
      "llm-1",
      attempt.attemptId,
    )).resolves.toMatchObject({ status: "cancelled" });
    await expect(attempts.completeLlmTestAttempt({
      attemptId: attempt.attemptId,
      completedAt: new Date("2099-01-01T00:00:02.000Z"),
      leaseOwner: "worker-1",
      output: { "output-text": "late" },
      result: { content: "late", type: "text" },
    })).resolves.toBe(false);
    await expect(attempts.failLlmTestAttempt({
      attemptId: attempt.attemptId,
      errorCode: "LATE_FAILURE",
      errorMessage: "late",
      failedAt: new Date("2099-01-01T00:00:02.000Z"),
      leaseOwner: "worker-1",
      status: "failed",
    })).resolves.toBe(false);
    await expect(service.cancelLlmTestAttempt(
      operator,
      created.id,
      "llm-1",
      attempt.attemptId,
    )).resolves.toMatchObject({ output: null, status: "cancelled" });
  });

  it("keeps an overdue LLM test Attempt timed out when cancellation races its deadline", async () => {
    let now = new Date("2099-01-01T00:00:00.000Z");
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      clock: () => now,
      llmTestAttemptRepository: attempts,
      llmTestMode: "mock",
      llmTestTimeoutMs: 1_000,
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withLlmNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });
    const attempt = await service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "test" },
    });
    now = new Date("2099-01-01T00:00:02.000Z");

    await expect(service.cancelLlmTestAttempt(
      operator,
      created.id,
      "llm-1",
      attempt.attemptId,
    )).resolves.toMatchObject({ status: "timed_out" });
  });

  it("expires an overdue LLM test Attempt when it is read", async () => {
    let now = new Date("2099-01-01T00:00:00.000Z");
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      clock: () => now,
      llmTestAttemptRepository: attempts,
      llmTestMode: "mock",
      llmTestTimeoutMs: 1_000,
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withLlmNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });
    const attempt = await service.createLlmTestAttempt(operator, created.id, "llm-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValues: { "input-message": "test" },
    });
    now = new Date("2099-01-01T00:00:02.000Z");

    await expect(service.getLlmTestAttempt(operator, created.id, "llm-1", attempt.attemptId))
      .resolves.toMatchObject({ status: "timed_out" });
  });
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

  it("keeps workflows ordered by creation time after an older workflow is edited", async () => {
    vi.useFakeTimers();
    try {
      const service = createService();
      vi.setSystemTime(new Date("2026-08-12T09:00:00+08:00"));
      const first = await service.create(operator, {
        name: "先创建",
        workflowType: "chatai_sop",
      });
      vi.setSystemTime(new Date("2026-08-12T09:01:00+08:00"));
      const second = await service.create(operator, {
        name: "后创建",
        workflowType: "chatai_sop",
      });

      vi.setSystemTime(new Date("2026-08-12T09:02:00+08:00"));
      await service.updateMetadata(operator, first.id, {
        description: "已编辑",
        name: first.name,
      });

      await expect(service.list(operator)).resolves.toEqual([
        expect.objectContaining({ id: second.id }),
        expect.objectContaining({ id: first.id }),
      ]);
    } finally {
      vi.useRealTimers();
    }
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
      entryPolicy: { mode: "never" },
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      workUserIds: [201],
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
            attachments: [],
            content: [],
            contentMode: "custom" as const,
            kind: "message" as const,
            label: "消息发送",
            metric: "",
            schemaVersion: 2,
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

  it("saves structurally valid drafts before required node configuration is complete", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    await expect(service.saveDraft(operator, created.id, {
      draft: created.draft,
      expectedDraftVersion: created.draftVersion,
    })).resolves.toMatchObject({ draftVersion: created.draftVersion + 1 });
  });

  it("rejects undeclared node draft fields", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const draft = {
      ...created.draft,
      nodes: created.draft.nodes.map(node => node.id === "start"
        ? { ...node, data: { ...node.data, unexpectedField: true } }
        : node),
    };

    await expect(service.saveDraft(operator, created.id, {
      draft,
      expectedDraftVersion: created.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_DRAFT_NODE_CONFIG_INVALID", statusCode: 400 });
  });

  it("rejects stale node draft schema versions", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const draft = {
      ...created.draft,
      nodes: created.draft.nodes.map(node => node.id === "start"
        ? { ...node, data: { ...node.data, schemaVersion: 0 } }
        : node),
    };

    await expect(service.saveDraft(operator, created.id, {
      draft,
      expectedDraftVersion: created.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_DRAFT_NODE_CONFIG_INVALID", statusCode: 400 });
  });

  it.each([
    { endTime: "09:00", startTime: "20:00" },
    { endTime: "09:00", startTime: "09:00" },
  ])("rejects an invalid message sending window when saving a draft", async (
    messageSendingWindow,
  ) => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    await expect(service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, { messageSendingWindow }),
      expectedDraftVersion: created.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_DRAFT_NODE_CONFIG_INVALID", statusCode: 400 });
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

  it("rejects an inactive seat during publish validation for message-only Start", async () => {
    const service = createService(new InMemoryWorkflowRepository(), {
      sourceIdentityResolver: {
        async resolveActiveSeatWorkUserIds() {
          return new Map();
        },
      },
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const configured = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ keywords: ["价格"], type: "message.received" }],
      }),
      expectedDraftVersion: created.draftVersion,
    });

    await expect(service.publish(operator, created.id, {
      expectedDraftVersion: configured.draftVersion,
    })).rejects.toMatchObject({
      code: "WORKFLOW_START_SOURCE_INVALID",
      statusCode: 400,
    });
  });

  it("publishes legacy rolling entry windows using the current maximum", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const legacyDraft = withStartConfig(created.draft, {
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 365,
        windowUnit: "day",
      },
      seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
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
        entryPolicy: { mode: "never" },
        seatIds: [102],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
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
        entryPolicy: { mode: "never" },
        seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
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
      "contact.friend_added",
    ))
      .resolves.toEqual([]);

    await service.enable(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "contact.friend_added",
    ))
      .resolves.toMatchObject([{ revision: 1, workflowId: created.id }]);

    const changed = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
        seatIds: [102],
        triggers: [{ tagIds: [301], type: "contact.tag_added" }],
      }),
      expectedDraftVersion: created.draftVersion,
    });
    await service.publish(operator, created.id, { expectedDraftVersion: changed.draftVersion });

    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "contact.friend_added",
    ))
      .resolves.toEqual([]);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "contact.tag_added",
    ))
      .resolves.toMatchObject([{
        filter: {
          entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
          eventType: "contact.tag_added",
          tagIds: [301],
          workUserIds: [202],
        },
        revision: 2,
        workflowId: created.id,
      }]);
  });

  it("publishes audience imports without resolving or creating trigger bindings", async () => {
    const repository = new InMemoryWorkflowRepository();
    const resolveActiveSeatWorkUserIds = vi.fn(async () => new Map<number, number>());
    const service = createService(repository, {
      sourceIdentityResolver: { resolveActiveSeatWorkUserIds },
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        entryMode: "audience-import",
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [],
      }),
      expectedDraftVersion: created.draftVersion,
    });

    await service.publish(operator, created.id, { expectedDraftVersion: saved.draftVersion });
    await service.enable(operator, created.id);

    expect(resolveActiveSeatWorkUserIds).not.toHaveBeenCalled();
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "contact.friend_added",
    )).resolves.toEqual([]);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "contact.tag_added",
    )).resolves.toEqual([]);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "message.received",
    )).resolves.toEqual([]);
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
      "contact.friend_added",
    ))
      .resolves.toEqual([]);
    await service.resume(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "contact.friend_added",
    ))
      .resolves.toHaveLength(1);

    await service.stop(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
      "contact.friend_added",
    ))
      .resolves.toEqual([]);
    await service.delete(operator, created.id);
    await expect(repository.listActiveTriggerBindings(
      operator.uid,
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

  it("maps the active Workflow limit to a conflict response", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    vi.spyOn(repository, "enable").mockResolvedValue({ kind: "active-limit-exceeded" });

    await expect(service.enable(operator, created.id)).rejects.toMatchObject({
      code: "WORKFLOW_ACTIVE_LIMIT_EXCEEDED",
      statusCode: 409,
    });
  });

  it("allows only layout changes after a workflow is stopped", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await service.enable(operator, created.id);
    const stopped = await service.stop(operator, created.id);
    const movedDraft = {
      ...stopped.draft,
      nodes: stopped.draft.nodes.map(node => node.id === "start"
        ? { ...node, position: { x: node.position.x + 120, y: node.position.y + 48 } }
        : node),
      viewport: { x: 160, y: 80, zoom: 0.8 },
    };

    const moved = await service.saveDraft(operator, created.id, {
      draft: movedDraft,
      expectedDraftVersion: stopped.draftVersion,
    });

    expect(moved.draft.nodes.find(node => node.id === "start")?.position)
      .toEqual(movedDraft.nodes.find(node => node.id === "start")?.position);
    expect(moved.draft.viewport).toEqual(movedDraft.viewport);
    expect(moved.validatedDraftVersion).toBe(moved.draftVersion);

    await expect(service.saveDraft(operator, created.id, {
      draft: {
        ...moved.draft,
        nodes: moved.draft.nodes.map(node => node.id === "start"
          ? { ...node, data: { ...node.data, title: "修改后的开始节点" } }
          : node),
      },
      expectedDraftVersion: moved.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_STOPPED", statusCode: 409 });

    await expect(service.saveDraft(operator, created.id, {
      draft: {
        ...moved.draft,
        edges: moved.draft.edges.slice(1),
      },
      expectedDraftVersion: moved.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_STOPPED", statusCode: 409 });
  });

  it("normalizes legacy entry limits while saving stopped workflow layout", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await createConfigured(service);
    await service.publish(operator, created.id, { expectedDraftVersion: created.draftVersion });
    await service.enable(operator, created.id);
    const stopped = await service.stop(operator, created.id);
    const legacyDraft = withStartConfig(stopped.draft, {
      entryPolicy: { maxEntries: 1_000, mode: "lifetime_limit" },
    });
    const seeded = await repository.saveDraft({
      draft: legacyDraft,
      expectedDraftVersion: stopped.draftVersion,
      layoutOnly: true,
      opSubUserId: operator.subUserId,
      uid: operator.uid,
      workflowId: created.id,
    });
    if (seeded.kind !== "success") throw new Error("legacy draft seed failed");

    const movedDraft = {
      ...seeded.value.draft,
      nodes: seeded.value.draft.nodes.map(node => node.id === "start"
        ? { ...node, position: { x: node.position.x + 120, y: node.position.y + 48 } }
        : node),
    };
    const saved = await service.saveDraft(operator, created.id, {
      draft: movedDraft,
      expectedDraftVersion: seeded.value.draftVersion,
    });

    expect(getStartEntryPolicy(saved.draft)).toEqual({
      maxEntries: 10,
      mode: "lifetime_limit",
    });
    expect(saved.draft.nodes.find(node => node.id === "start")?.position)
      .toEqual(movedDraft.nodes.find(node => node.id === "start")?.position);
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
    }, {
      capabilityKey: "event.message.received",
      contractVersion: 1,
    }]),
    entitlementPort: {
      check: async () => ({ entitled: true, unentitledSince: null }),
    },
    sourceIdentityResolver: {
      async resolveActiveSeatWorkUserIds(_uid, seatIds) {
        return new Map(seatIds.map(seatId => [seatId, seatId + 100]));
      },
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
    entryPolicy: { mode: "never" },
    seatIds: [101],
    triggers: [{ sourceIds: [], type: "contact.friend_added" }],
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

function withLlmNode(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
) {
  const llmNode = {
    data: {
      inputs: [
        {
          id: "input-message",
          name: "message",
          value: {
            kind: "variable" as const,
            selector: ["trigger", "text"] as [string, string],
            valueType: { kind: "string" as const },
          },
        },
        { id: "input-tone", name: "tone", value: { kind: "literal" as const, value: "简洁" } },
      ],
      kind: "llm" as const,
      label: "大模型",
      metric: "model-1",
      modelId: "model-1",
      output: {
        field: { description: "", id: "output-1", name: "output", type: "string" as const },
        format: "text" as const,
      },
      schemaVersion: 1,
      status: "ready" as const,
      systemPrompt: [
        { type: "text" as const, value: "请用" },
        { selector: ["input", "input-tone"] as [string, string], type: "variable" as const },
        { type: "text" as const, value: "方式处理" },
      ],
      title: "大模型",
      userPrompt: [{ selector: ["input", "input-message"] as [string, string], type: "variable" as const }],
    },
    id: "llm-1",
    position: { x: 340, y: 240 },
    type: "workflowNode",
  };
  return {
    ...draft,
    edges: [
      { id: "edge-start-llm", source: "start", target: "llm-1", type: "workflowEdge" },
      { id: "edge-llm-end", source: "llm-1", target: "end", type: "workflowEdge" },
    ],
    nodes: [
      ...draft.nodes.filter(node => node.id !== "end"),
      llmNode,
      draft.nodes.find(node => node.id === "end")!,
    ],
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
