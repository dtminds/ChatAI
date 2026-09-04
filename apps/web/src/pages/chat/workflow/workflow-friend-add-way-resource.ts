import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiSuccessEnvelope,
  WorkflowFriendAddWayActivityListResponse,
  WorkflowFriendAddWayGroup,
  WorkflowFriendAddWayListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type WorkflowFriendAddWayResourceStatus =
  | "error"
  | "idle"
  | "loading"
  | "ready";

export type WorkflowFriendAddWayResource = {
  groups: WorkflowFriendAddWayGroup[];
  reload: () => void;
  status: WorkflowFriendAddWayResourceStatus;
};

export async function listWorkflowFriendAddWays(): Promise<WorkflowFriendAddWayGroup[]> {
  const response = await http.get<ApiSuccessEnvelope<WorkflowFriendAddWayListResponse>>(
    "/server/workflow/friend-add-ways",
  );

  return response.data.groups;
}

export async function listWorkflowFriendAddWayActivities(params: {
  addWayIds?: readonly string[];
  key: string;
  page?: number;
  pageSize?: number;
  title?: string;
}): Promise<WorkflowFriendAddWayActivityListResponse> {
  const query = new URLSearchParams();
  query.set("key", params.key);

  if (params.addWayIds && params.addWayIds.length > 0) {
    query.set("addWayIds", params.addWayIds.join(","));
  }

  if (params.page != null) {
    query.set("page", String(params.page));
  }

  if (params.pageSize != null) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params.title?.trim()) {
    query.set("title", params.title.trim());
  }

  const response = await http.get<ApiSuccessEnvelope<WorkflowFriendAddWayActivityListResponse>>(
    `/server/workflow/friend-add-way-activities?${query.toString()}`,
  );

  return response.data;
}

export function useWorkflowFriendAddWayResource(
  enabled: boolean,
  loader: () => Promise<WorkflowFriendAddWayGroup[]> = listWorkflowFriendAddWays,
) {
  const requestIdRef = useRef(0);
  const [groups, setGroups] = useState<WorkflowFriendAddWayGroup[]>([]);
  const [status, setStatus] = useState<WorkflowFriendAddWayResourceStatus>("idle");

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");

    try {
      const nextGroups = await loader();

      if (requestIdRef.current === requestId) {
        setGroups(nextGroups);
        setStatus("ready");
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setStatus("error");
      }
    }
  }, [loader]);

  useEffect(() => {
    if (!enabled || status !== "idle") {
      return;
    }

    void reload();
  }, [enabled, reload, status]);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  return { groups, reload, status };
}

export type WorkflowFriendAddWayPath = {
  child: WorkflowFriendAddWayGroup["children"][number] | null;
  group: WorkflowFriendAddWayGroup | null;
};

export function resolveFriendAddWayPath(
  groups: readonly WorkflowFriendAddWayGroup[],
  key: string | null | undefined,
): WorkflowFriendAddWayPath {
  if (!key) {
    return { child: null, group: null };
  }

  const group = groups.find(item => item.key === key);
  if (group) {
    return { child: null, group };
  }

  for (const item of groups) {
    const child = item.children.find(option => option.key === key);
    if (child) {
      return { child, group: item };
    }
  }

  return { child: null, group: null };
}

export type WorkflowFriendAddWaySelectionIdentity = {
  addWayKey?: string | null;
  sourceIds: readonly string[];
};

export function getFriendAddWaySelectionKey(
  selection: WorkflowFriendAddWaySelectionIdentity,
) {
  return selection.addWayKey
    ?? (selection.sourceIds.length === 1 ? selection.sourceIds[0] : null);
}

export function resolveFriendAddWaySelectionPath(
  groups: readonly WorkflowFriendAddWayGroup[],
  selection: WorkflowFriendAddWaySelectionIdentity,
) {
  return resolveFriendAddWayPath(groups, getFriendAddWaySelectionKey(selection));
}

export function isFriendAddWaySelectionInvalid(
  groups: readonly WorkflowFriendAddWayGroup[],
  selection: WorkflowFriendAddWaySelectionIdentity,
) {
  const hasSelection = Boolean(selection.addWayKey) || selection.sourceIds.length > 0;
  return hasSelection && !resolveFriendAddWaySelectionPath(groups, selection).group;
}

export function getFriendAddWayDisplayTitle(path: WorkflowFriendAddWayPath) {
  if (!path.group) {
    return null;
  }

  return path.child ? `${path.group.title} / ${path.child.title}` : path.group.title;
}

export function friendAddWayHasSecondary(path: WorkflowFriendAddWayPath) {
  return path.child != null || Boolean(path.group?.children.length);
}

export const WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE = 10;
