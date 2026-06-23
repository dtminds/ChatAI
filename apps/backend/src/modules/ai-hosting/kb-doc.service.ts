import { randomUUID } from "node:crypto";
import type {
  KbDocCreateRequest,
  KbDocCreateResponse,
  KbDocUploadCredentialResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { resolveVolcStrategyResourceId } from "./kb-doc-strategy-mappers.js";

export const KB_DOC_TYPE_DOCUMENT = 2;

const PLAIN_TEXT_DOC_SUFFIXES = new Set(["md", "txt"]);

type KbDocServiceLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
};

export class KbDocService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger: KbDocServiceLogger = {
      info() {
        // noop
      },
    },
  ) {}

  async getUploadCredential(subUserId: string): Promise<KbDocUploadCredentialResponse> {
    const uid = await this.resolveUid(subUserId);

    const response = {
      mocked: true as const,
      requestId: `kb-doc-upload-${uid}-${randomUUID()}`,
    };

    this.logger.info(
      {
        operation: "kb-doc-upload-credential",
        requestId: response.requestId,
        subUserId,
        uid,
      },
      "知识库文档上传凭证（mock）",
    );

    return response;
  }

  async createKbDoc(
    subUserId: string,
    request: KbDocCreateRequest,
  ): Promise<KbDocCreateResponse> {
    const uid = await this.resolveUid(subUserId);
    this.assertCreateRequest(request);

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
        docSuffix: request.docSuffix,
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
    const normalizedSuffix = request.docSuffix.trim().toLowerCase();

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

    if (!subUser?.uid) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    return subUser.uid;
  }
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
