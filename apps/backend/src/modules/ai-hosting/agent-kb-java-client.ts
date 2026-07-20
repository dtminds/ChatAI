import {
  BadGatewayError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UpstreamHttpError,
} from "../../shared/errors.js";
import type { AgentKbJavaChunkPageItem } from "./kb-chunk-java-mappers.js";
import {
  getLoggerRequestId,
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";

const DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS = 8000;

export const AI_HOSTING_INTERNAL_API_FAILED_CODE = "AI_HOSTING_INTERNAL_API_FAILED";
export const AI_HOSTING_INTERNAL_API_NOT_CONFIGURED_CODE =
  "AI_HOSTING_INTERNAL_API_NOT_CONFIGURED";
export const AI_HOSTING_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

type JavaApiResponse<T> = {
  data?: T;
  error?: number;
  errorMsg?: string;
  success?: boolean;
};

type JavaChunkPageResponse = JavaApiResponse<unknown> & {
  count?: number;
  list?: AgentKbJavaChunkPageItem[];
  page?: number;
  pageSize?: number;
};

export type AgentKbJavaCreateKbInput = {
  name: string;
  operatorId: string;
  remark?: string;
  uid: number;
};

export type AgentKbJavaUpdateKbInput = {
  kbId: number;
  lastOperatorId: string;
  name: string;
  remark?: string;
  uid: number;
};

export type AgentKbJavaDeleteKbInput = {
  kbId: number;
  uid: number;
};

export type AgentKbJavaCreateDocInput = {
  description?: string;
  docSuffix: string;
  docSize: number;
  docType: 1 | 2 | 3 | 4 | 5 | 6;
  docUrl: string;
  kbId: number;
  name: string;
  operatorId: string;
  uid: number;
  volcStrategyResourceId?: string;
};

export type AgentKbJavaDeleteDocInput = {
  docId: number;
  operatorId: string;
  uid: number;
};

export type AgentKbJavaRetryDocInput = {
  docId: number;
  operatorId: string;
  uid: number;
};

export type AgentKbJavaAddChunkInput = {
  attachmentIds?: number[];
  attachmentTypes?: number[];
  chunkType: "text" | "faq";
  content: string;
  docId: number;
  operatorId: string;
  title?: string;
  uid: number;
};

export type AgentKbJavaUpdateChunkInput = {
  attachmentIds?: number[];
  attachmentTypes?: number[];
  chunkId: number;
  content: string;
  operatorId: string;
  title?: string;
  uid: number;
};

export type AgentKbJavaDeleteChunkInput = {
  chunkId: number;
  operatorId: string;
  uid: number;
};

export type AgentKbJavaBatchDeleteChunksInput = {
  chunkIds: number[];
  operatorId: string;
  uid: number;
};

export type AgentKbJavaBatchDeleteChunksResponse = {
  failCount: number;
  successCount: number;
};

export type AgentKbJavaListChunksInput = {
  attachmentType?: number;
  content?: string;
  docId: number;
  page: number;
  pageSize: number;
  title?: string;
  uid: number;
  volcChunkId?: string;
};

export type AgentKbJavaListChunksResponse = {
  count: number;
  list: AgentKbJavaChunkPageItem[];
  page: number;
  pageSize: number;
};

export type AgentKbJavaClient = {
  addKbChunk(input: AgentKbJavaAddChunkInput): Promise<string>;
  createKb(input: AgentKbJavaCreateKbInput): Promise<string>;
  createKbDoc(input: AgentKbJavaCreateDocInput): Promise<string>;
  deleteKb(input: AgentKbJavaDeleteKbInput): Promise<void>;
  deleteKbChunk(input: AgentKbJavaDeleteChunkInput): Promise<void>;
  batchDeleteKbChunks(
    input: AgentKbJavaBatchDeleteChunksInput,
  ): Promise<AgentKbJavaBatchDeleteChunksResponse>;
  deleteKbDoc(input: AgentKbJavaDeleteDocInput): Promise<void>;
  retryKbDoc(input: AgentKbJavaRetryDocInput): Promise<void>;
  listKbChunks(input: AgentKbJavaListChunksInput): Promise<AgentKbJavaListChunksResponse>;
  updateKb(input: AgentKbJavaUpdateKbInput): Promise<void>;
  updateKbChunk(input: AgentKbJavaUpdateChunkInput): Promise<void>;
};

export function createAgentKbJavaClient(
  logger: RequestAwareLogger = noopLogger,
): AgentKbJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async addKbChunk(input) {
      const body: Record<string, unknown> = {
        chunkType: input.chunkType,
        content: input.content,
        docId: input.docId,
        operatorId: input.operatorId,
        uid: input.uid,
      };

      if (input.title?.trim()) {
        body.title = input.title.trim();
      }

      if (input.attachmentTypes?.length) {
        body.attachmentTypes = input.attachmentTypes;
      }

      if (input.attachmentIds?.length) {
        body.attachmentIds = input.attachmentIds;
      }

      const chunkId = await postJavaJsonEnvelopeObject<number | string>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-chunk/add",
        body,
        logger,
        "agent-kb-chunk-add",
        input,
      );

      return normalizeJavaChunkId(chunkId);
    },
    async createKb(input) {
      const body: Record<string, string | number> = {
        name: input.name,
        operatorId: input.operatorId,
        uid: input.uid,
      };

      if (input.remark?.trim()) {
        body.remark = input.remark.trim();
      }

      const kbId = await postJavaJsonEnvelope<number | string>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb/create",
        body,
        logger,
        "agent-kb-create",
        input,
      );

      return normalizeJavaDocId(kbId);
    },
    async deleteKb(input) {
      await postJavaJsonEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb/del",
        {
          id: input.kbId,
          uid: input.uid,
        },
        logger,
        "agent-kb-delete",
        input,
      );
    },
    async createKbDoc(input) {
      const form = new URLSearchParams();
      appendFormField(form, "uid", input.uid);
      appendFormField(form, "kbId", input.kbId);
      appendFormField(form, "docType", input.docType);
      appendFormField(form, "docUrl", input.docUrl);
      appendFormField(form, "docSuffix", input.docSuffix);
      appendFormField(form, "docSize", input.docSize);
      appendFormField(form, "name", input.name);
      appendFormField(form, "operatorId", input.operatorId);

      if (input.description?.trim()) {
        appendFormField(form, "description", input.description.trim());
      }

      if (input.volcStrategyResourceId) {
        appendFormField(form, "volcStrategyResourceId", input.volcStrategyResourceId);
      }

      const docId = await postJavaFormEnvelope<number | string>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-doc/create",
        form,
        logger,
        "agent-kb-doc-create",
        input,
      );

      return normalizeJavaDocId(docId);
    },
    async deleteKbDoc(input) {
      await postJavaJsonEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-doc/del",
        {
          id: input.docId,
          operatorId: input.operatorId,
          uid: input.uid,
        },
        logger,
        "agent-kb-doc-delete",
        input,
      );
    },
    async retryKbDoc(input) {
      await postJavaJsonEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-doc/retry",
        {
          id: input.docId,
          operatorId: input.operatorId,
          uid: input.uid,
        },
        logger,
        "agent-kb-doc-retry",
        input,
      );
    },
    async deleteKbChunk(input) {
      await postJavaJsonEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-chunk/del",
        {
          id: input.chunkId,
          operatorId: input.operatorId,
          uid: input.uid,
        },
        logger,
        "agent-kb-chunk-delete",
        input,
      );
    },
    async batchDeleteKbChunks(input) {
      const result = await postJavaJsonEnvelopeObject<AgentKbJavaBatchDeleteChunksResponse>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-chunk/delBatch",
        {
          ids: input.chunkIds,
          operatorId: input.operatorId,
          uid: input.uid,
        },
        logger,
        "agent-kb-chunk-batch-delete",
        input,
      );

      return normalizeJavaBatchDeleteChunksResponse(result);
    },
    async listKbChunks(input) {
      const body: Record<string, number | string> = {
        docId: input.docId,
        page: input.page,
        pageSize: input.pageSize,
        uid: input.uid,
      };

      const normalizedContent = input.content?.trim();
      const normalizedTitle = input.title?.trim();
      const normalizedVolcChunkId = input.volcChunkId?.trim();

      if (normalizedContent) {
        body.content = normalizedContent;
      }

      if (normalizedTitle) {
        body.title = normalizedTitle;
      }

      if (normalizedVolcChunkId) {
        body.volcChunkId = normalizedVolcChunkId;
      }

      if (input.attachmentType != null) {
        body.attachmentType = input.attachmentType;
      }

      const response = await postJavaJson<JavaChunkPageResponse>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-chunk/page",
        body,
        logger,
        "agent-kb-chunk-page",
        input,
      );

      if (!isJavaEnvelopeSuccessful(response)) {
        throw mapAgentKbJavaBusinessError(response, "agent-kb-chunk-page");
      }

      return {
        count: Number(response.count ?? 0),
        list: response.list ?? [],
        page: Number(response.page ?? input.page),
        pageSize: Number(response.pageSize ?? input.pageSize),
      };
    },
    async updateKb(input) {
      const body: Record<string, string | number> = {
        id: input.kbId,
        lastOperatorId: input.lastOperatorId,
        name: input.name,
        uid: input.uid,
      };

      if (input.remark?.trim()) {
        body.remark = input.remark.trim();
      }

      await postJavaJsonEnvelope<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb/update",
        body,
        logger,
        "agent-kb-update",
        input,
      );
    },
    async updateKbChunk(input) {
      const body: Record<string, unknown> = {
        content: input.content,
        id: input.chunkId,
        operatorId: input.operatorId,
        uid: input.uid,
      };

      if (input.title?.trim()) {
        body.title = input.title.trim();
      }

      if (input.attachmentTypes?.length) {
        body.attachmentTypes = input.attachmentTypes;
      }

      if (input.attachmentIds?.length) {
        body.attachmentIds = input.attachmentIds;
      }

      await postJavaJsonEnvelopeObject<boolean>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-kb-chunk/update",
        body,
        logger,
        "agent-kb-chunk-update",
        input,
      );
    },
  };
}

