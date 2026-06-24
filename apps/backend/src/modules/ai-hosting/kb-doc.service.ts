import { randomUUID } from "node:crypto";
import type {
  KbDocCreateRequest,
  KbDocCreateResponse,
  KbDocUploadCredentialResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import type { WorkbenchJavaClient } from "../chat/workbench-java-client.js";
import { resolveVolcStrategyResourceId } from "./kb-doc-strategy-mappers.js";

export const KB_DOC_TYPE_DOCUMENT = 2;

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

type KbDocServiceLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
};

export class KbDocService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger: KbDocServiceLogger,
    private readonly javaClient: WorkbenchJavaClient,
  ) {}

  async getUploadCredential(subUserId: string): Promise<KbDocUploadCredentialResponse> {
    const uid = await this.resolveUid(subUserId);

    const credential = await this.javaClient.getUploadCredential({ uid });

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
    const uid = await this.resolveUid(subUserId);
    const normalizedSuffix = this.assertCreateRequest(request);

    const volcStrategyResourceId = resolveVolcStrategyResourceId({
      chunkParams: request.chunkParams,
      chunkStrategy: request.chunkStrategy,
      parseMode: request.parseMode,
    });

    const docId = randomUUID();

    // Java API POST /third-internal/wap-embed-agent-kb-doc/create is not available yet.
    this.logger.info(
      {
        description: request.description,
        docId,
        docSuffix: normalizedSuffix,
        docType: KB_DOC_TYPE_DOCUMENT,
        docUrl: request.docUrl,
        kbId: request.kbId,
        name: request.name,
        operation: "kb-doc-create",
        subUserId,
        uid,
        volcStrategyResourceId,
      },
      "知识库文档创建（mock，未调用 Java）",
    );

    return { docId };
  }

  private assertCreateRequest(request: KbDocCreateRequest) {
    const normalizedSuffix = normalizeDocSuffix(request.docSuffix);

    if (!SUPPORTED_DOC_SUFFIXES.has(normalizedSuffix)) {
      throw new BadRequestError(
        "INVALID_KB_DOC_SUFFIX",
        "不支持的文件类型",
      );
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
      throw new BadRequestError(
        "INVALID_KB_DOC_CHUNK_CONFIG",
        "切片配置无效",
      );
    }

    return normalizedSuffix;
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
      .where("status", "=", 1)
      .executeTakeFirst();

    if (subUser?.uid == null) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    return subUser.uid;
  }
}

function normalizeDocSuffix(value: string) {
  return value.trim().toLowerCase().replace(/^\./, "");
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
