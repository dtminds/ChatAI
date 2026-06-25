import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { NotFoundError } from "../../shared/errors.js";

const dbActiveStatus = 1;

export function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function resolveAgentKbUid(db: Kysely<Database>, subUserId: string) {
  const subUserNumericId = parsePositiveInteger(subUserId);

  if (subUserNumericId == null) {
    throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
  }

  const subUser = await db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["id", "uid"])
    .where("id", "=", subUserNumericId)
    .where("status", "=", dbActiveStatus)
    .executeTakeFirst();

  if (subUser?.uid == null) {
    throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
  }

  return subUser.uid;
}

export function parseRequiredNumericId(value: string, code: string, message: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new NotFoundError(code, message);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new NotFoundError(code, message);
  }

  return parsed;
}
