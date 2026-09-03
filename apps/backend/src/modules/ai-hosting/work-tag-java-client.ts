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

export const WORK_TAG_INTERNAL_API_FAILED_CODE = "WORK_TAG_INTERNAL_API_FAILED";
export const WORK_TAG_INTERNAL_API_NOT_CONFIGURED_CODE =
  "WORK_TAG_INTERNAL_API_NOT_CONFIGURED";
export const WORK_TAG_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

export type WorkTagJavaGroupItem = {
  attr?: number | string | null;
  group_name?: string | null;
  id?: number | string | null;
  num?: number | string | null;
};

export type WorkTagJavaGroupListData = {
  info?: WorkTagJavaGroupItem[] | null;
};

export type WorkTagJavaComponentItem = {
  attr?: number | string | null;
  groupAttr?: number | string | null;
  group_attr?: number | string | null;
  groupId?: number | string | null;
  group_id?: number | string | null;
  groupName?: string | null;
  group_name?: string | null;
  groupSort?: number | string | null;
  group_sort?: number | string | null;
  id?: number | string | null;
  label?: string | null;
  name?: string | null;
  tagName?: string | null;
  tag_name?: string | null;
  type?: number | string | null;
};

export type WorkTagJavaLookupItem = {
  groupName?: string | null;
  group_name?: string | null;
  id?: number | string | null;
  name?: string | null;
  tagId?: number | string | null;
  tagGroupName?: string | null;
  tagName?: string | null;
  tag_id?: number | string | null;
  tag_name?: string | null;
};

export type WorkTagJavaClient = {
  getExternalTags: (input: {
    tagIds: number[];
    uid: number;
  }) => Promise<{
    items: WorkTagJavaLookupItem[];
  }>;
  listGroups: (input: {
    /** 1 普通，2 互斥；默认 1 */
    attr?: number;
    /** 企微客户标签默认 0 */
    type?: number;
    uid: number;
  }) => Promise<{
    groups: WorkTagJavaGroupItem[];
  }>;
  listTags: (input: {
    attr?: number;
    groupId?: number;
    keyWord?: string;
    page: number;
    pageSize: number;
    type?: number;
    uid: number;
  }) => Promise<{
    hasNext: boolean;
    items: WorkTagJavaComponentItem[];
    page: number;
    pageSize: number;
    total: number;
  }>;
};

export function createWorkTagJavaClient(
  logger: AppLogger | RequestAwareLogger = noopLogger,
): WorkTagJavaClient {
  const baseUrl = process.env.JAVA_INTERNAL_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.JAVA_INTERNAL_API_TOKEN;

  return {
    async getExternalTags(input) {
      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify({
          tagIds: input.tagIds,
          uid: input.uid,
        }),
        logContext: { tagIds: input.tagIds, uid: input.uid },
        logger,
        operation: "work-tag-external-list",
        path: "/third-internal/work-tag/get-external-tag-list",
        token,
      });

      const payload = decodeJavaResponse(response, "work-tag-external-list");

      return {
        items: extractJavaListItems<WorkTagJavaLookupItem>(payload.data),
      };
    },

    async listGroups(input) {
      const attr = input.attr ?? 1;
      const type = input.type ?? 0;
      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify({
          attr,
          type,
          uid: input.uid,
        }),
        logContext: { attr, type, uid: input.uid },
        logger,
        operation: "work-tag-group-list",
        path: "/third-internal/work-tag-group/get-work-tag-group-list",
        token,
      });

      const payload = decodeJavaResponse(response, "work-tag-group-list");

      const data = payload.data as WorkTagJavaGroupListData | undefined;
      const groups = Array.isArray(data?.info) ? data.info : [];

      return {
        groups,
      };
    },

    async listTags(input) {
      const body: Record<string, unknown> = {
        page: input.page,
        pageSize: input.pageSize,
        uid: input.uid,
      };

      if (input.attr != null) {
        body.attr = input.attr;
      }

      if (input.groupId != null) {
        body.groupId = input.groupId;
      }

      if (input.keyWord?.trim()) {
        body.keyWord = input.keyWord.trim();
      }

      if (input.type != null) {
        body.type = input.type;
      }

      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify(body),
        logContext: {
          attr: input.attr,
          groupId: input.groupId,
          keyWord: input.keyWord,
          page: input.page,
          pageSize: input.pageSize,
          type: input.type,
          uid: input.uid,
        },
        logger,
        operation: "work-tag-component-list",
        path: "/third-internal/work-tag/tag-component-list",
        token,
      });

      const payload = decodeJavaResponse(response, "work-tag-component-list");
      if (!Array.isArray(payload.list)) {
        throw invalidJavaData("work-tag-component-list", "list must be an array");
      }
      const items = payload.list as WorkTagJavaComponentItem[];

      if (
        normalizeNonNegativeInteger(payload.count) > 0 &&
        items.length === 0
      ) {
        logger.warn(
          {
            count: payload.count,
            listLength: items.length,
            operation: "work-tag-component-list",
            responseKeys: Object.keys(payload),
            uid: input.uid,
          },
          "tag-component-list 有 count 但未解析到列表项",
        );
      }

      return {
        hasNext: Boolean(payload.hasNext),
        items,
        page: normalizePositiveInteger(payload.page, input.page),
        pageSize: normalizePositiveInteger(payload.pageSize, input.pageSize),
        total: normalizeNonNegativeInteger(payload.count ?? items.length),
      };
    },
  };
}

function extractJavaListItems<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function decodeJavaResponse(response: unknown, operation: string) {
  const envelope = decodeJavaInternalApiEnvelope(response);
  if (envelope.kind === "success") {
    return envelope.payload;
  }

  throw new BadGatewayError(
    WORK_TAG_INTERNAL_API_FAILED_CODE,
    WORK_TAG_INTERNAL_API_USER_MESSAGE,
    envelope.kind === "rejected"
      ? { error: envelope.error, errorMsg: envelope.errorMsg, operation }
      : { operation, reason: envelope.reason },
  );
}

function invalidJavaData(operation: string, reason: string) {
  return new BadGatewayError(
    WORK_TAG_INTERNAL_API_FAILED_CODE,
    WORK_TAG_INTERNAL_API_USER_MESSAGE,
    { operation, reason },
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
      WORK_TAG_INTERNAL_API_NOT_CONFIGURED_CODE,
      WORK_TAG_INTERNAL_API_USER_MESSAGE,
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
        WORK_TAG_INTERNAL_API_FAILED_CODE,
        WORK_TAG_INTERNAL_API_USER_MESSAGE,
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
        WORK_TAG_INTERNAL_API_FAILED_CODE,
        WORK_TAG_INTERNAL_API_USER_MESSAGE,
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
      WORK_TAG_INTERNAL_API_FAILED_CODE,
      WORK_TAG_INTERNAL_API_USER_MESSAGE,
      { operation },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numeric = normalizeInteger(value);
  return numeric != null && numeric > 0 ? numeric : fallback;
}

function normalizeNonNegativeInteger(value: unknown) {
  const numeric = normalizeInteger(value);
  return numeric != null && numeric >= 0 ? numeric : 0;
}

function readJavaApiTimeoutMs() {
  const raw = Number(process.env.JAVA_INTERNAL_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_JAVA_INTERNAL_API_TIMEOUT_MS;
}
