import type { Kysely } from "kysely";
import { assertDatabaseUtc8Timezone } from "./database-timezone.js";
import type { Database } from "./schema.js";

export type SchemaCheckResult = {
  configured: boolean;
  ok: boolean;
  reason?: string;
};

const timezoneVerifiedDatabases = new WeakSet<object>();

export async function checkSchema(db: Kysely<Database>): Promise<SchemaCheckResult> {
  await db.selectNoFrom((expressionBuilder) =>
    expressionBuilder.val(1).as("schema_check"),
  ).executeTakeFirstOrThrow();

  if (!timezoneVerifiedDatabases.has(db)) {
    await assertDatabaseUtc8Timezone(db);
    timezoneVerifiedDatabases.add(db);
  }

  return {
    configured: true,
    ok: true,
  };
}