async function postJavaFormEnvelope<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  form: URLSearchParams,
  logger: AppLogger,
  operation: string,
  logContext: Record<string, unknown>,
): Promise<T> {
  const response = await postJavaForm<JavaApiResponse<T>>(
    baseUrl,
    token,
    path,
    form,
    logger,
    operation,
    logContext,
  );

  if (!isJavaEnvelopeSuccessful(response)) {
    throw mapAgentKbJavaBusinessError(response, operation);
  }

  return response.data as T;
}

async function postJavaJsonEnvelopeObject<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: Record<string, unknown>,
  logger: AppLogger,
  operation: string,
  logContext: Record<string, unknown>,
): Promise<T> {
  const response = await postJavaJsonObject<JavaApiResponse<T>>(
    baseUrl,
    token,
    path,
    body,
    logger,
    operation,
    logContext,
  );

  if (!isJavaEnvelopeSuccessful(response)) {
    throw mapAgentKbJavaBusinessError(response, operation);
  }

  return response.data as T;
}

async function postJavaJsonEnvelope<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: Record<string, string | number>,
  logger: AppLogger,
  operation: string,
  logContext: Record<string, unknown>,
): Promise<T> {
  const response = await postJavaJson<JavaApiResponse<T>>(
    baseUrl,
    token,
    path,
    body,
    logger,
    operation,
    logContext,
  );

  if (!isJavaEnvelopeSuccessful(response)) {
    throw mapAgentKbJavaBusinessError(response, operation);
  }

  return response.data as T;
}

