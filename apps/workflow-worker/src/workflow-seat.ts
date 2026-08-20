import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import type { Kysely } from "kysely";

interface WorkflowSeatTable {
  id: number;
  platform: number;
  third_userid: string;
  uid: number;
}

type WorkflowSeatDatabase = WorkflowDatabase & {
  xy_wap_embed_user_seat: WorkflowSeatTable;
};

type WorkflowSeat = {
  id: number;
  platform: number;
  thirdUserId: string;
};

function buildWorkflowSeatQuery(
  database: Kysely<WorkflowDatabase>,
  input: { seatId: number; uid: number },
) {
  return asWorkflowSeatDatabase(database)
    .selectFrom("xy_wap_embed_user_seat")
    .select(["id", "platform", "third_userid"])
    .where("uid", "=", input.uid)
    .where("id", "=", input.seatId);
}

export async function findWorkflowSeat(
  database: Kysely<WorkflowDatabase>,
  input: { seatId: number; uid: number },
): Promise<WorkflowSeat | null> {
  const row = await buildWorkflowSeatQuery(database, input).executeTakeFirst();
  const id = readPositiveInteger(row?.id);
  const platform = readPositiveInteger(row?.platform);
  const thirdUserId = readString(row?.third_userid);
  return id && platform && thirdUserId ? { id, platform, thirdUserId } : null;
}

function asWorkflowSeatDatabase(database: Kysely<WorkflowDatabase>) {
  return database as unknown as Kysely<WorkflowSeatDatabase>;
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
