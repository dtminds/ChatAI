import {
  WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE_DEFAULT,
  WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE_MAX,
  WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH,
  WORKFLOW_FRIEND_ADD_WAY_MAX_CHILDREN,
  WORKFLOW_FRIEND_ADD_WAY_MAX_GROUPS,
  WORKFLOW_FRIEND_ADD_WAY_TITLE_MAX_LENGTH,
  type WorkflowFriendAddWayActivity,
  type WorkflowFriendAddWayActivityListResponse,
  type WorkflowFriendAddWayGroup,
  type WorkflowFriendAddWayItem,
  type WorkflowFriendAddWayListResponse,
} from "@chatai/contracts";
import { noopLogger, type AppLogger, type RequestAwareLogger } from "../../shared/logger.js";
import {
  createFriendAddWayJavaClient,
  type FriendAddWayJavaActivity,
  type FriendAddWayJavaChild,
  type FriendAddWayJavaClient,
  type FriendAddWayJavaGroup,
} from "./friend-add-way-java-client.js";

export class FriendAddWayService {
  constructor(
    private readonly javaClient: FriendAddWayJavaClient,
    private readonly logger: AppLogger | RequestAwareLogger = noopLogger,
  ) {}

  async listAddWays(uid: number): Promise<WorkflowFriendAddWayListResponse> {
    const result = await this.javaClient.listAddWays({ uid });
    const seenKeys = new Set<string>();
    const groups = result.groups
      .map(item => mapGroup(item, seenKeys))
      .filter((item): item is WorkflowFriendAddWayGroup => item != null)
      .slice(0, WORKFLOW_FRIEND_ADD_WAY_MAX_GROUPS);

    if (result.groups.length > 0 && groups.length === 0) {
      this.logger.warn(
        {
          itemCount: result.groups.length,
          uid,
        },
        "friend-add-ways 上游有列表项但字段映射后为空",
      );
    }

    return { groups };
  }

  async listActivities(
    uid: number,
    input: {
      addWayIds?: string;
      key: string;
      page?: number;
      pageSize?: number;
      title?: string;
    },
  ): Promise<WorkflowFriendAddWayActivityListResponse> {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const result = await this.javaClient.listActivities({
      addWayIds: normalizeOptionalText(input.addWayIds),
      key: input.key,
      page,
      pageSize,
      title: normalizeOptionalText(input.title),
      uid,
    });
    const items = result.items
      .map(mapActivity)
      .filter((item): item is WorkflowFriendAddWayActivity => item != null)
      .slice(0, pageSize);

    if (result.items.length > 0 && items.length === 0) {
      this.logger.warn(
        {
          itemCount: result.items.length,
          key: input.key,
          uid,
        },
        "friend-add-way-activities 上游有列表项但字段映射后为空",
      );
    }

    return {
      items,
      pagination: {
        hasNext: result.hasNext,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    };
  }
}

export function createFriendAddWayService(logger: AppLogger | RequestAwareLogger) {
  return new FriendAddWayService(createFriendAddWayJavaClient(logger), logger);
}

function mapGroup(
  item: FriendAddWayJavaGroup,
  seenKeys: Set<string>,
): WorkflowFriendAddWayGroup | null {
  const key = normalizeKey(item.key);
  const title = normalizeTitle(item.title);

  if (!key || !title || seenKeys.has(key)) {
    return null;
  }

  seenKeys.add(key);
  const children = Array.isArray(item.children)
    ? item.children
        .map(child => mapChild(child, seenKeys))
        .filter((child): child is WorkflowFriendAddWayItem => child != null)
        .slice(0, WORKFLOW_FRIEND_ADD_WAY_MAX_CHILDREN)
    : [];

  return { children, key, title };
}

function mapChild(
  item: FriendAddWayJavaChild,
  seenKeys: Set<string>,
): WorkflowFriendAddWayItem | null {
  const key = normalizeKey(item.key);
  const title = normalizeTitle(item.title);

  if (!key || !title || seenKeys.has(key)) {
    return null;
  }

  seenKeys.add(key);
  return { key, title };
}

function normalizeKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim();
  return key && key.length <= WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH ? key : null;
}

function normalizeTitle(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const title = value.trim();
  return title && title.length <= WORKFLOW_FRIEND_ADD_WAY_TITLE_MAX_LENGTH ? title : null;
}

function mapActivity(item: FriendAddWayJavaActivity): WorkflowFriendAddWayActivity | null {
  const addWayId = normalizeKey(item.addWayId);
  const title = normalizeTitle(item.title);
  if (!addWayId || !title) {
    return null;
  }

  const createTime = normalizeCreateTime(item.createTime);
  return createTime == null ? { addWayId, title } : { addWayId, createTime, title };
}

function normalizeCreateTime(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  if (!text) {
    return undefined;
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }

  const parsed = Date.parse(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeOptionalText(value: string | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
}

function normalizePage(value: number | undefined) {
  return Number.isSafeInteger(value) && value && value > 0 ? value : 1;
}

function normalizePageSize(value: number | undefined) {
  if (!Number.isSafeInteger(value) || !value || value <= 0) {
    return WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE_DEFAULT;
  }

  return Math.min(value, WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE_MAX);
}
