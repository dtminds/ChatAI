import type { KbCreateRequest, KbListItem } from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError, ServiceUnavailableError } from "../../shared/errors.js";
import { mapKbListItem } from "./kb-read-mappers.js";

const dbActiveStatus = 1;

export class KbWriteService {
  constructor(private readonly db: Kysely<Database>) {}

  async createKb(subUserId: string, payload: KbCreateRequest): Promise<KbListItem> {
    const uid = await this.resolveUid(subUserId);
    const operatorId = parsePositiveInteger(subUserId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    const name = payload.name.trim();
    const remark = payload.description?.trim() ?? "";

    const inserted = await this.db
      .insertInto("xy_wap_embed_agent_kb")
      .values({
        last_operator_id: operatorId,
        name,
        operator_id: operatorId,
        remark,
        status: dbActiveStatus,
        uid,
      })
      .executeTakeFirstOrThrow();

    const kbId = parseInsertedMySqlId(inserted);

    if (kbId == null) {
      throw new ServiceUnavailableError("KB_ID_UNAVAILABLE", "知识库服务暂不可用");
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .selectAll()
      .where("id", "=", kbId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!row) {
      throw new ServiceUnavailableError("KB_ID_UNAVAILABLE", "知识库服务暂不可用");
    }

    return mapKbListItem(row);
  }

  private async resolveUid(subUserId: string) {
    const subUserNumericId = parsePositiveInteger(subUserId);

    if (subUserNumericId == null) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    const subUser = await this.db
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
}

export function createKbWriteService(db: Kysely<Database>) {
  return new KbWriteService(db);
}

function parseInsertedMySqlId(result: unknown) {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const inserted = result as {
    id?: bigint | number | string | null;
    insertId?: bigint | number | string | null;
  };

  const rawId = inserted.insertId ?? inserted.id;

  if (typeof rawId === "number") {
    return Number.isSafeInteger(rawId) && rawId > 0 ? rawId : undefined;
  }

  if (typeof rawId === "bigint") {
    return rawId > 0n && rawId <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rawId) : undefined;
  }

  if (typeof rawId === "string") {
    return parsePositiveInteger(rawId);
  }

  return undefined;
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
