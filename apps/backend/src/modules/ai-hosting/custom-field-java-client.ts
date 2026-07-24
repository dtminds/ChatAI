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

export const CUSTOM_FIELD_INTERNAL_API_FAILED_CODE = "CUSTOM_FIELD_INTERNAL_API_FAILED";
export const CUSTOM_FIELD_INTERNAL_API_NOT_CONFIGURED_CODE =
  "CUSTOM_FIELD_INTERNAL_API_NOT_CONFIGURED";
export const CUSTOM_FIELD_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

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

export type CustomFieldJavaOption = {
  optionMatch?: string | null;
  optionValue?: number | string | null;
};

export type CustomFieldJavaItem = {
  fieldId?: number | string | null;
  key?: string | null;
  optionInfoList?: CustomFieldJavaOption[] | null;
  picUrl?: string[] | null;
  sort?: number | string | null;
  title?: string | null;
  type?: number | string | null;
  value?: string | null;
};

export type CustomFieldJavaSelectListInput = {
  /** 0 关闭，1 开启；不传则返回开启和关闭 */
  status?: 0 | 1;
  uid: number;
};

export type CustomFieldJavaSelectListResult = {
  items: CustomFieldJavaItem[];
};

export type CustomFieldJavaClient = {
  selectList: (
    input: CustomFieldJavaSelectListInput,
  ) => Promise<CustomFieldJavaSelectListResult>;
};

export function createCustomFieldJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): CustomFieldJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async selectList(input) {
      // Swagger 参数名 reqTO 对应 @RequestBody；实际 JSON 为 flat 字段（与现有 third-internal 一致）
      const body: Record<string, unknown> = {
        uid: input.uid,
      };

      if (input.status != null) {
        body.status = input.status;
      }

      const response = await postJavaRequest<JavaApiResponse<CustomFieldJavaItem[]>>({
        baseUrl,
        body: JSON.stringify(body),
        logContext: {
          status: input.status,
          uid: input.uid,
        },
        logger,
        operation: "custom-field-select-list",
        path: "/third-internal/custom-field/select-list",
        token,
      });

      if (!isJavaEnvelopeSuccessful(response)) {
        throw new BadGatewayError(
          CUSTOM_FIELD_INTERNAL_API_FAILED_CODE,
          CUSTOM_FIELD_INTERNAL_API_USER_MESSAGE,
          {
            code: response.code,
            error: response.error,
            errorMsg: response.errorMsg ?? response.message,
            operation: "custom-field-select-list",
          },
        );
      }

      return {
        items: Array.isArray(response.list)
          ? response.list
          : Array.isArray(response.data)
            ? response.data
            : [],
      };
    },
  };
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
      CUSTOM_FIELD_INTERNAL_API_NOT_CONFIGURED_CODE,
      CUSTOM_FIELD_INTERNAL_API_USER_MESSAGE,
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
        CUSTOM_FIELD_INTERNAL_API_FAILED_CODE,
        CUSTOM_FIELD_INTERNAL_API_USER_MESSAGE,
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
        CUSTOM_FIELD_INTERNAL_API_FAILED_CODE,
        CUSTOM_FIELD_INTERNAL_API_USER_MESSAGE,
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
      CUSTOM_FIELD_INTERNAL_API_FAILED_CODE,
      CUSTOM_FIELD_INTERNAL_API_USER_MESSAGE,
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
