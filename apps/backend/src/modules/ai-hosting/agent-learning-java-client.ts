import {
  BadGatewayError,
  ServiceUnavailableError,
  UpstreamHttpError,
} from "../../shared/errors.js";
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
  code?: number;
  count?: number | string;
  data?: T;
  error?: number;
  errorMsg?: string;
  list?: T;
  message?: string;
  success?: boolean;
};

export type AgentLearningJavaApproveInput = {
  answer: string;
  id: string;
  operatorId: number;
  question: string;
  targetDocId: number;
  targetKbId: number;
  uid: number;
};

export type AgentLearningJavaRejectInput = {
  id: string;
  operatorId: number;
  uid: number;
  userReason?: string;
};

export type AgentLearningJavaBatchApproveInput = {
  ids: string[];
  operatorId: number;
  targetDocId: number;
  targetKbId: number;
  uid: number;
};

export type AgentLearningJavaBatchRejectInput = {
  ids: string[];
  operatorId: number;
  uid: number;
  userReason?: string;
};

export type AgentLearningJavaBatchApproveResult = {
  failDetails: Array<{ error: string; id: number | string }>;
  successCount: number;
};

export type AgentLearningJavaListInput = {
  agentId: number;
  page: number;
  pageSize: number;
  status?: number;
  uid: number;
};

export type AgentLearningJavaListItem = {
  agentAnswer?: string | null;
  aiReason?: string | null;
  answerSource?: number | null;
  confidence?: string | null;
  createTime?: string | null;
  customerQuestion?: string | null;
  id?: string | number | null;
  priorityScore?: number | null;
  seat?: {
    avatar?: string | null;
    id?: string | null;
    name?: string | null;
  } | null;
  status?: number | null;
  suggestedAnswer?: string | null;
  suggestedQuestion?: string | null;
  targetDocId?: string | null;
  targetEntryId?: string | null;
  targetKbId?: string | null;
  user?: {
    avatar?: string | null;
    id?: string | null;
    name?: string | null;
  } | null;
  userReason?: string | null;
};

export type AgentLearningJavaListResult = {
  items: AgentLearningJavaListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AgentLearningJavaClient = {
  approve: (input: AgentLearningJavaApproveInput) => Promise<void>;
  batchApprove: (
    input: AgentLearningJavaBatchApproveInput,
  ) => Promise<AgentLearningJavaBatchApproveResult>;
  batchReject: (input: AgentLearningJavaBatchRejectInput) => Promise<number>;
  list: (input: AgentLearningJavaListInput) => Promise<AgentLearningJavaListResult>;
  reject: (input: AgentLearningJavaRejectInput) => Promise<void>;
};

export function createAgentLearningJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): AgentLearningJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async approve(input) {
      await postJavaJsonEnvelope(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-learning/approve",
        {
          answer: input.answer,
          id: input.id,
          operatorId: input.operatorId,
          question: input.question,
          targetDocId: input.targetDocId,
          targetKbId: input.targetKbId,
          uid: input.uid,
        },
        logger,
        "agent-learning-approve",
        { candidateId: input.id, uid: input.uid },
      );
    },

    async reject(input) {
      const body: Record<string, string | number> = {
        id: input.id,
        operatorId: input.operatorId,
        uid: input.uid,
      };

      if (input.userReason?.trim()) {
        body.userReason = input.userReason.trim();
      }

      await postJavaJsonEnvelope(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-learning/reject",
        body,
        logger,
        "agent-learning-reject",
        { candidateId: input.id, uid: input.uid },
      );
    },

    async batchApprove(input) {
      const data = await postJavaJsonEnvelope<AgentLearningJavaBatchApproveResult>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-learning/batch-approve",
        {
          ids: input.ids,
          operatorId: input.operatorId,
          targetDocId: input.targetDocId,
          targetKbId: input.targetKbId,
          uid: input.uid,
        },
        logger,
        "agent-learning-batch-approve",
        { candidateIds: input.ids, uid: input.uid },
      );

      return {
        failDetails: Array.isArray(data?.failDetails) ? data.failDetails : [],
        successCount: normalizeNonNegativeInteger(data?.successCount),
      };
    },

    async batchReject(input) {
      const body: Record<string, unknown> = {
        ids: input.ids,
        operatorId: input.operatorId,
        uid: input.uid,
      };

      if (input.userReason?.trim()) {
        body.userReason = input.userReason.trim();
      }

      const data = await postJavaJsonEnvelope<number>(
        baseUrl,
        token,
        "/third-internal/wap-embed-agent-learning/batch-reject",
        body,
        logger,
        "agent-learning-batch-reject",
        { candidateIds: input.ids, uid: input.uid },
      );

      return normalizeNonNegativeInteger(data);
    },

    async list(input) {
      const body: Record<string, unknown> = {
        agentId: input.agentId,
        page: input.page,
        pageSize: input.pageSize,
        uid: input.uid,
      };

      if (input.status != null) {
        body.status = input.status;
      }

      const response = await postJavaRequest<
        JavaApiResponse<AgentLearningJavaListItem[]> & {
          page?: number | string;
          pageSize?: number | string;
          total?: number | string;
        }
      >({
        baseUrl,
        body: JSON.stringify(body),
        contentType: "application/json",
        logContext: {
          agentId: input.agentId,
          page: input.page,
          pageSize: input.pageSize,
          status: input.status,
          uid: input.uid,
        },
        logger,
        operation: "agent-learning-list",
        path: "/third-internal/wap-embed-agent-learning/list",
        token,
      });

      if (!isJavaEnvelopeSuccessful(response)) {
        throw new BadGatewayError(
          AI_HOSTING_INTERNAL_API_FAILED_CODE,
          AI_HOSTING_INTERNAL_API_USER_MESSAGE,
          {
            code: response.code,
            error: response.error,
            errorMsg: response.errorMsg ?? response.message,
            operation: "agent-learning-list",
          },
        );
      }

      return {
        items: Array.isArray(response.list)
          ? response.list
          : Array.isArray(response.data)
            ? response.data
            : [],
        page: normalizePositiveInteger(response.page, input.page),
        pageSize: normalizePositiveInteger(response.pageSize, input.pageSize),
        total: normalizeNonNegativeInteger(response.count ?? response.total),
      };
    },
  };
}

async function postJavaJsonEnvelope<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  body: Record<string, unknown>,
  logger: AppLogger,
  operation: string,
  logContext: Record<string, unknown>,
): Promise<T> {
  const response = await postJavaRequest<JavaApiResponse<T>>({
    baseUrl,
    body: JSON.stringify(body),
    contentType: "application/json",
    logContext,
    logger,
    operation,
    path,
    token,
  });

  if (!isJavaEnvelopeSuccessful(response)) {
    throw new BadGatewayError(AI_HOSTING_INTERNAL_API_FAILED_CODE, AI_HOSTING_INTERNAL_API_USER_MESSAGE, {
      code: response.code,
      error: response.error,
      errorMsg: response.errorMsg ?? response.message,
      operation,
    });
  }

  return response.data as T;
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
        response.status >= 500 ? 502 : response.status,
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
    throw new BadGatewayError(AI_HOSTING_INTERNAL_API_FAILED_CODE, AI_HOSTING_INTERNAL_API_USER_MESSAGE, {
      reason: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isJavaEnvelopeSuccessful(response: JavaApiResponse<unknown>) {
  if (response.success === true || response.error === 0) {
    return true;
  }

  return response.code === 0;
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

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());

    if (parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function readJavaApiTimeoutMs() {
  const configured = Number(process.env.JAVA_INTERNAL_API_TIMEOUT_MS);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
