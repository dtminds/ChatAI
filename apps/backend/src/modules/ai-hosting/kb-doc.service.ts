import type {
  KbDocCreateFaqRequest,
  KbDocCreateImageRequest,
  KbDocCreateRequest,
  KbDocCreateResponse,
  KbDocDeleteResponse,
  KbDocRetryResponse,
  KbDocUploadCredentialResponse,
} from "@chatai/contracts";
import { AI_HOSTING_KB_DOC_STORAGE_QUOTA_LIMIT } from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import {
  KB_DOC_DB_SYNC_STATUS_FAILED,
  KB_DOC_DB_SYNC_STATUS_QUEUED,
} from "./kb-read-mappers.js";
import type { WorkbenchJavaClient } from "../chat/workbench-java-client.js";
import type { AgentKbJavaClient } from "./agent-kb-java-client.js";
import {
  resolveKbInitVolcStrategyResourceId,
  resolveVolcStrategyResourceId,
} from "./kb-doc-strategy-mappers.js";
import { resolveKbDocUrlForJava } from "./kb-doc-url.js";
import { type AgentKbTenant, parseRequiredNumericId } from "./kb-tenant-utils.js";
import { AiHostingQuotaService } from "./quota.service.js";

export const KB_DOC_TYPE_FAQ = 1;
export const KB_DOC_TYPE_DOCUMENT = 2;
export const KB_DOC_TYPE_IMAGE = 3;

const PLAIN_TEXT_DOC_SUFFIXES = new Set(["md", "txt"]);
const SUPPORTED_DOC_SUFFIXES = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "md",
  "txt",
]);
const SUPPORTED_FAQ_SUFFIXES = new Set(["faq.xlsx"]);
const SUPPORTED_IMAGE_SUFFIXES = new Set(["jpg", "jpeg", "png", "webp"]);

const dbActiveStatus = 1;

type KbDocServiceLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
};

