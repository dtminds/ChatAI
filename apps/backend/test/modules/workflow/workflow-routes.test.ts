import Fastify from "fastify";
import { InMemoryWorkflowLlmTestAttemptRepository } from "@chatai/workflow-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { registerErrorHandler } from "../../../src/plugins/error-handler.js";
import {
  InMemoryWorkflowRepository,
  registerWorkflowRoutes,
  WorkflowService,
} from "../../../src/modules/workflow/index.js";

describe("workflow routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("paginates the Workflow list and returns list-only fields", async () => {
    const app = await createApp("owner");
    for (const name of ["第一个 Workflow", "第二个 Workflow"]) {
      await app.inject({
        method: "POST",
        payload: { name, workflowType: "chatai_sop" },
        url: "/api/server/workflows",
      });
    }

    const firstPage = await app.inject({
      method: "GET",
      url: "/api/server/workflows?limit=1",
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().data).toMatchObject({
      items: [expect.objectContaining({ name: "第二个 Workflow" })],
      nextCursor: expect.any(String),
      total: 2,
    });
    expect(firstPage.json().data.items[0]).not.toHaveProperty("draft");
    expect(firstPage.json().data.items[0]).not.toHaveProperty("currentReview");

    const secondPage = await app.inject({
      method: "GET",
      url: `/api/server/workflows?limit=1&cursor=${encodeURIComponent(firstPage.json().data.nextCursor)}`,
    });
    expect(secondPage.json().data).toMatchObject({
      items: [expect.objectContaining({ name: "第一个 Workflow" })],
      nextCursor: null,
      total: 2,
    });
  });

  it("returns only the direct-entry endpoint key for an accessible Workflow", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    })).json().data;

    const response = await app.inject({
      method: "GET",
      url: `/api/server/workflows/${created.id}/direct-entry-endpoint`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { endpointKey: "test.endpoint-key" },
      success: true,
    });
  });

  it("updates workflow metadata and keeps descriptions through the legacy name route", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    })).json().data;

    const metadataResponse = await app.inject({
      method: "PATCH",
      payload: { description: "引导新客完成首购", name: "新客首购旅程" },
      url: `/api/server/workflows/${created.id}/metadata`,
    });
    expect(metadataResponse.statusCode).toBe(200);
    expect(metadataResponse.json().data).toMatchObject({
      description: "引导新客完成首购",
      name: "新客首购旅程",
    });

    const renameResponse = await app.inject({
      method: "PATCH",
      payload: { name: "首购旅程" },
      url: `/api/server/workflows/${created.id}/name`,
    });
    expect(renameResponse.json().data).toMatchObject({
      description: "引导新客完成首购",
      name: "首购旅程",
    });
  });

  it("saves drafts containing frontend-only message query nodes", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    })).json().data;
    const messageQueryNode = {
      data: {
        kind: "message-query",
        label: "消息查询",
        limit: 10,
        metric: "最新 10 条消息",
        schemaVersion: 1,
        status: "ready",
        take: "latest",
        timeRange: {
          end: ["current-node-lifecycle", "enteredAt"],
          mode: "dynamic",
          start: ["trigger", "occurredAt"],
        },
        title: "消息查询",
      },
      id: "message-query-1",
      position: { x: 360, y: 240 },
      type: "workflowNode",
    };
    const draft = {
      ...created.draft,
      edges: [
        { id: "edge-start-message-query-1", source: "start", target: messageQueryNode.id, type: "workflowEdge" },
        { id: "edge-message-query-1-end", source: messageQueryNode.id, target: "end", type: "workflowEdge" },
      ],
      nodes: [
        ...created.draft.nodes.filter((node: { id: string }) => node.id !== "end"),
        messageQueryNode,
        created.draft.nodes.find((node: { id: string }) => node.id === "end"),
      ],
    };

    const saved = await app.inject({
      method: "PUT",
      payload: { draft, expectedDraftVersion: created.draftVersion },
      url: `/api/server/workflows/${created.id}/draft`,
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.draft.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ kind: "message-query" }) }),
    ]));
  });

  it("saves drafts containing wait event nodes", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    })).json().data;
    const waitEventNode = {
      data: {
        delay: { duration: 30, unit: "second" },
        event: { type: "message.received" },
        kind: "wait-event",
        label: "等待事件",
        metric: "等待新消息 · 达到后等待 30 秒 · 最长 24 小时",
        schemaVersion: 1,
        status: "ready",
        timeout: { duration: 24, unit: "hour" },
        title: "等待事件",
      },
      id: "wait-event-1",
      position: { x: 360, y: 240 },
      type: "workflowNode",
    };
    const draft = {
      ...created.draft,
      edges: [
        { id: "edge-start-wait-event-1", source: "start", target: waitEventNode.id, type: "workflowEdge" },
        {
          id: "edge-wait-event-1-triggered-end",
          source: waitEventNode.id,
          sourceHandle: "triggered",
          target: "end",
          type: "workflowEdge",
        },
        {
          id: "edge-wait-event-1-timeout-end",
          source: waitEventNode.id,
          sourceHandle: "timeout",
          target: "end",
          type: "workflowEdge",
        },
      ],
      nodes: [
        ...created.draft.nodes.filter((node: { id: string }) => node.id !== "end"),
        waitEventNode,
        created.draft.nodes.find((node: { id: string }) => node.id === "end"),
      ],
    };

    const saved = await app.inject({
      method: "PUT",
      payload: { draft, expectedDraftVersion: created.draftVersion },
      url: `/api/server/workflows/${created.id}/draft`,
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json().data.draft).toMatchObject({
      edges: expect.arrayContaining([
        expect.objectContaining({ sourceHandle: "triggered" }),
        expect.objectContaining({ sourceHandle: "timeout" }),
      ]),
      nodes: expect.arrayContaining([
        expect.objectContaining({ data: expect.objectContaining({ kind: "wait-event" }) }),
      ]),
    });
  });

  it("creates and reads one LLM test Attempt without exposing a history endpoint", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    })).json().data;
    const saved = (await app.inject({
      method: "PUT",
      payload: { draft: withLlmNode(created.draft), expectedDraftVersion: created.draftVersion },
      url: `/api/server/workflows/${created.id}/draft`,
    })).json().data;

    const started = await app.inject({
      method: "POST",
      payload: {
        expectedDraftVersion: saved.draftVersion,
        inputValues: { "input-message": "退款什么时候到账" },
      },
      url: `/api/server/workflows/${created.id}/nodes/llm-1/llm-test-attempts`,
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().data).toMatchObject({
      executionMode: "real",
      inputValues: { "input-message": "退款什么时候到账" },
      nodeId: "llm-1",
      output: null,
      status: "running",
      workflowId: created.id,
    });

    const read = await app.inject({
      method: "GET",
      url: `/api/server/workflows/${created.id}/nodes/llm-1/llm-test-attempts/${started.json().data.attemptId}`,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data).toEqual(started.json().data);

    const stopped = await app.inject({
      method: "POST",
      url: `/api/server/workflows/${created.id}/nodes/llm-1/llm-test-attempts/${started.json().data.attemptId}/cancel`,
    });
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().data).toMatchObject({
      attemptId: started.json().data.attemptId,
      status: "cancelled",
    });
    expect((await app.inject({
      method: "GET",
      url: `/api/server/workflows/${created.id}/nodes/llm-1/llm-test-attempts`,
    })).statusCode).toBe(404);
  });

  it("returns 400 when LLM test inputs cannot produce a valid inference request", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    })).json().data;
    const saved = (await app.inject({
      method: "PUT",
      payload: { draft: withLlmNode(created.draft), expectedDraftVersion: created.draftVersion },
      url: `/api/server/workflows/${created.id}/draft`,
    })).json().data;

    const response = await app.inject({
      method: "POST",
      payload: {
        expectedDraftVersion: saved.draftVersion,
        inputValues: { "input-message": "x".repeat(25_000) },
      },
      url: `/api/server/workflows/${created.id}/nodes/llm-1/llm-test-attempts`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("WORKFLOW_LLM_TEST_INPUT_INVALID");
  });

  it("creates and reads an AI Intent test Attempt through its dedicated endpoint", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    })).json().data;
    const saved = (await app.inject({
      method: "PUT",
      payload: {
        draft: withAiIntentNode(created.draft),
        expectedDraftVersion: created.draftVersion,
      },
      url: `/api/server/workflows/${created.id}/draft`,
    })).json().data;

    const started = await app.inject({
      method: "POST",
      payload: { expectedDraftVersion: saved.draftVersion, inputValue: [] },
      url: `/api/server/workflows/${created.id}/nodes/ai-intent-1/ai-intent-test-attempts`,
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().data).toMatchObject({
      inputValues: { inputValue: [] },
      nodeId: "ai-intent-1",
      status: "running",
    });

    const read = await app.inject({
      method: "GET",
      url: `/api/server/workflows/${created.id}/nodes/ai-intent-1/ai-intent-test-attempts/${started.json().data.attemptId}`,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.attemptId).toBe(started.json().data.attemptId);
  });

  it("serves the control-plane lifecycle to owners and admins", async () => {
    const app = await createApp("owner");

    const created = await app.inject({
      method: "POST",
      payload: { name: "新客培育", workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    });
    expect(created.statusCode).toBe(200);
    const definition = created.json().data;

    const saved = await app.inject({
      method: "PUT",
      payload: {
        draft: configuredDraft(definition.draft),
        expectedDraftVersion: 1,
      },
      url: `/api/server/workflows/${definition.id}/draft`,
    });
    expect(saved.json().data.draftVersion).toBe(2);

    const submitted = await app.inject({
      method: "POST",
      payload: { expectedDraftVersion: 2 },
      url: `/api/server/workflows/${definition.id}/reviews`,
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().data).toMatchObject({ status: "pending" });

    const approved = await app.inject({
      method: "POST",
      payload: {},
      url: `/api/server/workflows/${definition.id}/reviews/${submitted.json().data.id}/approve`,
    });
    expect(approved.json().data).toMatchObject({ status: "approved" });

    const published = await app.inject({
      method: "POST",
      payload: { reviewId: submitted.json().data.id },
      url: `/api/server/workflows/${definition.id}/publish`,
    });
    expect(published.json().data).toMatchObject({
      definition: { publishedRevision: 1, runtimeStatus: "inactive" },
      revision: { revision: 1 },
    });

    const enabled = await app.inject({
      method: "POST",
      url: `/api/server/workflows/${definition.id}/enable`,
    });
    expect(enabled.json().data).toMatchObject({ publishedRevision: 1, runtimeStatus: "active" });

    const revisions = await app.inject({
      method: "GET",
      url: `/api/server/workflows/${definition.id}/revisions`,
    });
    expect(revisions.json().data).toMatchObject({
      items: [expect.objectContaining({ revision: 1 })],
      nextCursor: null,
    });
    const revisionDetail = await app.inject({
      method: "GET",
      url: `/api/server/workflows/${definition.id}/revisions/1`,
    });
    expect(revisionDetail.json().data).toMatchObject({ revision: 1 });
    const reviews = await app.inject({
      method: "GET",
      url: `/api/server/workflows/${definition.id}/reviews`,
    });
    expect(reviews.json().data).toMatchObject({
      items: [expect.objectContaining({ resultingRevision: 1, status: "approved" })],
      nextCursor: null,
    });
  });

  it("restores an unpublished review snapshot through the review route", async () => {
    const app = await createApp("admin");
    const created = await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    });
    const definition = created.json().data;
    const configured = configuredDraft(definition.draft);
    const saved = await app.inject({
      method: "PUT",
      payload: { draft: configured, expectedDraftVersion: definition.draftVersion },
      url: `/api/server/workflows/${definition.id}/draft`,
    });
    const submitted = await app.inject({
      method: "POST",
      payload: { expectedDraftVersion: saved.json().data.draftVersion },
      url: `/api/server/workflows/${definition.id}/reviews`,
    });
    await app.inject({
      method: "POST",
      payload: {},
      url: `/api/server/workflows/${definition.id}/reviews/${submitted.json().data.id}/approve`,
    });
    const changed = await app.inject({
      method: "PUT",
      payload: {
        draft: {
          ...configured,
          nodes: configured.nodes.map((node: { data: { title: string }; id: string }) => node.id === "start"
            ? { ...node, data: { ...node.data, title: "审核后修改" } }
            : node),
        },
        expectedDraftVersion: saved.json().data.draftVersion,
      },
      url: `/api/server/workflows/${definition.id}/draft`,
    });

    const restored = await app.inject({
      method: "POST",
      payload: { expectedDraftVersion: changed.json().data.draftVersion },
      url: `/api/server/workflows/${definition.id}/reviews/${submitted.json().data.id}/restore`,
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json().data.currentReview).toMatchObject({
      id: submitted.json().data.id,
      status: "approved",
    });
  });

  it("rejects non-admin roles and hides logically deleted definitions", async () => {
    const operatorApp = await createApp("operator");
    const forbidden = await operatorApp.inject({ method: "GET", url: "/api/server/workflows" });
    expect(forbidden.statusCode).toBe(403);

    const ownerApp = await createApp("admin");
    const created = await ownerApp.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    });
    const workflowId = created.json().data.id;
    expect((await ownerApp.inject({
      method: "DELETE",
      url: `/api/server/workflows/${workflowId}`,
    })).statusCode).toBe(200);
    expect((await ownerApp.inject({
      method: "GET",
      url: `/api/server/workflows/${workflowId}`,
    })).statusCode).toBe(404);
  });

  it("keeps embedded Workflow routes scoped to WeCom SOPs", async () => {
    const app = await createApp("owner");
    const chat = await app.inject({
      method: "POST",
      payload: { workflowType: "chatai_sop" },
      url: "/api/server/workflows",
    });
    const wecom = await app.inject({
      method: "POST",
      payload: { workflowType: "wecom_sop" },
      url: "/api/server/embed/workflows",
    });
    expect(chat.statusCode).toBe(200);
    expect(wecom.statusCode).toBe(200);

    const embedList = await app.inject({ method: "GET", url: "/api/server/embed/workflows" });
    expect(embedList.json().data.items).toHaveLength(1);
    expect(embedList.json().data.items[0].workflowType).toBe("wecom_sop");
    expect((await app.inject({
      method: "GET",
      url: `/api/server/embed/workflows/${chat.json().data.id}`,
    })).statusCode).toBe(404);
    expect((await app.inject({
      method: "GET",
      url: `/api/server/workflows/${wecom.json().data.id}`,
    })).statusCode).toBe(404);
    expect((await app.inject({
      method: "PATCH",
      payload: { description: "跨入口修改", name: "跨入口修改" },
      url: `/api/server/embed/workflows/${chat.json().data.id}/metadata`,
    })).statusCode).toBe(404);
  });

  async function createApp(role: string) {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerErrorHandler(app);
    app.decorate("authenticate", async (request) => {
      request.user = {
        roles: [role],
        sessionId: "session-1",
        sessionVersion: 1,
        subUserId: "17",
        uid: 9,
      };
    });
    await registerWorkflowRoutes(app, {
      service: new WorkflowService(new InMemoryWorkflowRepository(), {
        directEntryEndpointPort: {
          getEndpointKey: async () => "test.endpoint-key",
        },
        entitlementPort: {
          check: async () => ({ activeRunLimit: 10_000, entitled: true, unentitledSince: null }),
        },
        sourceIdentityResolver: {
          async resolveActiveSeatWorkUserIds(_uid, seatIds) {
            return new Map(seatIds.map(seatId => [seatId, seatId + 100]));
          },
        },
        llmTestAttemptRepository: new InMemoryWorkflowLlmTestAttemptRepository(),
      }),
    });
    return app;
  }

  function configuredDraft(draft: { nodes: Array<{ data: Record<string, unknown>; id: string }>; viewport: unknown }) {
    return {
      ...draft,
      nodes: draft.nodes.map(node => node.id === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              entryPolicy: { mode: "never" },
              seatIds: [101],
              triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
            },
          }
        : node),
      viewport: { x: 10, y: 20, zoom: 1 },
    };
  }

  function withLlmNode(draft: { edges: unknown[]; nodes: Array<{ id: string }>; viewport: unknown }) {
    const llmNode = {
      data: {
        inputs: [{
          id: "input-message",
          name: "message",
          value: {
            kind: "variable",
            selector: ["trigger", "text"],
            valueType: { kind: "string" },
          },
        }],
        kind: "llm",
        label: "大模型",
        metric: "model-1",
        modelId: "model-1",
        reasoningEffort: "medium",
        output: {
          field: { description: "", id: "output-1", name: "output", type: "string" },
          format: "text",
        },
        schemaVersion: 1,
        status: "ready",
        systemPrompt: [{ type: "text", value: "Summarize" }],
        title: "大模型",
        userPrompt: [{ selector: ["input", "input-message"], type: "variable" }],
      },
      id: "llm-1",
      position: { x: 360, y: 240 },
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
        draft.nodes.find(node => node.id === "end"),
      ],
    };
  }

  function withAiIntentNode(
    draft: { edges: unknown[]; nodes: Array<{ id: string }>; viewport: unknown },
  ) {
    const queryNode = {
      data: {
        kind: "message-query",
        label: "消息查询",
        limit: 10,
        metric: "最新 10 条消息",
        schemaVersion: 1,
        status: "ready",
        take: "latest",
        timeRange: {
          end: ["current-node-lifecycle", "enteredAt"],
          mode: "dynamic",
          start: ["trigger", "occurredAt"],
        },
        title: "消息查询",
      },
      id: "message-query-1",
      position: { x: 180, y: 240 },
      type: "workflowNode",
    };
    const intentNode = {
      data: {
        advancedEnabled: false,
        inputSelector: ["node", "message-query-1", "messages"],
        intents: [{ description: "咨询退款", id: "refund" }],
        kind: "ai-intent",
        label: "意图识别",
        metric: "",
        prompt: "",
        schemaVersion: 1,
        status: "ready",
        title: "意图识别",
      },
      id: "ai-intent-1",
      position: { x: 360, y: 240 },
      type: "workflowNode",
    };
    return {
      ...draft,
      edges: [
        { id: "edge-start-query", source: "start", target: queryNode.id, type: "workflowEdge" },
        { id: "edge-query-intent", source: queryNode.id, target: intentNode.id, type: "workflowEdge" },
        { id: "edge-intent-end", source: intentNode.id, sourceHandle: "fallback", target: "end", type: "workflowEdge" },
      ],
      nodes: [
        ...draft.nodes.filter(node => node.id !== "end"),
        queryNode,
        intentNode,
        draft.nodes.find(node => node.id === "end"),
      ],
    };
  }
});
