import { useEffect, useRef } from "react";

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
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !conversationId) {
      return;
    }

    const runHeartbeat = async () => {
      if (!conversationId || inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;

      try {
        await sendSmartHeartbeat(conversationId);
      } catch {
        // 心跳失败不打断工作台主流程，下一轮 interval 继续尝试
      } finally {
        inFlightRef.current = false;
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
