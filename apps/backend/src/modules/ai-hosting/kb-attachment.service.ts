import type {
  KbAttachmentBatchDeleteResponse,
  KbAttachmentCreateRequest,
  KbAttachmentCreateResponse,
  KbAttachmentDeleteResponse,
  KbAttachmentImageMaterialCreateRequest,
  KbAttachmentImageMaterialCreateResponse,
  KbAttachmentInitResponse,
  KbAttachmentListResponse,
  KbAttachmentStatusResponse,
  KbAttachmentType,
  KbAttachmentUpdateRequest,
  KbAttachmentUpdateResponse,
} from "@chatai/contracts";
import { KB_SEARCH_QUERY_MAX_LENGTH } from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors.js";
import type { AgentKbJavaClient } from "./agent-kb-java-client.js";
import {
  KB_ATTACHMENT_DOC_NAME,
  KB_ATTACHMENT_DOC_SUFFIX,
  KB_ATTACHMENT_DOC_URL,
  KB_ATTACHMENT_BATCH_DELETE_MAX,
  KB_DOC_TYPE_ATTACHMENT,
} from "./kb-attachment.constants.js";
import {
  createKbAttachmentImageMaterial,
  findKbAttachmentMaterialsByIds,
  requireKbAttachmentMaterial,
} from "./kb-attachment-material.repository.js";
import {
  readPrimaryKbAttachmentMaterialId,
} from "./kb-attachment-material-utils.js";
import {
  deriveKbAttachmentTitle,
  mapJavaChunkToKbAttachmentListItem,
} from "./kb-attachment-mappers.js";
import { KB_INIT_VOLC_STRATEGY_RESOURCE_ID } from "./kb-doc-strategy-mappers.js";
import { mapSyncStatus } from "./kb-read-mappers.js";
import { type AgentKbTenant, parseRequiredNumericId } from "./kb-tenant-utils.js";

const KB_CHUNK_SOURCE_MANUAL = 1;
const KB_CHUNK_TITLE_MAX_LENGTH = 256;
const dbActiveStatus = 1;
const defaultAttachmentPage = 1;
const defaultAttachmentPageSize = 10;
const maxAttachmentPageSize = 100;

type KbAttachmentServiceLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
};

type AttachmentDocRow = {
  id: number;
  sync_status: number;
};

