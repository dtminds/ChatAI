import { useEffect, useEffectEvent, useRef } from "react";

import { useWorkbenchPollingLease } from "@/pages/chat/hooks/use-workbench-polling-lease";

export const WORKBENCH_POLL_HIDDEN_INTERVAL_MS = 10000;
export const WORKBENCH_MAX_SYNC_GAP_MS = 30 * 60 * 1000;
export const WORKBENCH_MAX_BACKGROUND_ELAPSED_MS = 18 * 60 * 60 * 1000;
export const WORKBENCH_SEAT_SUMMARY_REFRESH_INTERVAL_MS = 30 * 1000;

export type PollingPauseReason = "sync-gap" | "background-timeout" | "other-tab";

type UseWorkbenchPollingOptions = {
  activeAccountId?: string;
  bootstrapStatus: "idle" | "loading" | "ready" | "error";
  currentUserId?: string;
  intervalMs: number;
  jitterMs: number;
  onPollingPaused?: (reason: PollingPauseReason) => void;
  refreshSeatSummaries?: () => Promise<void>;
  pollWorkbench: () => Promise<boolean | void>;
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
  const lastSuccessfulPollAtRef = useRef(Date.now());
  const syncScopeKeyRef = useRef<string | undefined>(undefined);
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
      return false;
    }

    isPollingRef.current = true;

    try {
      const didSync = await pollWorkbench();

      if (didSync === false) {
        return false;
      }

      lastSuccessfulPollAtRef.current = Date.now();
      return true;
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
    let syncGapTimeoutId: number | undefined;
    let backgroundTimeoutId: number | undefined;
    let cancelled = false;
    const syncScopeKey = `${currentUserId}:${activeAccountId}`;

    if (syncScopeKeyRef.current !== syncScopeKey) {
      syncScopeKeyRef.current = syncScopeKey;
      lastSuccessfulPollAtRef.current = Date.now();
    }

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
      clearSyncGapTimer();
      clearBackgroundTimer();
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

    const pauseIfSyncGapTimedOut = () => {
      if (Date.now() - lastSuccessfulPollAtRef.current >= WORKBENCH_MAX_SYNC_GAP_MS) {
        pauseForReason("sync-gap");
        return true;
      }

      return false;
    };

    const pauseIfBackgroundTimedOut = () => {
      if (
        document.visibilityState === "hidden" &&
        getHiddenElapsedMs() >= WORKBENCH_MAX_BACKGROUND_ELAPSED_MS
      ) {
        pauseForReason("background-timeout");
        return true;
      }

      return false;
    };

    const clearSyncGapTimer = () => {
      if (syncGapTimeoutId == null) {
        return;
      }

      window.clearTimeout(syncGapTimeoutId);
      syncGapTimeoutId = undefined;
    };

    const clearBackgroundTimer = () => {
      if (backgroundTimeoutId == null) {
        return;
      }

      window.clearTimeout(backgroundTimeoutId);
      backgroundTimeoutId = undefined;
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

        if (pauseIfSyncGapTimedOut() || pauseIfBackgroundTimedOut()) {
          return;
        }

        if (pauseIfAnotherTabOwnsLease()) {
          return;
        }

        const didSync = await runPollCycle();

        if (!cancelled && pauseReasonRef.current == null) {
          if (didSync) {
            scheduleSyncGapTimer();
          }
          scheduleNextPoll();
        }
      }, baseInterval + jitter);
    };

    const scheduleSyncGapTimer = () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      clearSyncGapTimer();
      const remainingMs = Math.max(
        0,
        WORKBENCH_MAX_SYNC_GAP_MS - (Date.now() - lastSuccessfulPollAtRef.current),
      );

      syncGapTimeoutId = window.setTimeout(() => {
        if (!pauseIfSyncGapTimedOut()) {
          scheduleSyncGapTimer();
        }
      }, remainingMs);
    };

    const scheduleBackgroundTimer = () => {
      if (pauseReasonRef.current != null || document.visibilityState !== "hidden") {
        return;
      }

      clearBackgroundTimer();
      hiddenSinceRef.current ??= Date.now();
      const remainingMs = Math.max(
        0,
        WORKBENCH_MAX_BACKGROUND_ELAPSED_MS - getHiddenElapsedMs(),
      );

      backgroundTimeoutId = window.setTimeout(() => {
        if (!pauseIfBackgroundTimedOut()) {
          scheduleBackgroundTimer();
        }
      }, remainingMs);
    };

    const pollNowAndReschedule = async () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      clearScheduledPoll();
      if (pauseIfSyncGapTimedOut() || pauseIfBackgroundTimedOut()) {
        return;
      }
      if (pauseIfAnotherTabOwnsLease()) {
        return;
      }

      const didSync = await runPollCycle();

      if (!cancelled && pauseReasonRef.current == null) {
        if (didSync) {
          scheduleSyncGapTimer();
        }
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      if (document.visibilityState === "visible") {
        if (getHiddenElapsedMs() >= WORKBENCH_MAX_BACKGROUND_ELAPSED_MS) {
          pauseForReason("background-timeout");
          return;
        }

        hiddenSinceRef.current = undefined;
        clearBackgroundTimer();
        void pollNowAndReschedule();
        return;
      }

      hiddenSinceRef.current = Date.now();
      scheduleBackgroundTimer();
      scheduleNextPoll();
    };

    scheduleSyncGapTimer();
    if (document.visibilityState === "hidden") {
      scheduleBackgroundTimer();
      scheduleNextPoll();
    } else {
      void pollNowAndReschedule();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      clearSyncGapTimer();
      clearBackgroundTimer();
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
