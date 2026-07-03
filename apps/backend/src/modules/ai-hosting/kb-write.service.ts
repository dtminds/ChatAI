import {
  AI_HOSTING_KB_QUOTA_LIMIT,
  type KbCreateRequest,
  type KbCreateResponse,
  type KbDeleteCheckResponse,
  type KbDeleteResponse,
  type KbUpdateRequest,
  type KbUpdateResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import type { RequestAwareLogger } from "../../shared/logger.js";
import { noopLogger } from "../../shared/logger.js";
import type { AgentKbJavaClient } from "./agent-kb-java-client.js";
import { createAgentKbJavaClient } from "./agent-kb-java-client.js";
import { type AgentKbTenant, parseRequiredNumericId } from "./kb-tenant-utils.js";

const dbActiveStatus = 1;

type KbWriteServiceLogger = Pick<RequestAwareLogger, "info">;

export class KbWriteService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly agentKbJavaClient: AgentKbJavaClient,
    private readonly logger: KbWriteServiceLogger = { info: () => undefined },
  ) {}

  async createKb(
    tenant: AgentKbTenant,
    payload: KbCreateRequest,
  ): Promise<KbCreateResponse> {
    const uid = tenant.uid;
    const name = payload.name.trim();

    if (!name) {
      throw new BadRequestError("INVALID_KB_NAME", "知识库名称不能为空");
    }

    const remark = payload.description?.trim() ?? "";

    await this.assertKbQuotaAvailable(uid);

    const kbId = await this.agentKbJavaClient.createKb({
      name,
      operatorId: tenant.subUserId,
      remark: remark || undefined,
      uid,
    });

    this.logger.info(
      {
        kbId,
        operation: "kb-create",
        subUserId: tenant.subUserId,
        uid,
      },
      "知识库创建成功",
    );

    return { kbId };
  }

  async updateKb(
    tenant: AgentKbTenant,
    kbId: string,
    payload: KbUpdateRequest,
  ): Promise<KbUpdateResponse> {
    const uid = tenant.uid;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");
    const name = payload.name.trim();

    if (!name) {
      throw new BadRequestError("INVALID_KB_NAME", "知识库名称不能为空");
    }

    const remark = payload.description?.trim() ?? "";

    await this.assertKbExists(uid, kbNumericId);

    await this.agentKbJavaClient.updateKb({
      kbId: kbNumericId,
      lastOperatorId: tenant.subUserId,
      name,
      remark: remark || undefined,
      uid,
    });

    this.logger.info(
      {
        kbId,
        operation: "kb-update",
        subUserId: tenant.subUserId,
        uid,
      },
      "知识库更新成功",
    );

    return { updated: true };
  }

  async checkKbDelete(tenant: AgentKbTenant, kbId: string): Promise<KbDeleteCheckResponse> {
    const uid = tenant.uid;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);

    return {
      linkedAgentCount: await this.countLinkedAgents(uid, kbNumericId),
      hasDocuments: await this.hasKbDocuments(uid, kbNumericId),
    };
  }

  async deleteKb(tenant: AgentKbTenant, kbId: string): Promise<KbDeleteResponse> {
    const uid = tenant.uid;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);

    const linkedAgentCount = await this.countLinkedAgents(uid, kbNumericId);

    if (linkedAgentCount > 0) {
      throw new BadRequestError(
        "KB_DELETE_HAS_LINKED_AGENTS",
        `当前知识库已关联${linkedAgentCount}个Agent，不支持删除`,
      );
    }

    if (await this.hasKbDocuments(uid, kbNumericId)) {
      throw new BadRequestError(
        "KB_DELETE_HAS_DOCUMENTS",
        "请先删除所有文档后，再删除知识库",
      );
    }

    await this.agentKbJavaClient.deleteKb({
      kbId: kbNumericId,
      uid,
    });

    this.logger.info(
      {
        kbId,
        operation: "kb-delete",
        subUserId: tenant.subUserId,
        uid,
      },
      "知识库删除成功",
    );

    return { deleted: true };
  }

  private async assertKbExists(uid: number, kbNumericId: number) {
    const kb = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select(["id"])
      .where("id", "=", kbNumericId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!kb) {
      throw new NotFoundError("KB_NOT_FOUND", "知识库不存在");
    }
  }

  private async hasKbDocuments(uid: number, kbNumericId: number) {
    const result = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("uid", "=", uid)
      .where("kb_id", "=", kbNumericId)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    return Number(result?.total ?? 0) > 0;
  }

  private async countLinkedAgents(uid: number, kbNumericId: number) {
    const agents = await this.db
      .selectFrom("xy_wap_embed_agent")
      .select(["prompt_config"])
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .limit(100)
      .execute();

    return agents.filter((agent) =>
      parsePromptConfigAvailableKbIds(agent.prompt_config).includes(kbNumericId),
    ).length;
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

export function createKbWriteService(
  db: Kysely<Database>,
  logger: RequestAwareLogger = noopLogger,
) {
  return new KbWriteService(db, createAgentKbJavaClient(logger), logger);
}

function parsePromptConfigAvailableKbIds(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as { available_kb_ids?: unknown };

    if (!Array.isArray(parsed.available_kb_ids)) {
      return [];
    }

    return parsed.available_kb_ids
      .map((kbId) => Number(kbId))
      .filter((kbId) => Number.isInteger(kbId) && kbId > 0);
  } catch {
    return [];
  }
}
