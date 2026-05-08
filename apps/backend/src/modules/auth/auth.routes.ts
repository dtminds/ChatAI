import { apiError } from "@chatai/contracts";
import type { FastifyInstance } from "fastify";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (_request, reply) =>
    reply.code(501).send(apiError("NOT_IMPLEMENTED", "登录接口尚未实现")),
  );
  app.post("/api/auth/refresh", async (_request, reply) =>
    reply.code(501).send(apiError("NOT_IMPLEMENTED", "刷新登录接口尚未实现")),
  );
  app.post("/api/auth/logout", async (_request, reply) =>
    reply.code(501).send(apiError("NOT_IMPLEMENTED", "退出登录接口尚未实现")),
  );
}
