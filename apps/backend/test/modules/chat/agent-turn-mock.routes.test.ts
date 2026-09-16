import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAgentTurnMockRoutes } from "../../../src/modules/chat/agent-turn-mock.routes";
import { AgentTurnMockService } from "../../../src/modules/chat/agent-turn-mock.service";
import type { WorkbenchService } from "../../../src/modules/chat/workbench.service";

describe("agent turn mock routes", () => {
  it("serves the mock loop as an authenticated SSE stream", async () => {
    const app = Fastify();
    const assertConversationOperable = vi.fn();
    app.decorate("authenticate", async (request) => {
      request.user = {
        roles: ["operator"],
        subUserId: "101",
        uid: 9001,
      } as typeof request.user;
    });
    app.decorate("workbenchService", {
      assertConversationOperable,
    } as WorkbenchService);
    await registerAgentTurnMockRoutes(app, new AgentTurnMockService());

    try {
      const started = await app.inject({
        method: "POST",
        payload: {
          conversationId: "144",
          mock: { scenario: "order_reply", stepDelayMs: 0 },
          trigger: { messageId: "7003", type: "customer_message" },
        },
        url: "/api/server/agent-turns",
      });
      expect(started.statusCode).toBe(200);
      expect(assertConversationOperable).toHaveBeenCalledWith("101", "144");

      const { turnId } = started.json<{ turnId: string }>();
      const stream = await app.inject({
        method: "GET",
        url: `/api/server/agent-turns/${turnId}/events`,
      });

      expect(stream.statusCode).toBe(200);
      expect(stream.headers["content-type"]).toContain("text/event-stream");
      const events = stream.body
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)) as { event: { type: string } });
      expect(events[0]?.event.type).toBe("turn.started");
      expect(events.at(-1)?.event.type).toBe("turn.completed");

      const latest = await app.inject({
        method: "GET",
        url: "/api/server/conversations/144/agent-turns/latest",
      });
      expect(latest.statusCode).toBe(200);
      expect(latest.json()).toMatchObject({
        status: "completed",
        turnId,
      });
      expect(latest.json<{ events: unknown[] }>().events).toHaveLength(
        events.length,
      );
    } finally {
      await app.close();
    }
  });
});
