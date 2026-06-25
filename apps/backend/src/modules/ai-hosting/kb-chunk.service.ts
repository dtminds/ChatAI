import type {
  KbChunkCreateRequest,
  KbChunkCreateResponse,
  KbChunkDeleteResponse,
  KbChunkUpdateRequest,
  KbChunkUpdateResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors.js";
import type { AgentKbJavaClient } from "./agent-kb-java-client.js";
import {
  KB_DOC_TYPE_DOCUMENT,
  KB_DOC_TYPE_FAQ,
  KB_DOC_TYPE_IMAGE,
} from "./kb-doc.service.js";
import { parsePositiveInteger, resolveAgentKbUid } from "./kb-tenant-utils.js";

const KB_CHUNK_TITLE_MAX_LENGTH = 256;
const dbActiveStatus = 1;

type KbChunkServiceLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
};

export class KbChunkService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger: KbChunkServiceLogger,
    private readonly agentKbJavaClient: AgentKbJavaClient,
  ) {}

  async addKbChunk(
    subUserId: string,
    request: KbChunkCreateRequest,
  ): Promise<KbChunkCreateResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const docNumericId = parseRequiredNumericId(request.docId, "KB_DOC_NOT_FOUND", "知识不存在");
    const doc = await this.getKbDocRow(uid, docNumericId);

    if (!doc) {
      throw new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
    }

    this.assertChunkTypeMatchesDoc(request, doc.doc_type);
    this.assertWritableTitle(request.title, request.chunkType);

    const chunkId = await this.agentKbJavaClient.addKbChunk({
      chunkType: request.chunkType,
      content: request.content.trim(),
      docId: docNumericId,
      operatorId: subUserId,
      title: request.title?.trim(),
      uid,
    });

    this.logger.info(
      {
        chunkId,
        chunkType: request.chunkType,
        docId: request.docId,
        operation: "kb-chunk-add",
        subUserId,
        uid,
      },
      "知识库切片创建成功",
    );

    return { chunkId };
  }

  async updateKbChunk(
    subUserId: string,
    chunkId: string,
    request: KbChunkUpdateRequest,
  ): Promise<KbChunkUpdateResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const chunkNumericId = parseRequiredNumericId(chunkId, "KB_CHUNK_NOT_FOUND", "切片不存在");
    const chunk = await this.getKbChunkRow(uid, chunkNumericId);

    if (!chunk) {
      throw new NotFoundError("KB_CHUNK_NOT_FOUND", "切片不存在");
    }

    const normalizedTitle = request.title?.trim();
    if (normalizedTitle && normalizedTitle.length > KB_CHUNK_TITLE_MAX_LENGTH) {
      throw new BadRequestError("INVALID_KB_CHUNK_TITLE", "切片标题过长");
    }

    await this.agentKbJavaClient.updateKbChunk({
      chunkId: chunkNumericId,
      content: request.content.trim(),
      operatorId: subUserId,
      title: normalizedTitle,
      uid,
    });

    this.logger.info(
      {
        chunkId,
        operation: "kb-chunk-update",
        subUserId,
        uid,
      },
      "知识库切片更新成功",
    );

    return { updated: true };
  }

  async deleteKbChunk(subUserId: string, chunkId: string): Promise<KbChunkDeleteResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const chunkNumericId = parseRequiredNumericId(chunkId, "KB_CHUNK_NOT_FOUND", "切片不存在");

    await this.assertKbChunkExists(uid, chunkNumericId);

    await this.agentKbJavaClient.deleteKbChunk({
      chunkId: chunkNumericId,
      operatorId: subUserId,
      uid,
    });

    this.logger.info(
      {
        chunkId,
        operation: "kb-chunk-delete",
        subUserId,
        uid,
      },
      "知识库切片删除成功",
    );

    return { deleted: true };
  }

  private assertChunkTypeMatchesDoc(request: KbChunkCreateRequest, docType: number) {
    if (docType === KB_DOC_TYPE_IMAGE) {
      throw new BadRequestError("INVALID_KB_CHUNK_TYPE", "当前文档不支持手动新增切片");
    }

    if (docType === KB_DOC_TYPE_FAQ && request.chunkType !== "faq") {
      throw new BadRequestError("INVALID_KB_CHUNK_TYPE", "当前文档仅支持 FAQ 切片");
    }

    if (docType === KB_DOC_TYPE_DOCUMENT && request.chunkType !== "text") {
      throw new BadRequestError("INVALID_KB_CHUNK_TYPE", "当前文档仅支持文本切片");
    }

    if (request.chunkType === "faq" && !request.title?.trim()) {
      throw new BadRequestError("INVALID_KB_CHUNK_TITLE", "问题不能为空");
    }
  }

  private assertWritableTitle(title: string | undefined, chunkType: "text" | "faq") {
    const normalizedTitle = title?.trim();

    if (normalizedTitle && normalizedTitle.length > KB_CHUNK_TITLE_MAX_LENGTH) {
      throw new BadRequestError("INVALID_KB_CHUNK_TITLE", "切片标题过长");
    }

    if (chunkType === "faq" && !normalizedTitle) {
      throw new BadRequestError("INVALID_KB_CHUNK_TITLE", "问题不能为空");
    }
  }

  private async getKbDocRow(uid: number, docId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(["doc_type", "id"])
      .where("id", "=", docId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();
  }

  private async getKbChunkRow(uid: number, chunkId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent_kb_chunk")
      .select(["id"])
      .where("id", "=", chunkId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();
  }

  private async assertKbChunkExists(uid: number, chunkId: number) {
    const row = await this.getKbChunkRow(uid, chunkId);

    if (!row) {
      throw new NotFoundError("KB_CHUNK_NOT_FOUND", "切片不存在");
    }
  }
}

function parseRequiredNumericId(value: string, code: string, message: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new NotFoundError(code, message);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new NotFoundError(code, message);
  }

  return parsed;
}
