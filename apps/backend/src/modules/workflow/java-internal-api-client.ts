import {
  getLoggerRequestId,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";

const DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS = 8000;

export async function postJavaInternalApi<T>(input: {
  baseUrl: string | undefined;
  body: string;
  createFailureError(status?: number): Error;
  createHttpFailureError?(status: number): Error;
  createNotConfiguredError(): Error;
  logContext?: Record<string, unknown>;
  logger: AppLogger | RequestAwareLogger;
  operation: string;
  path: string;
  token: string | undefined;
}): Promise<T> {
  const requestId = getLoggerRequestId(input.logger);
  if (!input.baseUrl) {
    input.logger.error(
      { operation: input.operation, path: input.path, requestId },
      "内部接口未配置",
    );
    throw input.createNotConfiguredError();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), readJavaApiTimeoutMs());
  try {
    const response = await fetch(`${input.baseUrl}${input.path}`, {
      body: input.body,
      headers: {
        "content-type": "application/json",
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
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
      input.logger.error(
        {
          ...input.logContext,
          operation: input.operation,
          path: input.path,
          requestId,
          status: response.status,
        },
        "内部接口返回非 JSON",
      );
      throw new ExpectedJavaInternalApiError(input.createFailureError(response.status));
    }
    if (!response.ok) {
      input.logger.error(
        {
          ...input.logContext,
          operation: input.operation,
          path: input.path,
          requestId,
          status: response.status,
        },
        "内部接口 HTTP 失败",
      );
      throw new ExpectedJavaInternalApiError(
        input.createHttpFailureError?.(response.status) ?? input.createFailureError(response.status),
      );
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof ExpectedJavaInternalApiError) throw error.error;
    input.logger.error(
      {
        ...input.logContext,
        err: error,
        operation: input.operation,
        path: input.path,
        requestId,
      },
      "内部接口请求异常",
    );
    throw input.createFailureError();
  } finally {
    clearTimeout(timeoutId);
  }
}

class ExpectedJavaInternalApiError {
  constructor(readonly error: Error) {}
}

function readJavaApiTimeoutMs() {
  const raw = Number(process.env.JAVA_INTERNAL_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