export class KbDocService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger: KbDocServiceLogger,
    private readonly workbenchJavaClient: WorkbenchJavaClient,
    private readonly agentKbJavaClient: AgentKbJavaClient,
  ) {}

  async getUploadCredential(tenant: AgentKbTenant): Promise<KbDocUploadCredentialResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;

    const credential = await this.workbenchJavaClient.getUploadCredential({
      type: "kb",
      uid,
    });

    this.logger.info(
      {
        bucket: credential.bucket,
        javaRequestId: credential.requestId,
        operation: "kb-doc-upload-credential",
        region: credential.region,
        subUserId,
        uid,
      },
      "知识库上传凭证获取成功",
    );

    return credential;
  }

  async createKbDoc(
    tenant: AgentKbTenant,
    request: KbDocCreateRequest,
  ): Promise<KbDocCreateResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const normalizedSuffix = this.assertDocumentCreateRequest(request);
    const kbNumericId = parseRequiredNumericId(request.kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);
    await this.assertKbDocStorageQuotaAvailable(uid, request.docSize);

    const volcStrategyResourceId = resolveVolcStrategyResourceId({
      chunkParams: request.chunkParams,
      chunkStrategy: request.chunkStrategy,
      parseMode: request.parseMode,
    });
    const docUrl = resolveKbDocUrlForJava(request.docUrl);

    const docId = await this.agentKbJavaClient.createKbDoc({
      description: request.description,
      docSuffix: normalizedSuffix,
      docSize: request.docSize,
      docType: KB_DOC_TYPE_DOCUMENT,
      docUrl,
      kbId: kbNumericId,
      name: request.name.trim(),
      operatorId: subUserId,
      uid,
      volcStrategyResourceId,
    });

    this.logger.info(
      {
        docId,
        docSuffix: normalizedSuffix,
        docType: KB_DOC_TYPE_DOCUMENT,
        docUrl,
        kbId: request.kbId,
        name: request.name,
        operation: "kb-doc-create",
        subUserId,
        uid,
        volcStrategyResourceId,
      },
      "知识库文档创建成功",
    );

    return { docId };
  }

  async createKbFaqDoc(
    tenant: AgentKbTenant,
    request: KbDocCreateFaqRequest,
  ): Promise<KbDocCreateResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const normalizedSuffix = this.assertFaqCreateRequest(request);
    const kbNumericId = parseRequiredNumericId(request.kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);
    await this.assertKbDocStorageQuotaAvailable(uid, request.docSize);

    const docUrl = resolveKbDocUrlForJava(request.docUrl);
    const volcStrategyResourceId = resolveKbInitVolcStrategyResourceId();

    const docId = await this.agentKbJavaClient.createKbDoc({
      description: request.description,
      docSuffix: normalizedSuffix,
      docSize: request.docSize,
      docType: KB_DOC_TYPE_FAQ,
      docUrl,
      kbId: kbNumericId,
      name: request.name.trim(),
      operatorId: subUserId,
      uid,
      volcStrategyResourceId,
    });

    this.logger.info(
      {
        docId,
        docSuffix: normalizedSuffix,
        docType: KB_DOC_TYPE_FAQ,
        docUrl,
        kbId: request.kbId,
        name: request.name,
        operation: "kb-doc-create-faq",
        subUserId,
        uid,
        volcStrategyResourceId,
      },
      "知识库 FAQ 创建成功",
    );

    return { docId };
  }

  async createKbImageDoc(
    tenant: AgentKbTenant,
    request: KbDocCreateImageRequest,
  ): Promise<KbDocCreateResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const normalizedSuffix = this.assertImageCreateRequest(request);
    const kbNumericId = parseRequiredNumericId(request.kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);
    await this.assertKbDocStorageQuotaAvailable(uid, request.docSize);

    const docUrl = resolveKbDocUrlForJava(request.docUrl);
    const volcStrategyResourceId = resolveKbInitVolcStrategyResourceId();

    const docId = await this.agentKbJavaClient.createKbDoc({
      description: request.description.trim(),
      docSuffix: normalizedSuffix,
      docSize: request.docSize,
      docType: KB_DOC_TYPE_IMAGE,
      docUrl,
      kbId: kbNumericId,
      name: request.name.trim(),
      operatorId: subUserId,
      uid,
      volcStrategyResourceId,
    });

    this.logger.info(
      {
        docId,
        docSuffix: normalizedSuffix,
        docType: KB_DOC_TYPE_IMAGE,
        docUrl,
        kbId: request.kbId,
        name: request.name,
        operation: "kb-doc-create-image",
        subUserId,
        uid,
        volcStrategyResourceId,
      },
      "知识库图片创建成功",
    );

    return { docId };
  }

  async deleteKbDoc(tenant: AgentKbTenant, docId: string): Promise<KbDocDeleteResponse> {
    const uid = tenant.uid;
    const subUserId = tenant.subUserId;
    const docNumericId = parseRequiredNumericId(docId, "KB_DOC_NOT_FOUND", "知识不存在");

    await this.assertKbDocExists(uid, docNumericId);

    await this.agentKbJavaClient.deleteKbDoc({
      docId: docNumericId,
      operatorId: subUserId,
      uid,
    });

    this.logger.info(
      {
        docId,
        operation: "kb-doc-delete",
        subUserId,
        uid,
      },
      "知识库文档删除成功",
    );

    return { deleted: true };
  }

  async retryKbDoc(tenant: AgentKbTenant, docId: string): Promise<KbDocRetryResponse> {
    const uid = tenant.uid;
    const docNumericId = parseRequiredNumericId(docId, "KB_DOC_NOT_FOUND", "知识不存在");

    const doc = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(["id", "sync_status"])
      .where("id", "=", docNumericId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!doc) {
      throw new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
    }

    if (doc.sync_status !== KB_DOC_DB_SYNC_STATUS_FAILED) {
      throw new BadRequestError("KB_DOC_RETRY_NOT_ALLOWED", "当前知识不可重试");
    }

    await this.db
      .updateTable("xy_wap_embed_agent_kb_doc")
      .set({
        sync_error_msg: null,
        sync_status: KB_DOC_DB_SYNC_STATUS_QUEUED,
      })
      .where("id", "=", docNumericId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .execute();

    this.logger.info(
      {
        docId,
        operation: "kb-doc-retry",
        subUserId: tenant.subUserId,
        uid,
      },
      "知识库文档重试成功",
    );

    return { retried: true };
  }

  private assertDocumentCreateRequest(request: KbDocCreateRequest) {
    const normalizedSuffix = normalizeDocSuffix(request.docSuffix);

    if (!SUPPORTED_DOC_SUFFIXES.has(normalizedSuffix)) {
      throw new BadRequestError("INVALID_KB_DOC_SUFFIX", "不支持的文件类型");
    }

    if (
      PLAIN_TEXT_DOC_SUFFIXES.has(normalizedSuffix) &&
      request.parseMode === "enhanced"
    ) {
      throw new BadRequestError(
        "INVALID_KB_DOC_PARSE_MODE",
        "当前文件类型不支持增强解析",
      );
    }

    if (request.chunkStrategy !== request.chunkParams.strategy) {
      throw new BadRequestError("INVALID_KB_DOC_CHUNK_CONFIG", "切片配置无效");
    }

    if (!request.name.trim()) {
      throw new BadRequestError("INVALID_KB_DOC_NAME", "知识名称不能为空");
    }

    return normalizedSuffix;
  }

  private assertFaqCreateRequest(request: KbDocCreateFaqRequest) {
    const normalizedSuffix = normalizeDocSuffix(request.docSuffix);

    if (!SUPPORTED_FAQ_SUFFIXES.has(normalizedSuffix)) {
      throw new BadRequestError("INVALID_KB_DOC_SUFFIX", "不支持的文件类型");
    }

    if (!request.name.trim()) {
      throw new BadRequestError("INVALID_KB_DOC_NAME", "知识名称不能为空");
    }

    return normalizedSuffix;
  }

  private assertImageCreateRequest(request: KbDocCreateImageRequest) {
    const normalizedSuffix = normalizeDocSuffix(request.docSuffix);

    if (!SUPPORTED_IMAGE_SUFFIXES.has(normalizedSuffix)) {
      throw new BadRequestError("INVALID_KB_DOC_SUFFIX", "不支持的文件类型");
    }

    if (!request.name.trim()) {
      throw new BadRequestError("INVALID_KB_DOC_NAME", "知识名称不能为空");
    }

    if (!request.description.trim()) {
      throw new BadRequestError("INVALID_KB_DOC_DESCRIPTION", "图片描述不能为空");
    }

    return normalizedSuffix;
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

  private async assertKbDocExists(uid: number, docId: number) {
    const row = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(["id"])
      .where("id", "=", docId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
    }
  }

  private async assertKbDocStorageQuotaAvailable(uid: number, incomingDocSize: number) {
    const used = await new AiHostingQuotaService(this.db).sumKbDocStorageBytes(uid);

    if (used + incomingDocSize > AI_HOSTING_KB_DOC_STORAGE_QUOTA_LIMIT) {
      throw new BadRequestError(
        "KB_DOC_QUOTA_EXCEEDED",
        "知识库存储空间已达上限",
        {
          limit: AI_HOSTING_KB_DOC_STORAGE_QUOTA_LIMIT,
          used,
        },
      );
    }
  }
}

function normalizeDocSuffix(value: string) {
  return value.trim().toLowerCase().replace(/^\./, "");
}
