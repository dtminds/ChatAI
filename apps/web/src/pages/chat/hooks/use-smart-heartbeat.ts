import { useEffect } from "react";

import { sendSmartHeartbeat } from "@/pages/chat/api/workbench-gateway";

export const WORKBENCH_SMART_HEARTBEAT_INTERVAL_MS = 5000;

type UseSmartHeartbeatOptions = {
  conversationId?: string;
  enabled: boolean;
  intervalMs?: number;
};

export function useSmartHeartbeat({
  conversationId,
  enabled,
  intervalMs = WORKBENCH_SMART_HEARTBEAT_INTERVAL_MS,
}: UseSmartHeartbeatOptions) {
  useEffect(() => {
    if (!enabled || !conversationId) {
      return;
    }

    let inFlight = false;

    const runHeartbeat = async () => {
      if (!conversationId || inFlight) {
        return;
      }

      inFlight = true;

      try {
        await sendSmartHeartbeat(conversationId);
      } catch {
        // 心跳失败不打断工作台主流程，下一轮 interval 继续尝试
      } finally {
        inFlight = false;
      }
    };

    void runHeartbeat();

    const intervalId = window.setInterval(() => {
      void runHeartbeat();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [conversationId, enabled, intervalMs]);
}
