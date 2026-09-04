import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiSuccessEnvelope,
  WorkflowOrderPlatform,
  WorkflowOrderPlatformListResponse,
  WorkflowOrderShop,
  WorkflowOrderShopListResponse,
  WorkflowOrderStatus,
  WorkflowOrderStatusListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type WorkflowOrderResource = {
  listShops: (platformIds: readonly number[]) => Promise<WorkflowOrderShop[]>;
  orderStatuses: WorkflowOrderStatus[];
  platforms: WorkflowOrderPlatform[];
  reload: () => void;
  status: "error" | "idle" | "loading" | "ready";
};

export async function listWorkflowOrderPlatforms() {
  const response = await http.get<ApiSuccessEnvelope<WorkflowOrderPlatformListResponse>>(
    "/server/workflow/order-platforms",
  );
  return response.data.platforms;
}

export async function listWorkflowOrderShops(platformIds: readonly number[]) {
  const response = await http.get<ApiSuccessEnvelope<WorkflowOrderShopListResponse>>(
    "/server/workflow/order-shops",
    platformIds.length > 0
      ? { params: { platformIds: platformIds.join(",") } }
      : undefined,
  );
  return response.data.shops;
}

export async function listWorkflowOrderStatuses() {
  const response = await http.get<ApiSuccessEnvelope<WorkflowOrderStatusListResponse>>(
    "/server/workflow/order-statuses",
  );
  return response.data.statuses;
}

async function loadWorkflowOrderResource() {
  const [platforms, orderStatuses] = await Promise.all([
    listWorkflowOrderPlatforms(),
    listWorkflowOrderStatuses(),
  ]);
  return { orderStatuses, platforms };
}

export function useWorkflowOrderResource(
  enabled: boolean,
  loader: () => Promise<{
    orderStatuses: WorkflowOrderStatus[];
    platforms: WorkflowOrderPlatform[];
  }> = loadWorkflowOrderResource,
): WorkflowOrderResource {
  const requestIdRef = useRef(0);
  const [orderStatuses, setOrderStatuses] = useState<WorkflowOrderStatus[]>([]);
  const [platforms, setPlatforms] = useState<WorkflowOrderPlatform[]>([]);
  const [status, setStatus] = useState<WorkflowOrderResource["status"]>("idle");
  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    try {
      const next = await loader();
      if (requestId === requestIdRef.current) {
        setOrderStatuses(next.orderStatuses);
        setPlatforms(next.platforms);
        setStatus("ready");
      }
    } catch {
      if (requestId === requestIdRef.current) setStatus("error");
    }
  }, [loader]);
  useEffect(() => {
    if (enabled && status === "idle") void reload();
  }, [enabled, reload, status]);
  useEffect(() => () => { requestIdRef.current += 1; }, []);
  return { listShops: listWorkflowOrderShops, orderStatuses, platforms, reload, status };
}
