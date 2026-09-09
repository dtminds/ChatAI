import type { Database } from "@chatai/database";
import type { Kysely } from "kysely";
import { readString } from "./capability-port-support.js";

type WorkflowSeat = {
  id: number;
  platform: number;
  thirdUserId: string;
};

function buildWorkflowSeatQuery(
  database: Kysely<Database>,
  input: { seatId: number; uid: number },
) {
  return database
    .selectFrom("xy_wap_embed_user_seat")
    .select(["id", "platform", "third_userid"])
    .where("uid", "=", input.uid)
    .where("id", "=", input.seatId);
}

export async function findWorkflowSeat(
  database: Kysely<Database>,
  input: { seatId: number; uid: number },
): Promise<WorkflowSeat | null> {
  const row = await buildWorkflowSeatQuery(database, input).executeTakeFirst();
  const id = readPositiveInteger(row?.id);
  const platform = readPositiveInteger(row?.platform);
  const thirdUserId = readString(row?.third_userid);
  return id && platform && thirdUserId ? { id, platform, thirdUserId } : null;
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
