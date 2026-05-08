import type { Kysely } from "kysely";
import fp from "fastify-plugin";
import { createDatabase } from "../db/mysql.js";
import type { Database } from "../db/schema.js";

declare module "fastify" {
  interface FastifyInstance {
    db?: Kysely<Database>;
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
  app.addHook("onClose", async () => {
    await db.destroy();
  });
});
