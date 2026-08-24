import {
  WORKFLOW_FRIEND_ADD_WAY_KEY_MAX_LENGTH,
  WORKFLOW_FRIEND_ADD_WAY_MAX_CHILDREN,
  WORKFLOW_FRIEND_ADD_WAY_MAX_GROUPS,
  WORKFLOW_FRIEND_ADD_WAY_TITLE_MAX_LENGTH,
  type WorkflowFriendAddWayGroup,
  type WorkflowFriendAddWayItem,
  type WorkflowFriendAddWayListResponse,
} from "@chatai/contracts";
import { noopLogger, type AppLogger, type RequestAwareLogger } from "../../shared/logger.js";
import {
  createFriendAddWayJavaClient,
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
