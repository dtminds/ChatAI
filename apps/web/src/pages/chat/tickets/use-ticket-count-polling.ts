import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";
import {
  refreshTicketCounts,
  setTicketCountScope,
  useTicketCountStore,
} from "./ticket-count-store";

const ticketCountPollIntervalMs = 60_000;
const ticketCountForegroundStaleMs = 30_000;

export function useTicketCountPolling() {
  const scopeKey = useAuthStore((state) =>
    state.subUser && state.subUser.accessMode !== "support_readonly"
      ? `${state.subUser.uid}:${state.subUser.subUserId}`
      : undefined
  );
  const reminderDisplayMode = useTicketCountStore(
    (state) => state.reminderDisplayMode,
  );

  useEffect(() => {
    setTicketCountScope(scopeKey);
    if (!scopeKey || reminderDisplayMode === "hidden") {
      return;
    }

    void refreshTicketCounts();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshTicketCounts();
      }
    }, ticketCountPollIntervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const lastSucceededAt = useTicketCountStore.getState().lastSucceededAt ?? 0;
      if (Date.now() - lastSucceededAt >= ticketCountForegroundStaleMs) {
        void refreshTicketCounts();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reminderDisplayMode, scopeKey]);
}