export class KbAttachmentService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger: KbAttachmentServiceLogger,
    private readonly agentKbJavaClient: AgentKbJavaClient,
  ) {}

  async initAttachments(tenant: AgentKbTenant, kbId: string): Promise<KbAttachmentInitResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);

    const existingDoc = await this.findAttachmentDoc(uid, kbNumericId);

    if (existingDoc) {
      return {
        docId: String(existingDoc.id),
        initialized: true,
        status: mapSyncStatus(existingDoc.sync_status),
      };
    }

    const docId = await this.agentKbJavaClient.createKbDoc({
      docSize: 0,
      docSuffix: KB_ATTACHMENT_DOC_SUFFIX,
      docType: KB_DOC_TYPE_ATTACHMENT,
      docUrl: KB_ATTACHMENT_DOC_URL,
      kbId: kbNumericId,
      name: KB_ATTACHMENT_DOC_NAME,
      operatorId: subUserId,
      uid,
      volcStrategyResourceId: KB_INIT_VOLC_STRATEGY_RESOURCE_ID,
    });

    this.logger.info(
      {
        docId,
        kbId,
        operation: "kb-attachment-init",
        subUserId,
        uid,
      },
      "知识库附件库初始化成功",
    );

    return {
      docId: String(docId),
      initialized: true,
      status: "queued",
    };
  }

  async getAttachmentStatus(
    tenant: AgentKbTenant,
    kbId: string,
  ): Promise<KbAttachmentStatusResponse> {
    const uid = tenant.uid;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");
    const attachmentDoc = await this.findAttachmentDoc(uid, kbNumericId);

    if (!attachmentDoc) {
      return { initialized: false };
    }

    return {
      docId: String(attachmentDoc.id),
      initialized: true,
      syncStatus: attachmentDoc.sync_status,
    };
  }

  async listAttachments(
    tenant: AgentKbTenant,
    kbId: string,
    options: {
      attachmentType?: KbAttachmentType;
      chunkId?: string;
      docId: string;
      page?: number;
      pageSize?: number;
      query?: string;
    },
  ): Promise<KbAttachmentListResponse> {
    const uid = tenant.uid;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");
    const attachmentDocId = parseRequiredNumericId(
      options.docId,
      "KB_ATTACHMENT_DOC_NOT_FOUND",
      "附件库异常，请稍后重试",
    );
    const attachmentDoc = await this.getAttachmentDocById(uid, kbNumericId, attachmentDocId);

    if (!attachmentDoc || !isAttachmentDocRow(attachmentDoc)) {
      throw new NotFoundError("KB_ATTACHMENT_DOC_NOT_FOUND", "附件库异常，请稍后重试");
    }

    const pagination = normalizeAttachmentPagination(options);
    const normalizedQuery = normalizeAttachmentSearchQuery(options.query);
    const normalizedChunkId = normalizeAttachmentChunkDisplayId(options.chunkId);

    if (options.attachmentType == null && !normalizedChunkId) {
      throw new BadRequestError("KB_ATTACHMENT_FILTER_REQUIRED", "请选择附件类型");
    }

    const response = await this.agentKbJavaClient.listKbChunks({
      attachmentType: options.attachmentType,
      content: normalizedQuery,
      docId: attachmentDocId,
      page: pagination.page,
      pageSize: pagination.pageSize,
      uid,
      volcChunkId: normalizedChunkId
        ? `doc_id_${uid}_${attachmentDocId}_${normalizedChunkId}`
        : undefined,
    });

    const materialIds = response.list.flatMap((item) => {
      const materialId = readPrimaryKbAttachmentMaterialId(item.attachmentIds);

      return materialId == null ? [] : [materialId];
    });
    const materialById = await findKbAttachmentMaterialsByIds(this.db, uid, materialIds);

    const attachments = response.list
      .map((item) => mapJavaChunkToKbAttachmentListItem(item, materialById))
      .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      attachments,
      pagination: {
        page: response.page,
        pageSize: response.pageSize,
        total: response.count,
      },
    };
  }

  async createAttachment(
    tenant: AgentKbTenant,
    kbId: string,
    request: KbAttachmentCreateRequest,
  ): Promise<KbAttachmentCreateResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");
    const attachmentDoc = await this.requireReadyAttachmentDoc(uid, kbNumericId);
    const description = assertWritableDescription(request.description);
    const material = await requireKbAttachmentMaterial(
      this.db,
      uid,
      request.materialCollectionId,
      request.attachmentType,
    );

    const title = resolveWritableTitle(
      request.title?.trim()
        || deriveKbAttachmentTitle(undefined, material.attachmentContent),
    );

    const chunkId = await this.agentKbJavaClient.addKbChunk({
      attachmentIds: [material.materialId],
      attachmentTypes: [request.attachmentType],
      chunkType: "text",
      content: description,
      docId: attachmentDoc.id,
      operatorId: subUserId,
      title,
      uid,
    });

    this.logger.info(
      {
        attachmentType: request.attachmentType,
        chunkId,
        docId: attachmentDoc.id,
        kbId,
        operation: "kb-attachment-create",
        subUserId,
        uid,
      },
      "知识库附件创建成功",
    );

    return { chunkId };
  }

  async updateAttachment(
    tenant: AgentKbTenant,
    chunkId: string,
    request: KbAttachmentUpdateRequest,
  ): Promise<KbAttachmentUpdateResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const chunkNumericId = parseRequiredNumericId(chunkId, "KB_CHUNK_NOT_FOUND", "附件不存在");
    const chunk = await this.getKbChunkRow(uid, chunkNumericId);

    if (!chunk) {
      throw new NotFoundError("KB_CHUNK_NOT_FOUND", "附件不存在");
    }

    await this.assertAttachmentChunkEditable(uid, chunk.doc_id, chunk.source);

    const description = assertWritableDescription(request.description);
    const normalizedTitle = request.title?.trim();

    if (normalizedTitle && normalizedTitle.length > KB_CHUNK_TITLE_MAX_LENGTH) {
      throw new BadRequestError("INVALID_KB_CHUNK_TITLE", "切片标题过长");
    }

    let attachmentTypes: number[] | undefined;
    let attachmentIds: number[] | undefined;

    if (request.materialCollectionId) {
      const attachmentType = toKbAttachmentType(Number(chunk.attachment_type));

      if (attachmentType == null) {
        throw new NotFoundError("KB_CHUNK_NOT_FOUND", "附件不存在");
      }

      const material = await requireKbAttachmentMaterial(
        this.db,
        uid,
        request.materialCollectionId,
        attachmentType,
      );
      attachmentTypes = [attachmentType];
      attachmentIds = [material.materialId];
    }

    await this.agentKbJavaClient.updateKbChunk({
      ...(attachmentIds && attachmentTypes
        ? {
            attachmentIds,
            attachmentTypes,
          }
        : {}),
      chunkId: chunkNumericId,
      content: description,
      operatorId: subUserId,
      title: normalizedTitle,
      uid,
    });

    this.logger.info(
      {
        chunkId,
        operation: "kb-attachment-update",
        subUserId,
        uid,
      },
      "知识库附件更新成功",
    );

    return { updated: true };
  }

  async deleteAttachment(
    tenant: AgentKbTenant,
    chunkId: string,
  ): Promise<KbAttachmentDeleteResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const chunkNumericId = parseRequiredNumericId(chunkId, "KB_CHUNK_NOT_FOUND", "附件不存在");
    const chunk = await this.getKbChunkRow(uid, chunkNumericId);

    if (!chunk) {
      throw new NotFoundError("KB_CHUNK_NOT_FOUND", "附件不存在");
    }

    await this.assertAttachmentChunkEditable(uid, chunk.doc_id, chunk.source);

    await this.agentKbJavaClient.deleteKbChunk({
      chunkId: chunkNumericId,
      operatorId: subUserId,
      uid,
    });

    this.logger.info(
      {
        chunkId,
        operation: "kb-attachment-delete",
        subUserId,
        uid,
      },
      "知识库附件删除成功",
    );

    return { deleted: true };
  }

  async batchDeleteAttachments(
    tenant: AgentKbTenant,
    chunkIds: string[],
  ): Promise<KbAttachmentBatchDeleteResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const uniqueChunkIds = [...new Set(chunkIds.map((chunkId) => chunkId.trim()).filter(Boolean))];

    if (uniqueChunkIds.length === 0) {
      throw new BadRequestError("INVALID_KB_ATTACHMENT_BATCH_DELETE", "请选择要删除的附件");
    }

    if (uniqueChunkIds.length > KB_ATTACHMENT_BATCH_DELETE_MAX) {
      throw new BadRequestError(
        "INVALID_KB_ATTACHMENT_BATCH_DELETE",
        `单次最多删除 ${KB_ATTACHMENT_BATCH_DELETE_MAX} 个附件`,
      );
    }

    const chunkNumericIds = uniqueChunkIds.map((chunkId) =>
      parseRequiredNumericId(chunkId, "KB_CHUNK_NOT_FOUND", "附件不存在"),
    );

    const chunks = await this.db
      .selectFrom("xy_wap_embed_agent_kb_chunk")
      .select(["doc_id", "id", "source"])
      .where("id", "in", chunkNumericIds)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    const chunkById = new Map(chunks.map((chunk) => [Number(chunk.id), chunk]));

    for (const chunkNumericId of chunkNumericIds) {
      if (!chunkById.has(chunkNumericId)) {
        throw new NotFoundError("KB_CHUNK_NOT_FOUND", "附件不存在");
      }
    }

    const uniqueDocIds = [...new Set(chunks.map((chunk) => chunk.doc_id))];
    const docs = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(["doc_type", "id", "name"])
      .where("id", "in", uniqueDocIds)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .execute();
    const attachmentDocIds = new Set(
      docs
        .filter((doc) => isAttachmentDocRow(doc))
        .map((doc) => Number(doc.id)),
    );

    for (const docId of uniqueDocIds) {
      if (!attachmentDocIds.has(Number(docId))) {
        throw new NotFoundError("KB_ATTACHMENT_DOC_NOT_FOUND", "附件库异常，请稍后重试");
      }
    }

    for (const chunk of chunks) {
      if (chunk.source !== KB_CHUNK_SOURCE_MANUAL) {
        throw new ForbiddenError("KB_CHUNK_NOT_EDITABLE", "系统切片不可编辑");
      }
    }

    const result = await this.agentKbJavaClient.batchDeleteKbChunks({
      chunkIds: chunkNumericIds,
      operatorId: subUserId,
      uid,
    });

    this.logger.info(
      {
        chunkIds: uniqueChunkIds,
        failCount: result.failCount,
        operation: "kb-attachment-batch-delete",
        subUserId,
        successCount: result.successCount,
        uid,
      },
      "知识库附件批量删除完成",
    );

    return result;
  }

  async createImageMaterial(
    tenant: AgentKbTenant,
    kbId: string,
    request: KbAttachmentImageMaterialCreateRequest,
  ): Promise<KbAttachmentImageMaterialCreateResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const kbNumericId = parseRequiredNumericId(kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);
    await this.requireReadyAttachmentDoc(uid, kbNumericId);

    const subUserNumericId = parseRequiredNumericId(
      subUserId,
      "KB_ATTACHMENT_INVALID",
      "操作人无效",
    );

    return createKbAttachmentImageMaterial(this.db, {
      opSubUserId: subUserId,
      request,
      subUserNumericId,
      uid,
    });
  }

  private async requireReadyAttachmentDoc(uid: number, kbId: number) {
    const attachmentDoc = await this.findAttachmentDoc(uid, kbId);

    if (!attachmentDoc) {
      throw new NotFoundError("KB_ATTACHMENT_NOT_INITIALIZED", "请先初始化附件库");
    }

    return attachmentDoc;
  }

  private async assertAttachmentChunkEditable(uid: number, docId: number, source: number) {
    const doc = await this.getAttachmentDocById(uid, undefined, docId);

    if (!doc || !isAttachmentDocRow(doc)) {
      throw new NotFoundError("KB_ATTACHMENT_DOC_NOT_FOUND", "附件库异常，请稍后重试");
    }

    if (source !== KB_CHUNK_SOURCE_MANUAL) {
      throw new ForbiddenError("KB_CHUNK_NOT_EDITABLE", "系统切片不可编辑");
    }
  }

  private async findAttachmentDoc(uid: number, kbId: number): Promise<AttachmentDocRow | undefined> {
    return this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(["id", "sync_status"])
      .where("uid", "=", uid)
      .where("kb_id", "=", kbId)
      .where("status", "=", dbActiveStatus)
      .where((eb) =>
        eb.or([
          eb("doc_type", "=", KB_DOC_TYPE_ATTACHMENT),
          eb("name", "=", KB_ATTACHMENT_DOC_NAME),
        ]),
      )
      .executeTakeFirst();
  }

  private async getAttachmentDocById(uid: number, kbId: number | undefined, docId: number) {
    let query = this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(["doc_type", "id", "name", "sync_status"])
      .where("uid", "=", uid)
      .where("id", "=", docId)
      .where("status", "=", dbActiveStatus);

    if (kbId != null) {
      query = query.where("kb_id", "=", kbId);
    }

    return query.executeTakeFirst();
  }

  private async getKbChunkRow(uid: number, chunkId: number) {
    return this.db
      .selectFrom("xy_wap_embed_agent_kb_chunk")
      .select(["attachment_type", "doc_id", "source"])
      .where("id", "=", chunkId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();
  }

  private async assertKbExists(uid: number, kbId: number) {
    const row = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select(["id"])
      .where("id", "=", kbId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError("KB_NOT_FOUND", "知识库不存在");
    }
  }
}

