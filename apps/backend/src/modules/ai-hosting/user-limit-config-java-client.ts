import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
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

export const USER_LIMIT_CONFIG_INTERNAL_API_FAILED_CODE =
  "USER_LIMIT_CONFIG_INTERNAL_API_FAILED";
export const USER_LIMIT_CONFIG_INTERNAL_API_NOT_CONFIGURED_CODE =
  "USER_LIMIT_CONFIG_INTERNAL_API_NOT_CONFIGURED";
export const USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

export const CHAT_AI_XINGYUN_RESOURCE_AUTHORIZATION_CONFIG_KEY =
  "chat_ai_xingyun_resource_authorization";

export type UserLimitConfigJavaClient = {
  getByConfigKey: (input: {
    configKey: string;
    uid: number;
  }) => Promise<number>;
  setByConfigKey: (input: {
    configKey: string;
    uid: number;
    value: number;
  }) => Promise<boolean>;
};

export function createUserLimitConfigJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): UserLimitConfigJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async getByConfigKey(input) {
      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify({
          configKey: input.configKey,
          uid: input.uid,
        }),
        logContext: {
          configKey: input.configKey,
          uid: input.uid,
        },
        logger,
        operation: "user-limit-config-get-by-config-key",
        path: "/third-internal/user-limit-config/get-by-config-key",
        token,
      });

      const payload = decodeJavaResponse(
        response,
        "user-limit-config-get-by-config-key",
      );
      return normalizeConfigValue(payload.data);
    },

    async setByConfigKey(input) {
      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify({
          configKey: input.configKey,
          uid: input.uid,
          value: input.value,
        }),
        logContext: {
          configKey: input.configKey,
          uid: input.uid,
          value: input.value,
        },
        logger,
        operation: "user-limit-config-set-by-config-key",
        path: "/third-internal/user-limit-config/set-by-config-key",
        token,
      });

      const payload = decodeJavaResponse(
        response,
        "user-limit-config-set-by-config-key",
      );
      return payload.data === true;
    },
  };
}

function normalizeConfigValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function decodeJavaResponse(response: unknown, operation: string) {
  const envelope = decodeJavaInternalApiEnvelope(response);
  if (envelope.kind === "success") {
    return envelope.payload;
  }

  throw new BadGatewayError(
    USER_LIMIT_CONFIG_INTERNAL_API_FAILED_CODE,
    USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE,
    envelope.kind === "rejected"
      ? { error: envelope.error, errorMsg: envelope.errorMsg, operation }
      : { operation, reason: envelope.reason },
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
      USER_LIMIT_CONFIG_INTERNAL_API_NOT_CONFIGURED_CODE,
      USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE,
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
        USER_LIMIT_CONFIG_INTERNAL_API_FAILED_CODE,
        USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE,
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
        USER_LIMIT_CONFIG_INTERNAL_API_FAILED_CODE,
        USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE,
        response.status,
        { operation },
      );
    }

    return parsed as T;
  } catch (error) {
    if (
      error instanceof BadGatewayError ||
      error instanceof ServiceUnavailableError ||
      error instanceof UpstreamHttpError
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
      USER_LIMIT_CONFIG_INTERNAL_API_FAILED_CODE,
      USER_LIMIT_CONFIG_INTERNAL_API_USER_MESSAGE,
      { operation },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function readJavaApiTimeoutMs() {
  const raw = Number(process.env.JAVA_INTERNAL_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
