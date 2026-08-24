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
const JAVA_ADD_WAY_LIST_PATH = "/third-internal/work-external-contact/add-way-list";

export const FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE = "FRIEND_ADD_WAY_INTERNAL_API_FAILED";
export const FRIEND_ADD_WAY_INTERNAL_API_NOT_CONFIGURED_CODE =
  "FRIEND_ADD_WAY_INTERNAL_API_NOT_CONFIGURED";
export const FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

type JavaApiResponse<T> = {
  code?: number;
  data?: T;
  error?: number;
  errorMsg?: string;
  error_msg?: string;
  list?: T;
  message?: string;
  success?: boolean;
};

export type FriendAddWayJavaChild = {
  key?: string | null;
  title?: string | null;
};

export type FriendAddWayJavaGroup = {
  children?: FriendAddWayJavaChild[] | null;
  key?: string | null;
  title?: string | null;
};

export type FriendAddWayJavaClient = {
  listAddWays: (input: { uid: number }) => Promise<{
    groups: FriendAddWayJavaGroup[];
  }>;
};

export function createFriendAddWayJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): FriendAddWayJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async listAddWays(input) {
      const response = await postJavaRequest<JavaApiResponse<FriendAddWayJavaGroup[]>>({
        baseUrl,
        body: JSON.stringify({ uid: input.uid }),
        logContext: { uid: input.uid },
        logger,
        operation: "friend-add-way-list",
        path: JAVA_ADD_WAY_LIST_PATH,
        token,
      });

      assertJavaSuccess(response);

      return {
        groups: extractJavaListItems<FriendAddWayJavaGroup>(response),
      };
    },
  };
}

function extractJavaListItems<T>(response: JavaApiResponse<unknown>): T[] {
  const candidates: unknown[] = [response.data, response.list];

  if (response.data && typeof response.data === "object" && !Array.isArray(response.data)) {
    const nested = response.data as { info?: unknown; list?: unknown };
    candidates.push(nested.list, nested.info);
  }

  let emptyFallback: T[] | null = null;
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    if (candidate.length > 0) {
      return candidate as T[];
    }

    emptyFallback ??= candidate as T[];
  }

  return emptyFallback ?? [];
}

function assertJavaSuccess(response: JavaApiResponse<unknown>) {
  if (isJavaEnvelopeSuccessful(response)) {
    return;
  }

  throw new BadGatewayError(
    FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
    FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
    {
      code: response.code,
      error: response.error,
      errorMsg: response.errorMsg ?? response.error_msg ?? response.message,
      operation: "friend-add-way-list",
    },
  );
}

type PostJavaRequestOptions = {
  baseUrl: string | undefined;
  body: string;
  logContext: Record<string, unknown>;
  logger: AppLogger;
  operation: string;
  path: string;
  token: string | undefined;
};

async function postJavaRequest<T>({
  baseUrl,
  body,
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
      FRIEND_ADD_WAY_INTERNAL_API_NOT_CONFIGURED_CODE,
      FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readJavaApiTimeoutMs());
  const requestId = getLoggerRequestId(logger);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      body,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      method: "POST",
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown;

    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      logger.error(
        {
          ...logContext,
          operation,
          path,
          requestId,
          status: response.status,
        },
        "内部接口返回非 JSON",
      );
      throw new BadGatewayError(
        FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
        FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
        { operation, status: response.status },
      );
    }

    if (!response.ok) {
      logger.error(
        {
          ...logContext,
          operation,
          path,
          requestId,
          status: response.status,
        },
        "内部接口 HTTP 失败",
      );
      throw new UpstreamHttpError(
        FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
        FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
        response.status,
        { operation },
      );
    }

    return parsed as T;
  } catch (error) {
    if (
      error instanceof BadGatewayError
      || error instanceof ServiceUnavailableError
      || error instanceof UpstreamHttpError
    ) {
      throw error;
    }

    logger.error(
      {
        ...logContext,
        err: error,
        operation,
        path,
        requestId,
      },
      "内部接口请求异常",
    );
    throw new BadGatewayError(
      FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
      FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
      { operation },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function isJavaEnvelopeSuccessful(response: JavaApiResponse<unknown>) {
  if (typeof response.success === "boolean") {
    return response.success;
  }

  if (typeof response.error === "number") {
    return response.error === 0;
  }

  if (typeof response.code === "number") {
    return response.code === 0;
  }

  return true;
}

function readJavaApiTimeoutMs() {
  const raw = Number(process.env.JAVA_INTERNAL_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