function normalizeAttachmentChunkDisplayId(value?: string) {
  const normalized = value?.trim();

  if (!normalized || normalized.includes("_")) {
    return undefined;
  }

  return normalized;
}

function isAttachmentDocRow(doc: { doc_type: number; name?: string | null }) {
  return doc.doc_type === KB_DOC_TYPE_ATTACHMENT || doc.name === KB_ATTACHMENT_DOC_NAME;
}

function toKbAttachmentType(value: number): KbAttachmentType | undefined {
  if (value === 2 || value === 3 || value === 4 || value === 6 || value === 7) {
    return value;
  }

  return undefined;
}

function assertWritableDescription(description: string) {
  const normalizedDescription = description.trim();

  if (!normalizedDescription) {
    throw new BadRequestError("INVALID_KB_CHUNK_CONTENT", "切片内容不能为空");
  }

  return normalizedDescription;
}

function resolveWritableTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new BadRequestError("INVALID_KB_CHUNK_TITLE", "切片标题不能为空");
  }

  if (normalizedTitle.length > KB_CHUNK_TITLE_MAX_LENGTH) {
    throw new BadRequestError("INVALID_KB_CHUNK_TITLE", "切片标题过长");
  }

  return normalizedTitle;
}

function normalizeAttachmentPagination(input: { page?: number; pageSize?: number }) {
  const page =
    Number.isInteger(input.page) && input.page && input.page > 0
      ? input.page
      : defaultAttachmentPage;
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize && input.pageSize > 0
      ? Math.min(input.pageSize, maxAttachmentPageSize)
      : defaultAttachmentPageSize;

  return { page, pageSize };
}

function normalizeAttachmentSearchQuery(query?: string) {
  const normalizedQuery = query?.trim();

  if (!normalizedQuery) {
    return undefined;
  }

  if (normalizedQuery.length > KB_SEARCH_QUERY_MAX_LENGTH) {
    throw new BadRequestError(
      "INVALID_KB_QUERY",
      `搜索关键词不能超过 ${KB_SEARCH_QUERY_MAX_LENGTH} 个字符`,
    );
  }

  return normalizedQuery;
}

export function createKbAttachmentService(
  db: Kysely<Database>,
  logger: KbAttachmentServiceLogger,
  agentKbJavaClient: AgentKbJavaClient,
) {
  return new KbAttachmentService(db, logger, agentKbJavaClient);
}
