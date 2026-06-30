import {
  AI_HOSTING_KB_QUOTA_LIMIT,
  type KbCreateRequest,
  type KbCreateResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, ServiceUnavailableError } from "../../shared/errors.js";
import { type AgentKbTenant, parsePositiveInteger } from "./kb-tenant-utils.js";

const dbActiveStatus = 1;

export class KbWriteService {
  constructor(private readonly db: Kysely<Database>) {}

  async createKb(
    tenant: AgentKbTenant,
    payload: KbCreateRequest,
  ): Promise<KbCreateResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const operatorId = parsePositiveInteger(subUserId);

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    const name = payload.name.trim();

    if (!name) {
      throw new BadRequestError("INVALID_KB_NAME", "知识库名称不能为空");
    }

    const remark = payload.description?.trim() ?? "";

    await this.assertKbQuotaAvailable(uid);

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

    return { kbId: String(kbId) };
  }

  private async assertKbQuotaAvailable(uid: number) {
    const result = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();
    const used = Number(result?.total ?? 0);

    if (used >= AI_HOSTING_KB_QUOTA_LIMIT) {
      throw new BadRequestError(
        "KB_QUOTA_EXCEEDED",
        "知识库数量已达上限",
        {
          limit: AI_HOSTING_KB_QUOTA_LIMIT,
          used,
        },
      );
    }
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
