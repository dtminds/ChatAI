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
const JAVA_DEPARTMENT_USER_PATH = "/third-internal/work-party/get-all-department-user";

export const WECOM_MEMBER_INTERNAL_API_FAILED_CODE = "WECOM_MEMBER_INTERNAL_API_FAILED";
export const WECOM_MEMBER_INTERNAL_API_NOT_CONFIGURED_CODE =
  "WECOM_MEMBER_INTERNAL_API_NOT_CONFIGURED";
export const WECOM_MEMBER_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

export const JAVA_WECOM_MEMBER_SELECT_TYPE_DEPARTMENT_AND_USER = 2;
export const JAVA_WECOM_MEMBER_STATUS_ACTIVE = 1;
export const JAVA_WECOM_MEMBER_EXTERNAL_CONTACT_ONLY = 1;
export const JAVA_WECOM_MEMBER_LICENSE_UNRESTRICTED = 0;

type JavaApiResponse<T> = {
  code?: number;
  data?: T;
  error?: number;
  errorMsg?: string;
  error_msg?: string;
  message?: string;
  success?: boolean;
};

export type WecomMemberJavaNode = {
  avatar?: string | null;
  children?: WecomMemberJavaNode[] | null;
  key?: string | null;
  title?: string | null;
  type?: number | null;
  userKey?: string | null;
  visible?: boolean | null;
  notLicense?: boolean | null;
};

export type WecomMemberJavaTree = {
  roots?: WecomMemberJavaNode[] | null;
  userLimit?: number | null;
};

export type WecomMemberJavaClient = {
  listDepartmentUsers: (input: { uid: number }) => Promise<WecomMemberJavaTree>;
};

export function createWecomMemberJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): WecomMemberJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async listDepartmentUsers(input) {
      const response = await postJavaRequest<JavaApiResponse<WecomMemberJavaTree>>({
        baseUrl,
        body: JSON.stringify({
          isExternal: JAVA_WECOM_MEMBER_EXTERNAL_CONTACT_ONLY,
          isLicense: JAVA_WECOM_MEMBER_LICENSE_UNRESTRICTED,
          selectType: JAVA_WECOM_MEMBER_SELECT_TYPE_DEPARTMENT_AND_USER,
          status: JAVA_WECOM_MEMBER_STATUS_ACTIVE,
          uid: input.uid,
          withDefaultRootDepart: true,
        }),
        logContext: { uid: input.uid },
        logger,
        operation: "wecom-member-tree",
        path: JAVA_DEPARTMENT_USER_PATH,
        token,
      });

      assertJavaSuccess(response, "wecom-member-tree", logger);

      return extractJavaTree(response);
    },
  };
}

function extractJavaTree(response: JavaApiResponse<WecomMemberJavaTree>): WecomMemberJavaTree {
  const data = response.data;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    return {
      roots: Array.isArray(data.roots) ? data.roots : [],
      userLimit: data.userLimit,
    };
  }

  return { roots: [] };
}

function assertJavaSuccess(
  response: JavaApiResponse<unknown>,
  operation: string,
  logger: AppLogger,
) {
  if (isJavaEnvelopeSuccessful(response)) {
    return;
  }

  logger.error(
    {
      code: response.code,
      error: response.error,
      hasErrorMessage: Boolean(response.errorMsg ?? response.error_msg ?? response.message),
      operation,
    },
    "内部接口业务失败",
  );

  throw new BadGatewayError(
    WECOM_MEMBER_INTERNAL_API_FAILED_CODE,
    WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
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
      WECOM_MEMBER_INTERNAL_API_NOT_CONFIGURED_CODE,
      WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
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
        WECOM_MEMBER_INTERNAL_API_FAILED_CODE,
        WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
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
        WECOM_MEMBER_INTERNAL_API_FAILED_CODE,
        WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
        mapJavaHttpFailureStatus(response.status),
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
      WECOM_MEMBER_INTERNAL_API_FAILED_CODE,
      WECOM_MEMBER_INTERNAL_API_USER_MESSAGE,
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

function mapJavaHttpFailureStatus(status: number) {
  if (status === 429 || status === 503 || status === 504) {
    return status;
  }

  return 502;
}
