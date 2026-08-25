import {
  WORKFLOW_AUDIENCE_GROUP_CALCULATE_TIME_MAX_LENGTH,
  WORKFLOW_AUDIENCE_GROUP_CONDITION_MAX_COUNT,
  WORKFLOW_AUDIENCE_GROUP_CONDITIONS_MAX_LENGTH,
  WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_IMPORT,
  WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_RULE,
  WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH,
  WORKFLOW_AUDIENCE_GROUP_USER_TYPE_WECOM,
  type WorkflowAudienceGroupListItem,
  type WorkflowAudienceGroupListResponse,
} from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
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
export const CDP_GROUP_OPERATE_LIST_PATH = "/third-internal/cdp-group-operate/list-group";

type JavaApiResponse = {
  code?: number;
  count?: number;
  error?: number;
  errorMsg?: string;
  hasNext?: boolean;
  list?: unknown;
  message?: string;
  page?: number;
  pageSize?: number;
  success?: boolean;
};

export type CdpGroupJavaClient = {
  listGroups: (input: {
    name?: string;
    page: number;
    pageSize: number;
    uid: number;
  }) => Promise<WorkflowAudienceGroupListResponse>;
};

export function createCdpGroupJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): CdpGroupJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async listGroups(input) {
      const body = {
        page: input.page,
        pageSize: input.pageSize,
        uid: input.uid,
        userType: WORKFLOW_AUDIENCE_GROUP_USER_TYPE_WECOM,
        ...(input.name ? { name: input.name } : {}),
      };
      const response = await postJavaRequest<JavaApiResponse>({
        baseUrl,
        body: JSON.stringify(body),
        logContext: body,
        logger,
        operation: "cdp-group-list",
        path: CDP_GROUP_OPERATE_LIST_PATH,
        token,
      });

      assertJavaSuccess(response, "cdp-group-list");

      const groups = extractGroups(response.list, input.pageSize);
      return {
        groups,
        pagination: {
          hasNext: Boolean(response.hasNext),
          page: input.page,
          pageSize: input.pageSize,
          total: resolveListTotal({
            count: response.count,
            groups,
            hasNext: Boolean(response.hasNext),
            page: input.page,
            pageSize: input.pageSize,
          }),
        },
      };
    },
  };
}

function extractGroups(list: unknown, maxItems: number): WorkflowAudienceGroupListItem[] {
  const items = Array.isArray(list) ? list : [];
  const groups: WorkflowAudienceGroupListItem[] = [];
  const seen = new Set<number>();

  for (const item of items) {
    const group = mapGroupItem(item);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push(group);
    if (groups.length >= maxItems) break;
  }

  return groups;
}

function resolveListTotal(input: {
  count: unknown;
  groups: readonly WorkflowAudienceGroupListItem[];
  hasNext: boolean;
  page: number;
  pageSize: number;
}) {
  const filled = (input.page - 1) * input.pageSize + input.groups.length;
  const count = typeof input.count === "number" && Number.isSafeInteger(input.count) && input.count >= 0
    ? input.count
    : null;
  if (count != null) return Math.max(count, filled);
  return input.hasNext
    ? Math.max(filled, input.page * input.pageSize + 1)
    : filled;
}

function mapGroupItem(value: unknown): WorkflowAudienceGroupListItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = readPositiveInteger(record.id);
  const name = readGroupName(record.name);
  if (!id || !name) return null;

  const group: WorkflowAudienceGroupListItem = { id, name };
  const conditions = readConditions(record.conditions);
  if (conditions) group.conditions = conditions;
  const createType = readCreateType(record.createType);
  if (createType != null) group.createType = createType;
  const groupNum = readNonNegativeInteger(record.groupNum);
  if (groupNum != null) group.groupNum = groupNum;
  const peopleCalculateTime = readCalculateTime(record.peopleCalculateTime);
  if (peopleCalculateTime) group.peopleCalculateTime = peopleCalculateTime;
  return group;
}

function readConditions(value: unknown) {
  const parts: string[] = [];
  const source = typeof value === "string"
    ? value.split(/\r?\n/)
    : Array.isArray(value)
      ? value
      : null;
  if (!source) return null;

  for (const item of source) {
    if (typeof item !== "string") continue;
    const part = item.trim().slice(0, WORKFLOW_AUDIENCE_GROUP_CONDITIONS_MAX_LENGTH);
    if (!part) continue;
    parts.push(part);
    if (parts.length >= WORKFLOW_AUDIENCE_GROUP_CONDITION_MAX_COUNT) break;
  }

  return parts.length > 0 ? parts : null;
}

function readCreateType(value: unknown) {
  return value === WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_RULE
    || value === WORKFLOW_AUDIENCE_GROUP_CREATE_TYPE_IMPORT
    ? value
    : null;
}

function readNonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function readCalculateTime(value: unknown) {
  if (typeof value !== "string") return null;
  const time = value.trim().slice(0, WORKFLOW_AUDIENCE_GROUP_CALCULATE_TIME_MAX_LENGTH);
  return time.length > 0 ? time : null;
}

function readPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed;
  }
  return null;
}

function readGroupName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH);
  return name.length > 0 ? name : null;
}

function assertJavaSuccess(response: JavaApiResponse, operation: string) {
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
      throw new BadGatewayError(
        CDP_GROUP_INTERNAL_API_FAILED_CODE,
        CDP_GROUP_INTERNAL_API_USER_MESSAGE,
        { operation, status: response.status },
      );
    }

    return parsed as T;
  } catch (error) {
    if (
      error instanceof BadGatewayError
      || error instanceof ServiceUnavailableError
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

function isJavaEnvelopeSuccessful(response: JavaApiResponse) {
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
