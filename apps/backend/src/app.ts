import fastifyCookie from "@fastify/cookie";
import Fastify from "fastify";
import { checkSchema } from "./db/schema-check.js";
import { registerAgentLearningRoutes } from "./modules/ai-hosting/agent-learning.routes.js";
import { registerKbAttachmentRoutes } from "./modules/ai-hosting/kb-attachment.routes.js";
import { registerKbChunkRoutes } from "./modules/ai-hosting/kb-chunk.routes.js";
import { registerAiHostingRoutes as registerKbDocRoutes } from "./modules/ai-hosting/kb-doc.routes.js";
import { registerKbRoutes } from "./modules/ai-hosting/kb.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerAiHostingRoutes } from "./modules/ai-hosting/ai-hosting.routes.js";
import { registerUserMemoryRoutes } from "./modules/ai-hosting/user-memory/user-memory.routes.js";
import { registerChatRoutes } from "./modules/chat/chat.routes.js";
import { registerInsightsRoutes } from "./modules/insights/insights.routes.js";
import { registerInsightsWorkerObservabilityRoutes } from "./modules/insights/insights-worker-observability.routes.js";
import { registerSettingsRoutes } from "./modules/settings/settings.routes.js";
import { validateBackendEnv } from "./config/env.js";
import { authPlugin } from "./plugins/auth.js";
import { dbPlugin } from "./plugins/db.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { redisPlugin } from "./plugins/redis.js";

export async function buildApp() {
  const { workerObserverSubjects } = validateBackendEnv();

  const app = Fastify({
    disableRequestLogging: shouldDisableRequestLogging,
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await registerErrorHandler(app);
  await app.register(fastifyCookie);
  await app.register(redisPlugin);
  await app.register(dbPlugin);
  await app.register(authPlugin);

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => {
    const database = await checkSchema(app.db);

    return {
      database,
      status: database.ok ? "ready" : "not-ready",
    };
  });

  await registerAuthRoutes(app);
  await registerAiHostingRoutes(app);
  await registerAgentLearningRoutes(app);
  await registerUserMemoryRoutes(app);
  await registerKbDocRoutes(app);
  await registerKbChunkRoutes(app);
  await registerKbAttachmentRoutes(app);
  await registerKbRoutes(app);
  await registerChatRoutes(app);
  await registerInsightsRoutes(app, workerObserverSubjects);
  await registerInsightsWorkerObservabilityRoutes(app, workerObserverSubjects);
  await registerSettingsRoutes(app);

  return app;
}

export function shouldDisableRequestLogging(request: { url: string }) {
  return request.url.startsWith("/api/server/media/playable-voice")
    || request.url.startsWith("/api/server/insights/worker-observability");
}
