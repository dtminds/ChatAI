import {
  decodeJavaInternalApiEnvelope,
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
  noopLogger,
  type AppLogger,
  type RequestAwareLogger,
} from "../../shared/logger.js";
import { postJavaInternalApi } from "./java-internal-api-client.js";

export const CDP_GROUP_INTERNAL_API_FAILED_CODE = "CDP_GROUP_INTERNAL_API_FAILED";
export const CDP_GROUP_INTERNAL_API_NOT_CONFIGURED_CODE =
  "CDP_GROUP_INTERNAL_API_NOT_CONFIGURED";
export const CDP_GROUP_INTERNAL_API_USER_MESSAGE = "操作失败，请稍后重试";
export const CDP_GROUP_OPERATE_LIST_PATH = "/third-internal/cdp-group-operate/list-group";

type CdpGroupJavaData = {
  count?: number;
  hasNext?: boolean;
  list?: unknown;
  page?: number;
  pageSize?: number;
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
      const response = await postJavaRequest<unknown>({
        baseUrl,
        body: JSON.stringify(body),
        logContext: body,
        logger,
        operation: "cdp-group-list",
        path: CDP_GROUP_OPERATE_LIST_PATH,
        token,
      });

      const data = decodeJavaResponse(response, "cdp-group-list");

      const groups = extractGroups(data.list, input.pageSize);
      return {
        groups,
        pagination: {
          hasNext: Boolean(data.hasNext),
          page: input.page,
          pageSize: input.pageSize,
          total: resolveListTotal({
            count: data.count,
            groups,
            hasNext: Boolean(data.hasNext),
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

function decodeJavaResponse(response: unknown, operation: string): CdpGroupJavaData {
  const envelope = decodeJavaInternalApiEnvelope(response);
  if (envelope.kind === "success") {
    return envelope.payload;
  }

  throw new BadGatewayError(
    CDP_GROUP_INTERNAL_API_FAILED_CODE,
    CDP_GROUP_INTERNAL_API_USER_MESSAGE,
    envelope.kind === "rejected"
      ? { error: envelope.error, errorMsg: envelope.errorMsg, operation }
      : {
          operation,
          reason: envelope.reason,
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
  return postJavaInternalApi<T>({
    baseUrl,
    body,
    createFailureError: status => new BadGatewayError(
      CDP_GROUP_INTERNAL_API_FAILED_CODE,
      CDP_GROUP_INTERNAL_API_USER_MESSAGE,
      { operation, ...(status === undefined ? {} : { status }) },
    ),
    createNotConfiguredError: () => new ServiceUnavailableError(
      CDP_GROUP_INTERNAL_API_NOT_CONFIGURED_CODE,
      CDP_GROUP_INTERNAL_API_USER_MESSAGE,
    ),
    logContext,
    logger,
    operation,
    path,
    token,
  });
}
