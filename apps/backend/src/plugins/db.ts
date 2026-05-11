import type { Kysely } from "kysely";
import fp from "fastify-plugin";
import { createDatabase } from "../db/mysql.js";
import type { Database } from "../db/schema.js";
import { WorkbenchRepository } from "../modules/chat/workbench-repository.js";
import { MysqlWorkbenchService, type WorkbenchService } from "../modules/chat/workbench.service.js";
import { createWorkbenchJavaClient } from "../modules/chat/workbench-java-client.js";

declare module "fastify" {
  interface FastifyInstance {
    db?: Kysely<Database>;
    workbenchService?: WorkbenchService;
  }
}

export const dbPlugin = fp(async (app) => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    app.log.warn("DATABASE_URL is not configured; database plugin is disabled");
    return;
  }

  const db = createDatabase(databaseUrl);
  app.decorate("db", db);
  app.decorate(
    "workbenchService",
    new MysqlWorkbenchService(
      new WorkbenchRepository(db),
      createWorkbenchJavaClient(),
    ),
  );
  app.addHook("onClose", async () => {
    await db.destroy();
  });
});
