import {
  WORKFLOW_AUDIENCE_GROUP_LIST_MAX_COUNT,
  WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH,
  type WorkflowAudienceGroupSnapshot,
} from "@chatai/contracts";
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

export const CDP_GROUP_INTERNAL_API_FAILED_CODE = "CDP_GROUP_INTERNAL_API_FAILED";
export const CDP_GROUP_INTERNAL_API_NOT_CONFIGURED_CODE =
  "CDP_GROUP_INTERNAL_API_NOT_CONFIGURED";
export const CDP_GROUP_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";
export const CDP_GROUP_OPERATE_LIST_PATH = "/third-internal/cdp-group-operate/list";

type JavaApiResponse<T> = {
  code?: number;
  data?: T;
  error?: number;
  errorMsg?: string;
  message?: string;
  success?: boolean;
};

export type CdpGroupJavaClient = {
  listGroups: (input: { uid: number }) => Promise<{
    groups: WorkflowAudienceGroupSnapshot[];
  }>;
};

export function createCdpGroupJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): CdpGroupJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async listGroups(input) {
      const response = await postJavaRequest<JavaApiResponse<unknown>>({
        baseUrl,
        body: JSON.stringify({
          uid: input.uid,
        }),
        logContext: { uid: input.uid },
        logger,
        operation: "cdp-group-list",
        path: CDP_GROUP_OPERATE_LIST_PATH,
        token,
      });

      assertJavaSuccess(response, "cdp-group-list");

      return {
        groups: extractGroups(response.data),
      };
    },
  };
}

function extractGroups(data: unknown): WorkflowAudienceGroupSnapshot[] {
  const items = readGroupItems(data);
  const groups: WorkflowAudienceGroupSnapshot[] = [];
  const seen = new Set<number>();

  for (const item of items) {
    const group = mapGroupItem(item);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push(group);
    if (groups.length >= WORKFLOW_AUDIENCE_GROUP_LIST_MAX_COUNT) break;
  }

  return groups;
}

function readGroupItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.groups)) return record.groups;
    if (Array.isArray(record.list)) return record.list;
  }
  return [];
}

function mapGroupItem(value: unknown): WorkflowAudienceGroupSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = readPositiveInteger(record.id) ?? readPositiveInteger(record.groupId);
  const name = readGroupName(record.name) ?? readGroupName(record.groupName);
  return id && name ? { id, name } : null;
}

function readPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

function readGroupName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH);
  return name.length > 0 ? name : null;
}

function assertJavaSuccess(response: JavaApiResponse<unknown>, operation: string) {
  if (isJavaEnvelopeSuccessful(response)) {
    return;
  }

  throw new BadGatewayError(
    CDP_GROUP_INTERNAL_API_FAILED_CODE,
    CDP_GROUP_INTERNAL_API_USER_MESSAGE,
    {
      code: response.code,
      error: response.error,
      errorMsg: response.errorMsg ?? response.message,
      operation,
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
      CDP_GROUP_INTERNAL_API_NOT_CONFIGURED_CODE,
      CDP_GROUP_INTERNAL_API_USER_MESSAGE,
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
        CDP_GROUP_INTERNAL_API_FAILED_CODE,
        CDP_GROUP_INTERNAL_API_USER_MESSAGE,
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
        CDP_GROUP_INTERNAL_API_FAILED_CODE,
        CDP_GROUP_INTERNAL_API_USER_MESSAGE,
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
      CDP_GROUP_INTERNAL_API_FAILED_CODE,
      CDP_GROUP_INTERNAL_API_USER_MESSAGE,
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
