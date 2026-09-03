import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
import {
  BadGatewayError,
  ServiceUnavailableError,
  UpstreamHttpError,
} from "../../shared/errors.js";
import {
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";
import { postJavaInternalApi } from "./java-internal-api-client.js";
const JAVA_ADD_WAY_LIST_PATH = "/third-internal/work-external-contact/add-way-list";
const JAVA_ADD_WAY_ACTIVITY_PATH = "/third-internal/work-external-contact/get-add-way-activity";

export const FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE = "FRIEND_ADD_WAY_INTERNAL_API_FAILED";
export const FRIEND_ADD_WAY_INTERNAL_API_NOT_CONFIGURED_CODE =
  "FRIEND_ADD_WAY_INTERNAL_API_NOT_CONFIGURED";
export const FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";

type FriendAddWayJavaPayload = {
  count?: number;
  data?: unknown;
  hasNext?: boolean;
  list?: unknown;
  page?: number;
  pageSize?: number;
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

export type FriendAddWayJavaActivity = {
  addWayId: string;
  createTime?: number | string | null;
  title: string;
};

export type FriendAddWayJavaActivityPage = {
  hasNext: boolean;
  items: FriendAddWayJavaActivity[];
  page: number;
  pageSize: number;
  total: number;
};

export type FriendAddWayJavaClient = {
  listActivities: (input: {
    addWayIds?: string;
    key: string;
    page: number;
    pageSize: number;
    title?: string;
    uid: number;
  }) => Promise<FriendAddWayJavaActivityPage>;
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
    async listActivities(input) {
      // Swagger 参数名 reqTO 对应 @RequestBody；实际 JSON 为 flat 字段（与现有 third-internal 一致）
      const body: Record<string, unknown> = {
        key: input.key,
        page: input.page,
        pageSize: input.pageSize,
        uid: input.uid,
      };

      if (input.addWayIds) {
        body.addWayIds = input.addWayIds;
      }

      if (input.title) {
        body.title = input.title;
      }

      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify(body),
        logContext: {
          key: input.key,
          page: input.page,
          pageSize: input.pageSize,
          uid: input.uid,
        },
        logger,
        operation: "friend-add-way-activity",
        path: JAVA_ADD_WAY_ACTIVITY_PATH,
        token,
      });

      const payload = decodeJavaResponse(response, "friend-add-way-activity", logger);
      if (!Array.isArray(payload.list)) {
        throw invalidJavaData("friend-add-way-activity", "list must be an array");
      }
      const items = extractJavaListItems<FriendAddWayJavaActivity>(payload.list);

      return {
        hasNext: Boolean(payload.hasNext),
        items,
        page: normalizePositiveInteger(payload.page, input.page),
        pageSize: normalizePositiveInteger(payload.pageSize, input.pageSize),
        total: normalizeNonNegativeInteger(payload.count ?? items.length),
      };
    },

    async listAddWays(input) {
      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify({ uid: input.uid }),
        logContext: { uid: input.uid },
        logger,
        operation: "friend-add-way-list",
        path: JAVA_ADD_WAY_LIST_PATH,
        token,
      });

      const payload = decodeJavaResponse(response, "friend-add-way-list", logger);
      if (!Array.isArray(payload.data)) {
        throw invalidJavaData("friend-add-way-list", "data must be an array");
      }
      return { groups: extractJavaListItems<FriendAddWayJavaGroup>(payload.data) };
    },
  };
}

function extractJavaListItems<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function decodeJavaResponse(
  response: unknown,
  operation: string,
  logger: AppLogger,
): FriendAddWayJavaPayload {
  const envelope = decodeJavaInternalApiEnvelope(response);
  if (envelope.kind === "success") {
    return envelope.payload;
  }

  const details = envelope.kind === "rejected"
    ? { error: envelope.error, errorMsg: envelope.errorMsg, operation }
    : { operation, reason: envelope.reason };

  logger.error(details, "内部接口业务失败");

  throw new BadGatewayError(
    FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
    FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
    details,
  );
}

function invalidJavaData(operation: string, reason: string) {
  return new BadGatewayError(
    FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
    FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
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
  return postJavaInternalApi<T>({
    baseUrl,
    body,
    createFailureError: () => new BadGatewayError(
      FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
      FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
    ),
    createHttpFailureError: status => new UpstreamHttpError(
      FRIEND_ADD_WAY_INTERNAL_API_FAILED_CODE,
      FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
      mapJavaHttpFailureStatus(status),
    ),
    createNotConfiguredError: () => new ServiceUnavailableError(
      FRIEND_ADD_WAY_INTERNAL_API_NOT_CONFIGURED_CODE,
      FRIEND_ADD_WAY_INTERNAL_API_USER_MESSAGE,
    ),
    logContext,
    logger,
    operation,
    path,
    token,
  });
}

function mapJavaHttpFailureStatus(status: number) {
  if (status === 429 || status === 503 || status === 504) {
    return status;
  }

  return 502;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonNegativeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
