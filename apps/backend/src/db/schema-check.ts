import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

export type SchemaCheckResult = {
  configured: boolean;
  ok: boolean;
  reason?: string;
};

export async function checkSchema(db: Kysely<Database>): Promise<SchemaCheckResult> {
  await db.selectNoFrom((expressionBuilder) =>
    expressionBuilder.val(1).as("schema_check"),
  ).executeTakeFirstOrThrow();

  return {
    configured: true,
    ok: true,
  };
}
