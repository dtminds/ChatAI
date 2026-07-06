import type { Kysely } from "kysely";
import fp from "fastify-plugin";
import { createDatabase } from "../db/mysql.js";
import type { Database } from "../db/schema.js";
import { WorkbenchRepository } from "../modules/chat/workbench-repository.js";
import { MysqlWorkbenchService, type WorkbenchService } from "../modules/chat/workbench.service.js";
import { createWorkbenchJavaClient } from "../modules/chat/workbench-java-client.js";
import type { AppLogger } from "../shared/logger.js";
import type { AuthenticatedWorkbenchScope } from "../modules/workbench-platform-scope.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Kysely<Database>;
    createWorkbenchService(
      logger?: AppLogger,
      scope?: AuthenticatedWorkbenchScope,
    ): WorkbenchService;
    workbenchService: WorkbenchService;
  }
}

export const dbPlugin = fp(async (app) => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    const errorMessage = "DATABASE_URL must be configured";
    app.log.error(errorMessage);
    throw new Error(errorMessage);
  }

  const db = createDatabase(databaseUrl);
  const repository = new WorkbenchRepository(db, app.cache, app.cacheKeys);
  const createService = (
    logger: AppLogger = app.log,
    scope?: AuthenticatedWorkbenchScope,
  ) =>
    new MysqlWorkbenchService(
      repository,
      createWorkbenchJavaClient(logger),
      logger,
      undefined,
      scope,
    );

  app.decorate("db", db);
  app.decorate("createWorkbenchService", createService);
  app.decorate("workbenchService", createService(app.log));
  app.addHook("onClose", async () => {
    await db.destroy();
  });
});
