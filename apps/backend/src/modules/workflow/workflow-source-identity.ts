import type { Database } from "../../db/schema.js";
import type { Kysely } from "kysely";

export type WorkflowSourceIdentityResolver = {
  resolveActiveSeatWorkUserIds(uid: number, seatIds: number[]): Promise<Map<number, number>>;
};

export class MysqlWorkflowSourceIdentityResolver implements WorkflowSourceIdentityResolver {
  constructor(private readonly db: Kysely<Database>) {}

  async resolveActiveSeatWorkUserIds(uid: number, seatIds: number[]) {
    const uniqueSeatIds = [...new Set(seatIds)];
    if (uniqueSeatIds.length === 0) return new Map<number, number>();
    const rows = await this.db.selectFrom("xy_wap_embed_user_seat")
      .select(["id", "user_id"])
      .where("uid", "=", uid)
      .where("id", "in", uniqueSeatIds)
      .where("biz_status", "=", 1)
      .where("user_id", "is not", null)
      .execute();
    return new Map(rows.map(row => [Number(row.id), Number(row.user_id)]));
  }
}

export class UnavailableWorkflowSourceIdentityResolver implements WorkflowSourceIdentityResolver {
  async resolveActiveSeatWorkUserIds(): Promise<Map<number, number>> {
    throw new Error("Workflow source identity resolver is unavailable");
  }
}
