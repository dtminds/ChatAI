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
