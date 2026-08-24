import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiSuccessEnvelope,
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

export function getSelectableFriendAddWays(groups: readonly WorkflowFriendAddWayGroup[]) {
  return groups.flatMap((group) => {
    if (group.children.length === 0) {
      return [{ groupTitle: group.title, key: group.key, title: group.title }];
    }

    return group.children.map(child => ({
      groupTitle: group.title,
      key: child.key,
      title: child.title,
    }));
  });
}
