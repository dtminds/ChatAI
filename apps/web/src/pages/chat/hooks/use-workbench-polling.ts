import { useEffect, useEffectEvent, useRef } from "react";

import { useWorkbenchPollingLease } from "@/pages/chat/hooks/use-workbench-polling-lease";

export const WORKBENCH_POLL_HIDDEN_INTERVAL_MS = 10000;
export const WORKBENCH_POLL_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const WORKBENCH_SEAT_SUMMARY_REFRESH_INTERVAL_MS = 30 * 1000;

export type PollingPauseReason = "idle" | "other-tab";

type UseWorkbenchPollingOptions = {
  activeAccountId?: string;
  bootstrapStatus: "idle" | "loading" | "ready" | "error";
  currentUserId?: string;
  intervalMs: number;
  jitterMs: number;
  onPollingPaused?: (reason: PollingPauseReason) => void;
  refreshSeatSummaries?: () => Promise<void>;
  pollWorkbench: () => Promise<void>;
};

export function useWorkbenchPolling({
  activeAccountId,
  bootstrapStatus,
  currentUserId,
  intervalMs,
  jitterMs,
  onPollingPaused,
  refreshSeatSummaries,
  pollWorkbench,
}: UseWorkbenchPollingOptions) {
  const isPollingRef = useRef(false);
  const isRefreshingSeatSummariesRef = useRef(false);
  const pauseReasonRef = useRef<PollingPauseReason | undefined>(undefined);
  const hiddenSinceRef = useRef<number | undefined>(
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? Date.now()
      : undefined,
  );
  const notifyPollingPaused = useEffectEvent((reason: PollingPauseReason) => {
    onPollingPaused?.(reason);
  });
  const handleLostLease = useEffectEvent(() => {
    if (pauseReasonRef.current != null) {
      return;
    }

    pauseReasonRef.current = "other-tab";
    notifyPollingPaused("other-tab");
  });
  const pollingLease = useWorkbenchPollingLease({
    currentUserId,
    enabled:
      bootstrapStatus === "ready" &&
      Boolean(activeAccountId) &&
      Boolean(currentUserId),
    onLostLease: handleLostLease,
  });

  const runPollCycle = useEffectEvent(async () => {
    if (isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;

    try {
      await pollWorkbench();
    } finally {
      isPollingRef.current = false;
    }
  });

  const runSeatSummaryRefreshCycle = useEffectEvent(async () => {
    if (!refreshSeatSummaries || isRefreshingSeatSummariesRef.current) {
      return;
    }

    isRefreshingSeatSummariesRef.current = true;

    try {
      await refreshSeatSummaries();
    } finally {
      isRefreshingSeatSummariesRef.current = false;
    }
  });

  useEffect(() => {
    if (
      bootstrapStatus !== "ready" ||
      !activeAccountId ||
      !currentUserId ||
      pollingLease.isPausedByOtherTab ||
      pauseReasonRef.current != null
    ) {
      return;
    }

    let timeoutId: number | undefined;
    let idleTimeoutId: number | undefined;
    let cancelled = false;

    const clearScheduledPoll = () => {
      if (timeoutId == null) {
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const pauseForReason = (reason: PollingPauseReason) => {
      if (pauseReasonRef.current != null) {
        return;
      }

      pauseReasonRef.current = reason;
      hiddenSinceRef.current = undefined;
      clearScheduledPoll();
      if (idleTimeoutId != null) {
        window.clearTimeout(idleTimeoutId);
        idleTimeoutId = undefined;
      }
      notifyPollingPaused(reason);
    };

    const pauseIfAnotherTabOwnsLease = () => {
      if (pollingLease.isOwnedByAnotherTab()) {
        pauseForReason("other-tab");
        return true;
      }

      return false;
    };

    const getHiddenElapsedMs = () => {
      if (document.visibilityState !== "hidden") {
        return 0;
      }

      hiddenSinceRef.current ??= Date.now();

      return Date.now() - hiddenSinceRef.current;
    };

    const pauseIfHiddenTimedOut = () => {
      if (
        document.visibilityState === "hidden" &&
        getHiddenElapsedMs() >= WORKBENCH_POLL_IDLE_TIMEOUT_MS
      ) {
        pauseForReason("idle");
        return true;
      }

      return false;
    };

    const clearIdleTimer = () => {
      if (idleTimeoutId == null) {
        return;
      }

      window.clearTimeout(idleTimeoutId);
      idleTimeoutId = undefined;
    };

    const scheduleNextPoll = () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      clearScheduledPoll();

      const baseInterval =
        document.visibilityState === "hidden"
          ? Math.max(WORKBENCH_POLL_HIDDEN_INTERVAL_MS, intervalMs)
          : intervalMs;
      const jitter = Math.floor(Math.random() * jitterMs);

      timeoutId = window.setTimeout(async () => {
        timeoutId = undefined;

        if (pauseIfHiddenTimedOut()) {
          return;
        }

        if (pauseIfAnotherTabOwnsLease()) {
          return;
        }

        await runPollCycle();

        if (!cancelled) {
          scheduleNextPoll();
        }
      }, baseInterval + jitter);
    };

    const scheduleIdleTimer = () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      clearIdleTimer();
      idleTimeoutId = window.setTimeout(() => {
        pauseForReason("idle");
      }, WORKBENCH_POLL_IDLE_TIMEOUT_MS);
    };

    const pollNowAndReschedule = async () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      clearScheduledPoll();
      if (pauseIfHiddenTimedOut()) {
        return;
      }
      if (pauseIfAnotherTabOwnsLease()) {
        return;
      }

      await runPollCycle();

      if (!cancelled) {
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      if (document.visibilityState === "visible") {
        if (getHiddenElapsedMs() >= WORKBENCH_POLL_IDLE_TIMEOUT_MS) {
          pauseForReason("idle");
          return;
        }

        hiddenSinceRef.current = undefined;
        clearIdleTimer();
        void pollNowAndReschedule();
        return;
      }

      hiddenSinceRef.current = Date.now();
      scheduleIdleTimer();
      scheduleNextPoll();
    };

    if (document.visibilityState === "hidden") {
      scheduleIdleTimer();
    }
    scheduleNextPoll();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      clearIdleTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeAccountId,
    bootstrapStatus,
    currentUserId,
    intervalMs,
    jitterMs,
    pollingLease.isPausedByOtherTab,
  ]);

  useEffect(() => {
    if (
      bootstrapStatus !== "ready" ||
      !activeAccountId ||
      !currentUserId ||
      !refreshSeatSummaries ||
      pollingLease.isPausedByOtherTab ||
      pauseReasonRef.current != null
    ) {
      return;
    }

    let timeoutId: number | undefined;
    let cancelled = false;

    const clearScheduledRefresh = () => {
      if (timeoutId == null) {
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const scheduleNextSeatSummaryRefresh = () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      clearScheduledRefresh();

      timeoutId = window.setTimeout(async () => {
        timeoutId = undefined;

        if (pauseReasonRef.current != null || pollingLease.isOwnedByAnotherTab()) {
          return;
        }

        await runSeatSummaryRefreshCycle();

        if (!cancelled) {
          scheduleNextSeatSummaryRefresh();
        }
      }, WORKBENCH_SEAT_SUMMARY_REFRESH_INTERVAL_MS);
    };

    const refreshNowAndReschedule = async () => {
      if (pauseReasonRef.current != null || pollingLease.isOwnedByAnotherTab()) {
        return;
      }

      clearScheduledRefresh();
      await runSeatSummaryRefreshCycle();

      if (!cancelled) {
        scheduleNextSeatSummaryRefresh();
      }
    };

    const handleVisibilityChange = () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      if (document.visibilityState === "visible") {
        void refreshNowAndReschedule();
        return;
      }

      scheduleNextSeatSummaryRefresh();
    };

    scheduleNextSeatSummaryRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduledRefresh();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeAccountId,
    bootstrapStatus,
    currentUserId,
    pollingLease.isPausedByOtherTab,
    refreshSeatSummaries,
  ]);
}
