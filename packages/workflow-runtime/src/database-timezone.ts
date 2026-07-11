import { sql, type Kysely } from "kysely";

const UTC_8_OFFSET_SECONDS = 8 * 60 * 60;

export async function assertDatabaseUtc8Timezone<Database>(db: Kysely<Database>) {
  const row = await db.selectNoFrom(() =>
    sql<number>`TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), CURRENT_TIMESTAMP())`
      .as("timezone_offset_seconds"),
  ).executeTakeFirstOrThrow() as { timezone_offset_seconds: number | string };
  const offsetSeconds = Number(row.timezone_offset_seconds);
  if (offsetSeconds !== UTC_8_OFFSET_SECONDS) {
    throw new Error(
      `MySQL session timezone must be UTC+8; effective offset is ${offsetSeconds} seconds`,
    );
  }
}
