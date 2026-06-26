import type {
  KbDocCreateFaqRequest,
  KbDocCreateImageRequest,
  KbDocCreateRequest,
  KbDocCreateResponse,
  KbDocDeleteResponse,
  KbDocUploadCredentialResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import type { WorkbenchJavaClient } from "../chat/workbench-java-client.js";
import type { AgentKbJavaClient } from "./agent-kb-java-client.js";
import {
  resolveKbInitVolcStrategyResourceId,
  resolveVolcStrategyResourceId,
} from "./kb-doc-strategy-mappers.js";
import { resolveKbDocUrlForJava } from "./kb-doc-url.js";
import { parseRequiredNumericId, resolveAgentKbUid } from "./kb-tenant-utils.js";

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

  async getUploadCredential(subUserId: string): Promise<KbDocUploadCredentialResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);

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
    subUserId: string,
    request: KbDocCreateRequest,
  ): Promise<KbDocCreateResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const normalizedSuffix = this.assertDocumentCreateRequest(request);
    const kbNumericId = parseRequiredNumericId(request.kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);

    const volcStrategyResourceId = resolveVolcStrategyResourceId({
      chunkParams: request.chunkParams,
      chunkStrategy: request.chunkStrategy,
      parseMode: request.parseMode,
    });
    const docUrl = resolveKbDocUrlForJava(request.docUrl);

    const docId = await this.agentKbJavaClient.createKbDoc({
      description: request.description,
      docSuffix: normalizedSuffix,
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
    subUserId: string,
    request: KbDocCreateFaqRequest,
  ): Promise<KbDocCreateResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const normalizedSuffix = this.assertFaqCreateRequest(request);
    const kbNumericId = parseRequiredNumericId(request.kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);

    const docUrl = resolveKbDocUrlForJava(request.docUrl);
    const volcStrategyResourceId = resolveKbInitVolcStrategyResourceId();

    const docId = await this.agentKbJavaClient.createKbDoc({
      description: request.description,
      docSuffix: normalizedSuffix,
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
    subUserId: string,
    request: KbDocCreateImageRequest,
  ): Promise<KbDocCreateResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const normalizedSuffix = this.assertImageCreateRequest(request);
    const kbNumericId = parseRequiredNumericId(request.kbId, "KB_NOT_FOUND", "知识库不存在");

    await this.assertKbExists(uid, kbNumericId);

    const docUrl = resolveKbDocUrlForJava(request.docUrl);
    const volcStrategyResourceId = resolveKbInitVolcStrategyResourceId();

    const docId = await this.agentKbJavaClient.createKbDoc({
      description: request.description.trim(),
      docSuffix: normalizedSuffix,
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

  async deleteKbDoc(subUserId: string, docId: string): Promise<KbDocDeleteResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
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
}

function normalizeDocSuffix(value: string) {
  return value.trim().toLowerCase().replace(/^\./, "");
}
