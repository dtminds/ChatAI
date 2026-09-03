import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";

export type WorkflowSubUserReader = {
  listDisplayNames(uid: number, subUserIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
};

export class EmptyWorkflowSubUserReader implements WorkflowSubUserReader {
  async listDisplayNames() {
    return new Map<string, string>();
  }
}

export class MysqlWorkflowSubUserReader implements WorkflowSubUserReader {
  constructor(private readonly db: Kysely<Database>) {}

  async listDisplayNames(uid: number, subUserIds: readonly string[]) {
    const ids = [...new Set(subUserIds
      .map(value => Number(value))
      .filter(value => Number.isSafeInteger(value) && value > 0))];
    if (ids.length === 0) return new Map<string, string>();

    const rows = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["id", "name"])
      .where("uid", "=", uid)
      .where("status", "!=", 0)
      .where("id", "in", ids)
      .execute();

    return new Map(rows.map(row => [String(row.id), row.name] as const));
  }
}