async function postJavaJsonObject<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: Record<string, unknown>,
  logger: AppLogger,
  operation: string,
  logContext: Record<string, unknown>,
): Promise<T> {
  return postJavaRequest<T>({
    baseUrl,
    body: JSON.stringify(body),
    contentType: "application/json",
    logContext,
    logger,
    operation,
    path,
    token,
  });
}

async function postJavaJson<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: Record<string, string | number>,
  logger: AppLogger,
  operation: string,
  logContext: Record<string, unknown>,
): Promise<T> {
  return postJavaRequest<T>({
    baseUrl,
    body: JSON.stringify(body),
    contentType: "application/json",
    logContext,
    logger,
    operation,
    path,
    token,
  });
}

async function postJavaForm<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  form: URLSearchParams,
  logger: AppLogger,
  operation: string,
  logContext: Record<string, unknown>,
): Promise<T> {
  return postJavaRequest<T>({
    baseUrl,
    body: form.toString(),
    contentType: "application/x-www-form-urlencoded",
    logContext,
    logger,
    operation,
    path,
    token,
  });
}

type PostJavaRequestOptions = {
  baseUrl: string | undefined;
  body: string;
  contentType: string;
  logContext: Record<string, unknown>;
  logger: AppLogger;
  operation: string;
  path: string;
  token: string | undefined;
};

