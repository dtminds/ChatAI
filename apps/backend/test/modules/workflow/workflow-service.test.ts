import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowLlmTestAttemptRepository,
} from "@chatai/workflow-runtime";
import {
  InMemoryWorkflowRepository,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";
import {
  MockWorkflowDirectEntryEndpointPort,
} from "../../../src/modules/workflow/direct-entry-endpoint-port.js";

const operator = { roles: ["owner"], subUserId: "17", uid: 9 };

describe("WorkflowService", () => {
  it("loads a direct-entry key with the authoritative tenant and Workflow identity", async () => {
    const repository = new InMemoryWorkflowRepository();
    const getEndpointKey = vi.fn(async () => "java.endpoint-key");
    const service = createService(repository, {
      directEntryEndpointPort: { getEndpointKey },
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    await expect(service.getDirectEntryEndpoint(operator, created.id)).resolves.toEqual({
      endpointKey: "java.endpoint-key",
    });
    expect(getEndpointKey).toHaveBeenCalledWith({ uid: 9, workflowId: created.id });
    await expect(service.getDirectEntryEndpoint(
      { roles: ["owner"], subUserId: "18", uid: 10 },
      created.id,
    )).rejects.toMatchObject({ code: "WORKFLOW_NOT_FOUND", statusCode: 404 });
    expect(getEndpointKey).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid direct-entry keys returned by the Java port", async () => {
    const service = createService(new InMemoryWorkflowRepository(), {
      directEntryEndpointPort: { getEndpointKey: async () => "invalid/key" },
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    await expect(service.getDirectEntryEndpoint(operator, created.id)).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_ENDPOINT_INVALID",
      statusCode: 502,
    });
  });

  it("keeps the temporary direct-entry Mock key stable per tenant and Workflow", async () => {
    const port = new MockWorkflowDirectEntryEndpointPort();
    const first = await port.getEndpointKey({ uid: 9, workflowId: "31" });

    await expect(port.getEndpointKey({ uid: 9, workflowId: "31" })).resolves.toBe(first);
    await expect(port.getEndpointKey({ uid: 9, workflowId: "32" })).resolves.not.toBe(first);
    expect(first).toMatch(/^mock\.[A-Za-z0-9_-]+$/);
  });

  it("creates isolated LLM test Attempts from the current draft snapshot", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
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
      executionMode: "real",
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
          { content: [{ text: "请用简洁方式处理", type: "text" }], role: "system" },
          { content: [{ text: "退款什么时候到账", type: "text" }], role: "user" },
        ],
      },
    });
  });

  it("rejects stale, invalid, or unavailable LLM test Attempt requests", async () => {
    const repository = new InMemoryWorkflowRepository();
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(repository, {
      llmTestAttemptRepository: attempts,
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

  });

  it("rejects LLM test inputs that render an empty system prompt", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
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

  it("creates AI Intent test Attempts from the saved selector contract", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withAiIntentNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });
    const inputValue = [{
      id: 101,
      parts: [
        { text: "看下这个", type: "text" as const },
        { type: "image" as const, url: "https://example.com/order.png" },
      ],
      role: "customer" as const,
    }];

    const attempt = await service.createAiIntentTestAttempt(
      operator,
      created.id,
      "ai-intent-1",
      { expectedDraftVersion: saved.draftVersion, inputValue },
    );

    expect(attempt).toMatchObject({
      inputValues: { inputValue },
      nodeId: "ai-intent-1",
      status: "running",
    });
    expect(attempts.attempts[0]).toMatchObject({
      node: { id: "ai-intent-1", kind: "ai-intent" },
      payload: {
        messageList: [
          { role: "system" },
          {
            content: [
              { text: "用户: 看下这个", type: "text" },
              { type: "image", url: "https://example.com/order.png" },
            ],
            role: "user",
          },
        ],
      },
    });
  });

  it("creates AI Intent test Attempts from a single Wait Event message", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withAiIntentNode(created.draft, "wait-event"),
      expectedDraftVersion: created.draftVersion,
    });
    const inputValue = {
      id: 101,
      parts: [{ text: "退款什么时候到账", type: "text" as const }],
      role: "customer" as const,
    };

    const attempt = await service.createAiIntentTestAttempt(
      operator,
      created.id,
      "ai-intent-1",
      { expectedDraftVersion: saved.draftVersion, inputValue },
    );

    expect(attempt).toMatchObject({
      inputValues: { inputValue },
      nodeId: "ai-intent-1",
      status: "running",
    });
    expect(attempts.attempts[0]).toMatchObject({
      payload: {
        messageList: [
          { role: "system" },
          {
            content: [{ text: "用户: 退款什么时候到账", type: "text" }],
            role: "user",
          },
        ],
      },
    });
  });

  it("rejects stale or source-type-mismatched AI Intent test inputs", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const saved = await service.saveDraft(operator, created.id, {
      draft: withAiIntentNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });

    await expect(service.createAiIntentTestAttempt(operator, created.id, "ai-intent-1", {
      expectedDraftVersion: saved.draftVersion - 1,
      inputValue: [],
    })).rejects.toMatchObject({ code: "WORKFLOW_DRAFT_CONFLICT", statusCode: 409 });
    await expect(service.createAiIntentTestAttempt(operator, created.id, "ai-intent-1", {
      expectedDraftVersion: saved.draftVersion,
      inputValue: "客户端不能把消息列表声明成文本",
    })).rejects.toMatchObject({
      code: "WORKFLOW_AI_INTENT_TEST_INPUT_INVALID",
      statusCode: 400,
    });
    await expect(service.createAiIntentTestAttempt(operator, created.id, "start", {
      expectedDraftVersion: saved.draftVersion,
      inputValue: [],
    })).rejects.toMatchObject({
      code: "WORKFLOW_AI_INTENT_TEST_NODE_INVALID",
      statusCode: 400,
    });
    expect(attempts.attempts).toHaveLength(0);
  });

  it("isolates LLM test Attempts by tenant, Workflow, and node", async () => {
    const attempts = new InMemoryWorkflowLlmTestAttemptRepository();
    const service = createService(new InMemoryWorkflowRepository(), {
      llmTestAttemptRepository: attempts,
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

  it("orders the first page by update time after an older workflow is edited", async () => {
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

      await expect(service.list(operator, { limit: 20, status: "all" })).resolves.toMatchObject({
        items: [
          expect.objectContaining({ id: first.id }),
          expect.objectContaining({ id: second.id }),
        ],
        nextCursor: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads only the first three managed accounts for each workflow list row", async () => {
    const findByIds = vi.fn(async (_uid: number, seatIds: number[]) => new Map(
      seatIds.map(id => [id, { avatarUrl: `https://example.com/${id}.png`, id, name: `托管账号 ${id}` }]),
    ));
    const service = createService(new InMemoryWorkflowRepository(), {
      managedAccountReader: { findByIds },
    });
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        entryPolicy: { mode: "never" },
        seatIds: [101, 102, 103, 104, 105],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      expectedDraftVersion: created.draftVersion,
    });

    const page = await service.list(operator, { limit: 1, status: "all" });

    expect(findByIds).toHaveBeenCalledWith(operator.uid, [101, 102, 103]);
    expect(page.items[0]?.managedAccounts.map(account => account.id)).toEqual([101, 102, 103]);
  });

  it("allows only owners and admins to access workflows", async () => {
    const service = createService();

    await expect(service.list({ roles: ["operator"], subUserId: "18", uid: 9 }, { limit: 20, status: "all" }))
      .rejects.toMatchObject({ code: "WORKFLOW_FORBIDDEN", statusCode: 403 });
    await expect(service.create(
      { roles: ["admin"], subUserId: "19", uid: 9 },
      { workflowType: "chatai_sop" },
    ))
      .resolves.toMatchObject({ runtimeStatus: "inactive" });
  });

  it("rejects the reserved Member SOP type before checking entitlement", async () => {
    const repository = new InMemoryWorkflowRepository();
    const entitlementCheck = vi.fn(async () => ({ activeRunLimit: 10_000, entitled: true as const, unentitledSince: null }));
    const service = createService(repository, {
      entitlementPort: { check: entitlementCheck },
    });

    await expect(service.create(operator, { workflowType: "member_sop" }))
      .rejects.toMatchObject({ code: "WORKFLOW_TYPE_UNAVAILABLE", statusCode: 400 });
    expect(entitlementCheck).not.toHaveBeenCalled();
    await expect(repository.listDefinitions(operator.uid, { limit: 20, status: "all" })).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    });
  });

  it("rejects node kinds outside the selected Workflow type policy", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "wecom_sop" });
    const startConfigured = withStartConfig(created.draft, {
      entryPolicy: { mode: "never" },
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
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
  ])("allows an incomplete message sending window when saving a draft", async (
    messageSendingWindow,
  ) => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });

    await expect(service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, { messageSendingWindow }),
      expectedDraftVersion: created.draftVersion,
    })).resolves.toMatchObject({ draftVersion: created.draftVersion + 1 });
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
    await publishApprovedDraft(allowed, created.id, created.draftVersion);
    await allowed.enable(operator, created.id);
    const changed = await allowed.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, { messageSendingWindow: { endTime: "19:00", startTime: "09:00" } }),
      expectedDraftVersion: created.draftVersion,
    });
    const denied = createService(repository, {
      clock: () => new Date("2026-08-10T00:00:00.000Z"),
      entitlementPort: {
        check: async () => ({ entitled: false, unentitledSince }),
      },
    });

    await expect(denied.submitReview(operator, created.id, {
      expectedDraftVersion: changed.draftVersion,
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
    await publishApprovedDraft(allowed, created.id, created.draftVersion);
    await allowed.enable(operator, created.id);
    const changed = await allowed.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, { messageSendingWindow: { endTime: "19:00", startTime: "09:00" } }),
      expectedDraftVersion: created.draftVersion,
    });
    const unavailable = createService(repository, {
      entitlementPort: {
        check: async () => { throw new Error("Java unavailable"); },
      },
    });

    await expect(unavailable.submitReview(operator, created.id, {
      expectedDraftVersion: changed.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_ENTITLEMENT_UNAVAILABLE", statusCode: 503 });
    await expect(unavailable.get(operator, created.id)).resolves.toMatchObject({
      runtimeStatus: "active",
      statusReason: null,
    });
  });

  it("publishes revision 1 before enabling it independently", async () => {
    const service = createService();
    const created = await createConfigured(service, { name: "新客培育" });

    const submitted = await service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });
    const approved = await service.approveReview(operator, created.id, submitted.id, {});
    const published = await service.publish(operator, created.id, { reviewId: approved.id });

    expect(published.revision.revision).toBe(1);
    expect(published.definition).toMatchObject({
      publishedRevision: 1,
      runtimeStatus: "inactive",
    });

    const enabled = await service.enable(operator, created.id);

    expect(enabled.runtimeStatus).toBe("active");
    expect(enabled.publishedRevision).toBe(1);
    expect((await service.listRevisions(operator, created.id)).items).toHaveLength(1);
  });

  it("publishes an approved review after JSON storage reorders object keys", async () => {
    const repository = new InMemoryWorkflowRepository();
    const submitReview = repository.submitReview.bind(repository);
    repository.submitReview = input => submitReview({
      ...input,
      candidateHash: "candidate-hash-created-before-canonicalization",
    });
    const findReview = repository.findReview.bind(repository);
    repository.findReview = async (uid, workflowId, reviewId) => {
      const review = await findReview(uid, workflowId, reviewId);
      return review
        ? {
            ...review,
            executionSpec: reorderObjectKeys(review.executionSpec),
            triggerBindings: reorderObjectKeys(review.triggerBindings),
          }
        : null;
    };
    const service = createService(repository);
    const created = await createConfigured(service);
    const submitted = await service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });
    await service.approveReview(operator, created.id, submitted.id, {});

    const published = await service.publish(operator, created.id, { reviewId: submitted.id });

    expect(published.revision.revision).toBe(1);
  });

  it("rejects publication before resource checks when the reviewed draft semantics changed", async () => {
    const resolveActiveSeatWorkUserIds = vi.fn(async (_uid: number, seatIds: number[]) =>
      new Map(seatIds.map(seatId => [seatId, seatId + 100])));
    const service = createService(new InMemoryWorkflowRepository(), {
      sourceIdentityResolver: { resolveActiveSeatWorkUserIds },
    });
    const created = await createConfigured(service);
    const configured = await service.saveDraft(operator, created.id, {
      draft: withWaitNode(created.draft, { duration: 1, mode: "duration", unit: "hour" }),
      expectedDraftVersion: created.draftVersion,
    });
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: configured.draftVersion,
    });
    await service.approveReview(operator, created.id, review.id, {});
    await service.saveDraft(operator, created.id, {
      draft: withWaitConfig(configured.draft, { duration: 2, mode: "duration", unit: "hour" }),
      expectedDraftVersion: configured.draftVersion,
    });
    resolveActiveSeatWorkUserIds.mockClear();

    await expect(service.publish(operator, created.id, { reviewId: review.id }))
      .rejects.toMatchObject({ code: "WORKFLOW_DRAFT_CONFLICT", statusCode: 409 });
    expect(resolveActiveSeatWorkUserIds).not.toHaveBeenCalled();
  });

  it("locks a pending review and keeps the approved decision immutable when the draft changes", async () => {
    const service = createService();
    const created = await createConfigured(service);
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });

    await expect(service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, { messageSendingWindow: { endTime: "19:00", startTime: "09:00" } }),
      expectedDraftVersion: created.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_REVIEW_LOCKED", statusCode: 409 });
    await expect(service.updateMetadata(operator, created.id, {
      description: "审核期间不可修改",
      name: "新名称",
    })).rejects.toMatchObject({ code: "WORKFLOW_REVIEW_LOCKED", statusCode: 409 });

    await service.approveReview(operator, created.id, review.id, {});
    const approved = await service.get(operator, created.id);
    expect(approved.permissions.canEdit).toBe(true);

    const editable = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        messageSendingWindow: { endTime: "20:00", startTime: "10:00" },
      }),
      expectedDraftVersion: created.draftVersion,
    });
    expect(editable.permissions.canEdit).toBe(true);
    expect(editable.currentReview).toBeNull();
    await expect(service.listReviews(operator, created.id)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: review.id, status: "approved" })],
      nextCursor: null,
    });
  });

  it("keeps approval valid when workflow metadata changes", async () => {
    const service = createService();
    const created = await createConfigured(service);
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });
    await service.approveReview(operator, created.id, review.id, {});

    const renamed = await service.updateMetadata(operator, created.id, {
      description: "调整后的说明",
      name: "调整后的名称",
    });

    expect(renamed.currentReview).toMatchObject({ id: review.id, status: "approved" });
    await expect(service.listReviews(operator, created.id)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: review.id, status: "approved" })],
      nextCursor: null,
    });
  });

  it("restores an unpublished approved review and reuses its approval", async () => {
    const service = createService();
    const created = await createConfigured(service);
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });
    await service.approveReview(operator, created.id, review.id, {});
    const changed = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        messageSendingWindow: { endTime: "20:00", startTime: "10:00" },
      }),
      expectedDraftVersion: created.draftVersion,
    });

    const restored = await service.restoreReview(operator, created.id, review.id, {
      expectedDraftVersion: changed.draftVersion,
    });

    expect(restored.currentReview).toMatchObject({ id: review.id, status: "approved" });
    const published = await service.publish(operator, created.id, { reviewId: review.id });
    expect(published.revision.revision).toBe(1);
    await expect(service.listReviews(operator, created.id)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: review.id, resultingRevision: 1, status: "approved" })],
      nextCursor: null,
    });
  });

  it("allows self approval but forbids self rejection and blank rejection reasons", async () => {
    const service = createService();
    const created = await createConfigured(service);
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });
    const reviewer = { ...operator, subUserId: "18" };

    await expect(service.rejectReview(operator, created.id, review.id, {
      reason: "需要调整",
    })).rejects.toMatchObject({
      code: "WORKFLOW_REVIEW_SELF_REJECT_FORBIDDEN",
      statusCode: 403,
    });
    await expect(service.rejectReview(reviewer, created.id, review.id, {
      reason: "   ",
    })).rejects.toMatchObject({
      code: "WORKFLOW_REVIEW_REJECTION_REASON_REQUIRED",
      statusCode: 400,
    });

    const rejected = await service.rejectReview(reviewer, created.id, review.id, {
      reason: "进入条件需要调整",
    });
    expect(rejected).toMatchObject({
      reviewComment: "进入条件需要调整",
      status: "rejected",
    });
    await expect(service.get(operator, created.id)).resolves.toMatchObject({
      currentReview: expect.objectContaining({ status: "rejected" }),
      permissions: expect.objectContaining({ canEdit: true }),
    });
  });

  it("moves a rejected review to history after the draft returns to published semantics", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await publishApprovedDraft(service, created.id, created.draftVersion);
    const published = await service.get(operator, created.id);
    const changed = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(published.draft, {
        messageSendingWindow: { endTime: "19:00", startTime: "09:00" },
      }),
      expectedDraftVersion: published.draftVersion,
    });
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: changed.draftVersion,
    });
    await service.rejectReview({ ...operator, subUserId: "18" }, created.id, review.id, {
      reason: "无需继续发布",
    });

    const restored = await service.restoreRevision(operator, created.id, 1, {
      expectedDraftVersion: changed.draftVersion,
    });

    expect(restored.hasUnpublishedChanges).toBe(false);
    expect(restored.currentReview).toBeNull();
    expect((await service.listReviews(operator, created.id)).items).toEqual([
      expect.objectContaining({ id: review.id, status: "rejected" }),
      expect.objectContaining({ resultingRevision: 1, status: "approved" }),
    ]);
    const firstPage = await service.listReviews(operator, created.id, { limit: 1 });
    const secondPage = await service.listReviews(operator, created.id, {
      cursor: firstPage.nextCursor!,
      limit: 1,
    });
    expect(firstPage).toMatchObject({
      items: [expect.objectContaining({ id: review.id })],
      nextCursor: review.id,
    });
    expect(secondPage).toMatchObject({
      items: [expect.objectContaining({ resultingRevision: 1 })],
      nextCursor: null,
    });
  });

  it("keeps an approved review reusable when publication resource checks fail", async () => {
    let workUserId = 201;
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository, {
      sourceIdentityResolver: {
        async resolveActiveSeatWorkUserIds(_uid, seatIds) {
          return new Map(seatIds.map(seatId => [seatId, workUserId]));
        },
      },
    });
    const created = await createConfigured(service);
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    });
    await service.approveReview(operator, created.id, review.id, {});
    workUserId = 202;

    await expect(service.publish(operator, created.id, { reviewId: review.id }))
      .rejects.toMatchObject({ code: "WORKFLOW_REVIEW_RESOURCES_CHANGED", statusCode: 409 });
    await expect(service.getCurrentReview(operator, created.id))
      .resolves.toMatchObject({ id: review.id, status: "approved" });
  });

  it("withdraws a pending review without rewriting earlier approvals when a running Workflow is stopped", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await publishApprovedDraft(service, created.id, created.draftVersion);
    const active = await service.enable(operator, created.id);
    const changed = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(active.draft, { messageSendingWindow: { endTime: "19:00", startTime: "09:00" } }),
      expectedDraftVersion: active.draftVersion,
    });
    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: changed.draftVersion,
    });

    await service.stop(operator, created.id);

    expect(await service.getCurrentReview(operator, created.id)).toBeNull();
    expect((await service.listReviews(operator, created.id)).items).toEqual([
      expect.objectContaining({ id: review.id, status: "withdrawn" }),
      expect.objectContaining({ resultingRevision: 1, status: "approved" }),
    ]);
  });

  it("returns the runtime-ready node kinds used by publish checks", async () => {
    const service = createService();
    const created = await createConfigured(service);

    expect(created.capabilitySummary.runtimeSupportedNodeKinds)
      .toEqual(expect.arrayContaining([
        "start",
        "wait",
        "message-query",
        "tag",
        "customer-update",
        "llm",
        "ai-intent",
        "end",
      ]));
    await expect(service.submitReview(operator, created.id, {
      expectedDraftVersion: created.draftVersion,
    })).resolves.toMatchObject({ status: "pending" });
  });

  it("publishes a complete Tag node into an executable revision", async () => {
    const service = createService();
    const created = await createConfigured(service);
    const configured = await service.saveDraft(operator, created.id, {
      draft: withTagNode(created.draft, { operation: "remove", tagIds: [301, 302] }),
      expectedDraftVersion: created.draftVersion,
    });

    const published = await publishApprovedDraft(
      service,
      created.id,
      configured.draftVersion,
    );

    expect(published.revision.draft.nodes.find(node => node.id === "tag"))
      .toMatchObject({
        data: { kind: "tag", operation: "remove", tagIds: [301, 302] },
        id: "tag",
    });
  });

  it("publishes a complete Customer Update node into an executable revision", async () => {
    const service = createService();
    const created = await createConfigured(service);
    const configured = await service.saveDraft(operator, created.id, {
      draft: withCustomerUpdateNode(created.draft),
      expectedDraftVersion: created.draftVersion,
    });

    const published = await publishApprovedDraft(
      service,
      created.id,
      configured.draftVersion,
    );

    expect(published.revision.draft.nodes.find(node => node.id === "customer-update"))
      .toMatchObject({
        data: {
          fields: [{
            field: { id: 301, key: "remark", title: "客户备注", type: 1 },
            id: "field-1",
            value: { kind: "literal", value: "重点客户" },
          }],
          kind: "customer-update",
        },
        id: "customer-update",
      });
  });

  it("allows runtime-ready LLM nodes in published revisions", async () => {
    const service = createService();
    const configured = await createConfigured(service);
    const saved = await service.saveDraft(operator, configured.id, {
      draft: withPublishableLlmNode(withStartConfig(configured.draft, {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ keywords: ["价格"], type: "message.received" }],
      })),
      expectedDraftVersion: configured.draftVersion,
    });

    await expect(service.submitReview(operator, configured.id, {
      expectedDraftVersion: saved.draftVersion,
    })).resolves.toMatchObject({ status: "pending" });
  });

  it("allows runtime-ready AI Intent nodes in published revisions", async () => {
    const service = createService();
    const configured = await createConfigured(service);
    const saved = await service.saveDraft(operator, configured.id, {
      draft: withAiIntentNode(withStartConfig(configured.draft, {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ keywords: ["退款"], type: "message.received" }],
      })),
      expectedDraftVersion: configured.draftVersion,
    });

    await expect(service.submitReview(operator, configured.id, {
      expectedDraftVersion: saved.draftVersion,
    })).resolves.toMatchObject({ status: "pending" });
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

    await expect(service.submitReview(operator, created.id, {
      expectedDraftVersion: configured.draftVersion,
    })).rejects.toMatchObject({
      code: "WORKFLOW_START_SOURCE_INVALID",
      statusCode: 400,
    });
  });

  it("normalizes rolling entry windows before publication", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const legacyDraft = withStartConfig(created.draft, {
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 365,
        windowUnit: "day",
      },
      seatIds: [101],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
    });

    const seeded = await service.saveDraft(operator, created.id, {
      draft: legacyDraft,
      expectedDraftVersion: created.draftVersion,
    });
    const published = await publishApprovedDraft(service, created.id, seeded.draftVersion);
    const enabled = await service.enable(operator, created.id);
    const [revision] = (await service.listRevisions(operator, created.id)).items;

    expect(getStartEntryPolicy(published.definition.draft)).toMatchObject({ windowSize: 90, windowUnit: "day" });
    expect(getStartEntryPolicy(enabled.draft)).toMatchObject({ windowSize: 90, windowUnit: "day" });
    expect(getStartEntryPolicy(revision!.draft)).toMatchObject({ windowSize: 90, windowUnit: "day" });
  });

  it("publishes immutable revisions after first enable without changing pause state", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await publishApprovedDraft(service, created.id, created.draftVersion);
    await service.enable(operator, created.id);
    const saved = await service.saveDraft(operator, created.id, {
      draft: withStartConfig(created.draft, {
        entryPolicy: { mode: "never" },
        seatIds: [102],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      expectedDraftVersion: created.draftVersion,
    });
    await service.pause(operator, created.id);

    const published = await publishApprovedDraft(service, created.id, saved.draftVersion);

    expect(published.revision.revision).toBe(2);
    expect(published.definition.runtimeStatus).toBe("paused");
  });

  it("does not submit a position-only draft as a new version", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await publishApprovedDraft(service, created.id, created.draftVersion);
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

    await expect(service.submitReview(operator, created.id, {
      expectedDraftVersion: saved.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_NO_UNPUBLISHED_CHANGES", statusCode: 409 });

    expect(saved.hasUnpublishedChanges).toBe(false);
    expect((await service.listRevisions(operator, created.id)).items).toHaveLength(1);
  });

  it("does not submit a viewport-only draft as a new version", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await publishApprovedDraft(service, created.id, created.draftVersion);
    const enabled = await service.enable(operator, created.id);
    const saved = await service.saveDraft(operator, created.id, {
      draft: { ...enabled.draft, viewport: { x: 320, y: 180, zoom: 0.72 } },
      expectedDraftVersion: enabled.draftVersion,
    });

    await expect(service.submitReview(operator, created.id, {
      expectedDraftVersion: saved.draftVersion,
    })).rejects.toMatchObject({ code: "WORKFLOW_NO_UNPUBLISHED_CHANGES", statusCode: 409 });

    expect(saved.hasUnpublishedChanges).toBe(false);
    expect((await service.listRevisions(operator, created.id)).items).toHaveLength(1);
  });

  it("summarizes node title changes without treating edge order or the title as trigger changes", async () => {
    const service = createService();
    const created = await createConfigured(service);
    const configured = await service.saveDraft(operator, created.id, {
      draft: withWaitNode(created.draft, { duration: 2, mode: "duration", unit: "day" }),
      expectedDraftVersion: created.draftVersion,
    });
    await publishApprovedDraft(service, created.id, configured.draftVersion);
    const published = await service.get(operator, created.id);
    const renamedDraft = {
      ...published.draft,
      edges: [...published.draft.edges].reverse(),
      nodes: published.draft.nodes.map(node => node.data.kind === "start"
        ? { ...node, data: { ...node.data, title: "新的开始" } }
        : node),
    };
    const saved = await service.saveDraft(operator, created.id, {
      draft: renamedDraft,
      expectedDraftVersion: published.draftVersion,
    });

    const review = await service.submitReview(operator, created.id, {
      expectedDraftVersion: saved.draftVersion,
    });

    expect(review.changeSummary).toMatchObject({
      changedNodes: [expect.objectContaining({ id: "start", title: "新的开始" })],
      pathChanged: false,
      triggerChanged: false,
    });
  });

  it("creates a new revision when wait configuration changes", async () => {
    const service = createService();
    const created = await service.create(operator, { workflowType: "chatai_sop" });
    const configured = await service.saveDraft(operator, created.id, {
      draft: withWaitNode(withStartConfig(created.draft, {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }), { duration: 2, mode: "duration", unit: "day" }),
      expectedDraftVersion: created.draftVersion,
    });
    await publishApprovedDraft(service, created.id, configured.draftVersion);
    const enabled = await service.enable(operator, created.id);
    const saved = await service.saveDraft(operator, created.id, {
      draft: withWaitConfig(enabled.draft, { duration: 3, mode: "duration", unit: "day" }),
      expectedDraftVersion: enabled.draftVersion,
    });

    const published = await publishApprovedDraft(service, created.id, saved.draftVersion);

    expect(published.revision.revision).toBe(2);
    expect(published.definition.publishedRevision).toBe(2);
    expect((await service.listRevisions(operator, created.id)).items).toHaveLength(2);
    const firstPage = await service.listRevisions(operator, created.id, { limit: 1 });
    const secondPage = await service.listRevisions(operator, created.id, {
      cursor: firstPage.nextCursor!,
      limit: 1,
    });
    expect(firstPage).toMatchObject({ items: [{ revision: 2 }], nextCursor: "2" });
    expect(secondPage).toMatchObject({ items: [{ revision: 1 }], nextCursor: null });
  });

  it("publishes only the current revision trigger bindings after enable", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await createConfigured(service);

    await publishApprovedDraft(service, created.id, created.draftVersion);
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
    await publishApprovedDraft(service, created.id, changed.draftVersion);

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

    await publishApprovedDraft(service, created.id, saved.draftVersion);
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
    await publishApprovedDraft(service, created.id, created.draftVersion);
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
    await publishApprovedDraft(service, created.id, created.draftVersion);
    await service.enable(operator, created.id);
    await service.pause(operator, created.id);

    await expect(service.resume(operator, created.id)).resolves.toMatchObject({ runtimeStatus: "active" });
    await service.stop(operator, created.id);
    await expect(service.resume(operator, created.id)).rejects.toMatchObject({ code: "WORKFLOW_STOPPED" });
    await expect(service.submitReview(operator, created.id, { expectedDraftVersion: created.draftVersion }))
      .rejects.toMatchObject({ code: "WORKFLOW_STOPPED" });
  });

  it("maps the active Workflow limit to a conflict response", async () => {
    const repository = new InMemoryWorkflowRepository();
    const service = createService(repository);
    const created = await createConfigured(service);
    await publishApprovedDraft(service, created.id, created.draftVersion);
    vi.spyOn(repository, "enable").mockResolvedValue({ kind: "active-limit-exceeded" });

    await expect(service.enable(operator, created.id)).rejects.toMatchObject({
      code: "WORKFLOW_ACTIVE_LIMIT_EXCEEDED",
      statusCode: 409,
    });
  });

  it("allows only layout changes after a workflow is stopped", async () => {
    const service = createService();
    const created = await createConfigured(service);
    await publishApprovedDraft(service, created.id, created.draftVersion);
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
    expect(moved.hasUnpublishedChanges).toBe(false);

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
    await publishApprovedDraft(service, created.id, created.draftVersion);
    await service.enable(operator, created.id);
    const stopped = await service.stop(operator, created.id);
    const legacyDraft = withStartConfig(stopped.draft, {
      entryPolicy: { maxEntries: 1_000, mode: "lifetime_limit" },
    });
    const seeded = await repository.saveDraft({
      draft: legacyDraft,
      draftSemanticHash: "legacy-stopped-draft",
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
    expect(await service.list(operator, { limit: 20, status: "all" })).toMatchObject({
      items: [],
      nextCursor: null,
    });
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
    await publishApprovedDraft(service, created.id, created.draftVersion);
    await service.enable(operator, created.id);

    const restored = await service.restoreRevision(operator, created.id, 1, {
      expectedDraftVersion: created.draftVersion,
    });

    expect(restored.draftVersion).toBe(created.draftVersion + 1);
    expect(restored.hasUnpublishedChanges).toBe(false);
    expect((await service.listRevisions(operator, created.id)).items).toHaveLength(1);
  });
});

function createService(
  repository = new InMemoryWorkflowRepository(),
  options: ConstructorParameters<typeof WorkflowService>[1] = {},
) {
  return new WorkflowService(repository, {
    entitlementPort: {
      check: async () => ({ activeRunLimit: 10_000, entitled: true, unentitledSince: null }),
    },
    sourceIdentityResolver: {
      async resolveActiveSeatWorkUserIds(_uid, seatIds) {
        return new Map(seatIds.map(seatId => [seatId, seatId + 100]));
      },
    },
    ...options,
  });
}

async function publishApprovedDraft(
  service: WorkflowService,
  workflowId: string,
  expectedDraftVersion: number,
) {
  const review = await service.submitReview(operator, workflowId, { expectedDraftVersion });
  await service.approveReview(operator, workflowId, review.id, {});
  return service.publish(operator, workflowId, { reviewId: review.id });
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
    triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
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
      reasoningEffort: "medium",
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

function withAiIntentNode(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
  sourceKind: "message-query" | "wait-event" = "message-query",
) {
  const sourceNodeId = sourceKind === "wait-event" ? "wait-event-1" : "message-query-1";
  const sourceOutputKey = sourceKind === "wait-event" ? "message" : "messages";
  const intentNode = {
    data: {
      advancedEnabled: false,
      inputSelector: ["node", sourceNodeId, sourceOutputKey] as [string, string, string],
      intents: [{ description: "咨询退款", id: "refund" }],
      kind: "ai-intent" as const,
      label: "意图识别",
      metric: "",
      prompt: "",
      schemaVersion: 1,
      status: "ready" as const,
      title: "意图识别",
    },
    id: "ai-intent-1",
    position: { x: 340, y: 240 },
    type: "workflowNode",
  };
  const sourceNode = sourceKind === "wait-event"
    ? {
        data: {
          delay: { duration: 30, unit: "second" as const },
          event: { type: "message.received" as const },
          kind: "wait-event" as const,
          label: "等待事件",
          metric: "等待新消息 · 达到后等待 30 秒 · 最长 24 小时",
          schemaVersion: 1,
          status: "ready" as const,
          timeout: { duration: 24, unit: "hour" as const },
          title: "等待事件",
        },
        id: sourceNodeId,
        position: { x: 170, y: 240 },
        type: "workflowNode",
      }
    : {
        data: {
          kind: "message-query" as const,
          label: "消息查询",
          limit: 10,
          metric: "最新 10 条消息",
          schemaVersion: 1,
          status: "ready" as const,
          take: "latest" as const,
          timeRange: {
            end: ["current-node-lifecycle", "enteredAt"] as [string, string],
            mode: "dynamic" as const,
            start: ["trigger", "occurredAt"] as [string, string],
          },
          title: "消息查询",
        },
        id: sourceNodeId,
        position: { x: 170, y: 240 },
        type: "workflowNode",
      };
  return {
    ...draft,
    edges: [
      {
        id: "edge-start-query",
        source: "start",
        target: sourceNodeId,
        type: "workflowEdge",
      },
      {
        id: "edge-query-intent",
        source: sourceNodeId,
        ...(sourceKind === "wait-event" ? { sourceHandle: "triggered" } : {}),
        target: "ai-intent-1",
        type: "workflowEdge",
      },
      {
        id: "edge-intent-refund",
        source: "ai-intent-1",
        sourceHandle: "intent:refund",
        target: "end",
        type: "workflowEdge",
      },
      {
        id: "edge-intent-fallback",
        source: "ai-intent-1",
        sourceHandle: "fallback",
        target: "end",
        type: "workflowEdge",
      },
    ],
    nodes: [
      ...draft.nodes.filter(node => node.id !== "end"),
      sourceNode,
      intentNode,
      draft.nodes.find(node => node.id === "end")!,
    ],
  };
}

function withPublishableLlmNode(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
) {
  const next = withLlmNode(draft);
  return {
    ...next,
    nodes: next.nodes.map(node => node.id === "llm-1"
      ? {
          ...node,
          data: {
            ...node.data,
            inputs: [
              {
                id: "input-message",
                name: "message",
                value: { kind: "literal" as const, value: "请处理这个客户" },
              },
              {
                id: "input-tone",
                name: "tone",
                value: { kind: "literal" as const, value: "简洁" },
              },
            ],
          },
        }
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

function withTagNode(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
  config: { operation: "add" | "remove"; tagIds: number[] },
) {
  return {
    ...draft,
    edges: [
      { id: "start-tag", source: "start", target: "tag", type: "workflowEdge" },
      { id: "tag-end", source: "tag", target: "end", type: "workflowEdge" },
    ],
    nodes: [
      ...draft.nodes.filter(node => node.id !== "end"),
      {
        data: {
          ...config,
          kind: "tag" as const,
          label: "客户打标",
          metric: "",
          schemaVersion: 1,
          status: "ready" as const,
          title: "客户打标",
        },
        id: "tag",
        position: { x: 340, y: 240 },
        selected: false,
        type: "workflowNode",
      },
      ...draft.nodes.filter(node => node.id === "end"),
    ],
  };
}

function withCustomerUpdateNode(
  draft: Awaited<ReturnType<WorkflowService["create"]>>["draft"],
) {
  return {
    ...draft,
    edges: [
      {
        id: "start-customer-update",
        source: "start",
        target: "customer-update",
        type: "workflowEdge",
      },
      {
        id: "customer-update-end",
        source: "customer-update",
        target: "end",
        type: "workflowEdge",
      },
    ],
    nodes: [
      ...draft.nodes.filter(node => node.id !== "end"),
      {
        data: {
          fields: [{
            field: { id: 301, key: "remark", title: "客户备注", type: 1 as const },
            id: "field-1",
            value: { kind: "literal" as const, value: "重点客户" },
          }],
          kind: "customer-update" as const,
          label: "更新客户信息",
          metric: "",
          schemaVersion: 1,
          status: "ready" as const,
          title: "更新客户信息",
        },
        id: "customer-update",
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

function reorderObjectKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reorderObjectKeys) as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, nested]) => [
    key,
    reorderObjectKeys(nested),
  ])) as T;
}
