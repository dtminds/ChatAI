import Fastify from "fastify";
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

  it("updates workflow metadata and keeps descriptions through the legacy name route", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: {},
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
      payload: {},
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
          end: { field: "enteredAt", kind: "current-node-lifecycle" },
          mode: "dynamic",
          start: { field: "occurredAt", kind: "workflow-trigger" },
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

  it("saves drafts containing frontend-only wait event nodes", async () => {
    const app = await createApp("owner");
    const created = (await app.inject({
      method: "POST",
      payload: {},
      url: "/api/server/workflows",
    })).json().data;
    const waitEventNode = {
      data: {
        event: { type: "customer.message.received" },
        kind: "wait-event",
        label: "等待事件",
        metric: "等待新消息 · 最长 24 小时",
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

  it("serves the control-plane lifecycle to owners and admins", async () => {
    const app = await createApp("owner");

    const created = await app.inject({
      method: "POST",
      payload: { name: "新客培育" },
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

    const validated = await app.inject({
      method: "POST",
      payload: { expectedDraftVersion: 2 },
      url: `/api/server/workflows/${definition.id}/publish`,
    });
    expect(validated.json().data).toMatchObject({ revision: null, validatedOnly: true });

    const enabled = await app.inject({
      method: "POST",
      url: `/api/server/workflows/${definition.id}/enable`,
    });
    expect(enabled.json().data).toMatchObject({ publishedRevision: 1, runtimeStatus: "active" });

    const revisions = await app.inject({
      method: "GET",
      url: `/api/server/workflows/${definition.id}/revisions`,
    });
    expect(revisions.json().data).toHaveLength(1);
  });

  it("rejects non-admin roles and hides logically deleted definitions", async () => {
    const operatorApp = await createApp("operator");
    const forbidden = await operatorApp.inject({ method: "GET", url: "/api/server/workflows" });
    expect(forbidden.statusCode).toBe(403);

    const ownerApp = await createApp("admin");
    const created = await ownerApp.inject({ method: "POST", payload: {}, url: "/api/server/workflows" });
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
      service: new WorkflowService(new InMemoryWorkflowRepository()),
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
              accountIds: ["account-a"],
              entryPolicy: { mode: "never" },
              triggers: [{ type: "contact.friend_added" }],
            },
          }
        : node),
      viewport: { x: 10, y: 20, zoom: 1 },
    };
  }
});