async function postJavaRequest<T>({
  baseUrl,
  body,
  contentType,
  logContext,
  logger,
  operation,
  path,
  token,
}: PostJavaRequestOptions): Promise<T> {
  if (!baseUrl) {
    logger.error(
      {
        operation,
        path,
        requestId: getLoggerRequestId(logger),
      },
      "内部接口未配置",
    );
    throw new ServiceUnavailableError(
      AI_HOSTING_INTERNAL_API_NOT_CONFIGURED_CODE,
      AI_HOSTING_INTERNAL_API_USER_MESSAGE,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readJavaApiTimeoutMs());
  const requestId = getLoggerRequestId(logger);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      body,
      headers: {
        "content-type": contentType,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.error(
        {
          ...logContext,
          operation,
          path,
          requestId,
          status: response.status,
        },
        "内部接口返回异常状态",
      );
      throw new UpstreamHttpError(
        AI_HOSTING_INTERNAL_API_FAILED_CODE,
        AI_HOSTING_INTERNAL_API_USER_MESSAGE,
        mapJavaHttpFailureStatus(response.status),
        {
          status: response.status,
        },
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (
      error instanceof UpstreamHttpError ||
      error instanceof ServiceUnavailableError ||
      error instanceof NotFoundError ||
      error instanceof BadGatewayError
    ) {
      throw error;
    }

    logger.error(
      {
        ...logContext,
        operation,
        path,
        reason: error instanceof Error ? error.name : "unknown",
        requestId,
      },
      "内部接口调用失败",
    );
    throw attachErrorCause(
      new BadGatewayError(AI_HOSTING_INTERNAL_API_FAILED_CODE, AI_HOSTING_INTERNAL_API_USER_MESSAGE, {
        reason: error instanceof Error ? error.name : "unknown",
      }),
      error,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

const AGENT_KB_JAVA_ERROR_TOKENS = {
  CHUNK_NOT_EDITABLE: "CHUNK_NOT_EDITABLE",
  CHUNK_NOT_FOUND: "CHUNK_NOT_FOUND",
  DOC_NOT_FOUND: "DOC_NOT_FOUND",
  KB_NOT_FOUND: "KB_NOT_FOUND",
} as const;

type AgentKbJavaErrorKind =
  | "chunk_not_editable"
  | "chunk_not_found"
  | "doc_not_found"
  | "kb_not_found";

function mapAgentKbJavaBusinessError(response: JavaApiResponse<unknown>, operation: string) {
  const errorMsg = response.errorMsg?.trim() ?? "";
  const kind = resolveAgentKbJavaErrorKind(errorMsg);
  const details = {
    error: response.error,
    errorMsg,
    operation,
    token: extractAgentKbJavaErrorToken(errorMsg),
  };

  if (
    (operation === "agent-kb-doc-delete" || operation === "agent-kb-doc-retry") &&
    kind === "doc_not_found"
  ) {
    return new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
  }

  if (operation === "agent-kb-update" && kind === "kb_not_found") {
    return new NotFoundError("KB_NOT_FOUND", "知识库不存在");
  }

  if (operation === "agent-kb-delete" && kind === "kb_not_found") {
    return new NotFoundError("KB_NOT_FOUND", "知识库不存在");
  }

  if (operation === "agent-kb-chunk-delete" && (kind === "chunk_not_found" || kind === "doc_not_found")) {
    return new NotFoundError("KB_CHUNK_NOT_FOUND", "切片不存在");
  }

  if (operation === "agent-kb-chunk-page" && kind === "doc_not_found") {
    return new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
  }

  if (operation === "agent-kb-chunk-update" && kind === "chunk_not_editable") {
    return new ForbiddenError("KB_CHUNK_NOT_EDITABLE", "系统切片不可编辑");
  }

  if (kind === "kb_not_found") {
    return new NotFoundError("KB_NOT_FOUND", "知识库不存在");
  }

  if (kind === "doc_not_found") {
    return new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
  }

  return new BadGatewayError(
    AI_HOSTING_INTERNAL_API_FAILED_CODE,
    errorMsg || AI_HOSTING_INTERNAL_API_USER_MESSAGE,
    details,
  );
}

function resolveAgentKbJavaErrorKind(errorMsg: string): AgentKbJavaErrorKind | undefined {
  const token = extractAgentKbJavaErrorToken(errorMsg);

  if (token === AGENT_KB_JAVA_ERROR_TOKENS.CHUNK_NOT_EDITABLE) {
    return "chunk_not_editable";
  }

  if (token === AGENT_KB_JAVA_ERROR_TOKENS.CHUNK_NOT_FOUND) {
    return "chunk_not_found";
  }

  if (token === AGENT_KB_JAVA_ERROR_TOKENS.DOC_NOT_FOUND) {
    return "doc_not_found";
  }

  if (token === AGENT_KB_JAVA_ERROR_TOKENS.KB_NOT_FOUND) {
    return "kb_not_found";
  }

  if (errorMsg.includes("切片不存在")) {
    return "chunk_not_found";
  }

  if (errorMsg.includes("不可编辑")) {
    return "chunk_not_editable";
  }

  if (errorMsg.includes("知识不存在")) {
    return "doc_not_found";
  }

  if (errorMsg.includes("知识库不存在")) {
    return "kb_not_found";
  }

  return undefined;
}

function extractAgentKbJavaErrorToken(errorMsg: string) {
  const normalized = errorMsg.trim();

  if (!normalized) {
    return undefined;
  }

  const tokens = Object.values(AGENT_KB_JAVA_ERROR_TOKENS);
  const exactMatch = tokens.find((token) => token === normalized);

  if (exactMatch) {
    return exactMatch;
  }

  return tokens.find((token) => normalized.includes(token));
}

function attachErrorCause(error: BadGatewayError, cause: unknown) {
  if (cause instanceof Error) {
    error.cause = cause;
  }

  return error;
}

function isJavaEnvelopeSuccessful(response: JavaApiResponse<unknown>) {
  if (response.success === true) {
    return true;
  }

  return response.error === 0;
}

function normalizeJavaBatchDeleteChunksResponse(
  value: AgentKbJavaBatchDeleteChunksResponse,
): AgentKbJavaBatchDeleteChunksResponse {
  return {
    failCount: normalizeNonNegativeInteger(value.failCount),
    successCount: normalizeNonNegativeInteger(value.successCount),
  };
}

function normalizeNonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return 0;
}

function normalizeJavaChunkId(value: number | string) {
  return normalizeJavaDocId(value);
}

function normalizeJavaDocId(value: number | string) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value !== "string") {
    throw new BadGatewayError(
      AI_HOSTING_INTERNAL_API_FAILED_CODE,
      AI_HOSTING_INTERNAL_API_USER_MESSAGE,
    );
  }

  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    throw new BadGatewayError(
      AI_HOSTING_INTERNAL_API_FAILED_CODE,
      AI_HOSTING_INTERNAL_API_USER_MESSAGE,
    );
  }

  return trimmed;
}

function appendFormField(form: URLSearchParams, key: string, value: string | number) {
  form.append(key, String(value));
}

function mapJavaHttpFailureStatus(status: number) {
  if (status === 429 || status === 503 || status === 504) {
    return status;
  }

  return 502;
}

function readJavaApiTimeoutMs() {
  const value = Number.parseInt(process.env.JAVA_INTERNAL_API_TIMEOUT_MS ?? "", 10);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
