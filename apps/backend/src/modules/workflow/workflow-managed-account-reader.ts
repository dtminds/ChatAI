import type { Database } from "../../db/schema.js";
import type { Kysely } from "kysely";

export type WorkflowManagedAccountSummary = {
  avatarUrl: string;
  id: number;
  name: string;
};

export type WorkflowManagedAccountReader = {
  findByIds(uid: number, seatIds: number[]): Promise<Map<number, WorkflowManagedAccountSummary>>;
};

export class MysqlWorkflowManagedAccountReader implements WorkflowManagedAccountReader {
  constructor(private readonly db: Kysely<Database>) {}

  async findByIds(uid: number, seatIds: number[]) {
    const uniqueSeatIds = [...new Set(seatIds)];
    if (uniqueSeatIds.length === 0) return new Map<number, WorkflowManagedAccountSummary>();

    const rows = await this.db.selectFrom("xy_wap_embed_user_seat")
      .select(["id", "third_avatar", "third_user_name"])
      .where("uid", "=", uid)
      .where("id", "in", uniqueSeatIds)
      .where("biz_status", "=", 1)
      .execute();

    return new Map(rows.map(row => [Number(row.id), {
      avatarUrl: row.third_avatar?.trim() || "",
      id: Number(row.id),
      name: row.third_user_name?.trim() || "未命名托管账号",
    }]));
  }
}

export class EmptyWorkflowManagedAccountReader implements WorkflowManagedAccountReader {
  async findByIds(): Promise<Map<number, WorkflowManagedAccountSummary>> {
    return new Map();
  }
}
