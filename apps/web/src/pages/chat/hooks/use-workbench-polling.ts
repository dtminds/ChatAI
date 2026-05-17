import { useEffect, useEffectEvent, useRef } from "react";

export const WORKBENCH_POLL_OWNER_STORAGE_KEY = "chatai.workbench.pollOwner";
export const WORKBENCH_POLL_HIDDEN_INTERVAL_MS = 5000;
export const WORKBENCH_POLL_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

const POLL_OWNER_LEASE_MS = 15000;
const POLL_OWNER_RENEW_INTERVAL_MS = 5000;

type PollOwnerLease = {
  ownerTabId: string;
  ownerUserId: string;
  expiresAt: number;
  updatedAt: number;
};

export type PollingPauseReason = "idle" | "other-tab";

type UseWorkbenchPollingOptions = {
  activeAccountId?: string;
  bootstrapStatus: "idle" | "loading" | "ready" | "error";
  currentUserId?: string;
  intervalMs: number;
  jitterMs: number;
  onPollingPaused?: (reason: PollingPauseReason) => void;
  pollWorkbench: () => Promise<void>;
};

export function useWorkbenchPolling({
  activeAccountId,
  bootstrapStatus,
  currentUserId,
  intervalMs,
  jitterMs,
  onPollingPaused,
  pollWorkbench,
}: UseWorkbenchPollingOptions) {
  const isPollingRef = useRef(false);
  const pauseReasonRef = useRef<PollingPauseReason | undefined>(undefined);
  const hiddenSinceRef = useRef<number | undefined>(
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? Date.now()
      : undefined,
  );
  const tabIdRef = useRef(createPollOwnerTabId());

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

  useEffect(() => {
    if (
      bootstrapStatus !== "ready" ||
      !activeAccountId ||
      !currentUserId ||
      pauseReasonRef.current != null
    ) {
      return;
    }

    let timeoutId: number | undefined;
    let renewIntervalId: number | undefined;
    let idleTimeoutId: number | undefined;
    let cancelled = false;

    const clearScheduledPoll = () => {
      if (timeoutId == null) {
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const clearLeaseRenewal = () => {
      if (renewIntervalId == null) {
        return;
      }

      window.clearInterval(renewIntervalId);
      renewIntervalId = undefined;
    };

    const clearIdleTimer = () => {
      if (idleTimeoutId == null) {
        return;
      }

      window.clearTimeout(idleTimeoutId);
      idleTimeoutId = undefined;
    };

    const pauseForReason = (reason: PollingPauseReason) => {
      if (pauseReasonRef.current != null) {
        return;
      }

      pauseReasonRef.current = reason;
      clearScheduledPoll();
      clearLeaseRenewal();
      clearIdleTimer();
      onPollingPaused?.(reason);
    };

    const getHiddenElapsedMs = () => {
      if (document.visibilityState !== "hidden") {
        return 0;
      }

      hiddenSinceRef.current ??= Date.now();

      return Date.now() - hiddenSinceRef.current;
    };

    const pauseIfIdleTimedOut = () => {
      if (
        document.visibilityState === "hidden" &&
        getHiddenElapsedMs() >= WORKBENCH_POLL_IDLE_TIMEOUT_MS
      ) {
        pauseForReason("idle");
        return true;
      }

      return false;
    };

    const pauseIfAnotherTabOwnsLease = () => {
      const currentLease = readPollOwnerLease();

      if (
        currentLease &&
        currentLease.ownerUserId === currentUserId &&
        currentLease.ownerTabId !== tabIdRef.current &&
        currentLease.expiresAt > Date.now()
      ) {
        pauseForReason("other-tab");
        return true;
      }

      return false;
    };

    const claimLease = () => {
      if (cancelled || pauseReasonRef.current != null) {
        return;
      }

      writePollOwnerLease(tabIdRef.current, currentUserId);
    };

    const renewLease = () => {
      if (cancelled || pauseReasonRef.current != null) {
        return;
      }

      if (pauseIfAnotherTabOwnsLease()) {
        return;
      }

      writePollOwnerLease(tabIdRef.current, currentUserId);
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

    const handleUserActivity = () => {
      if (pauseReasonRef.current != null || document.visibilityState !== "visible") {
        return;
      }

      scheduleIdleTimer();
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
        if (pauseIfIdleTimedOut()) {
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

    const pollNowAndReschedule = async () => {
      if (pauseReasonRef.current != null) {
        return;
      }

      clearScheduledPoll();
      if (pauseIfIdleTimedOut()) {
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
        hiddenSinceRef.current = undefined;
        scheduleIdleTimer();
        void pollNowAndReschedule();
        return;
      }

      hiddenSinceRef.current = Date.now();
      scheduleNextPoll();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== WORKBENCH_POLL_OWNER_STORAGE_KEY) {
        return;
      }

      const lease = parsePollOwnerLease(event.newValue);

      if (
        lease &&
        lease.ownerUserId === currentUserId &&
        lease.ownerTabId !== tabIdRef.current &&
        lease.expiresAt > Date.now()
      ) {
        pauseForReason("other-tab");
      }
    };

    claimLease();
    renewIntervalId = window.setInterval(
      renewLease,
      POLL_OWNER_RENEW_INTERVAL_MS,
    );
    scheduleIdleTimer();
    scheduleNextPoll();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleUserActivity);
    window.addEventListener("mousemove", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("pointerdown", handleUserActivity);
    window.addEventListener("touchstart", handleUserActivity);
    window.addEventListener("scroll", handleUserActivity);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      clearLeaseRenewal();
      clearIdleTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleUserActivity);
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
    };
  }, [
    activeAccountId,
    bootstrapStatus,
    currentUserId,
    intervalMs,
    jitterMs,
    onPollingPaused,
    runPollCycle,
  ]);
}

function createPollOwnerTabId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function writePollOwnerLease(ownerTabId: string, ownerUserId: string) {
  const now = Date.now();
  const lease: PollOwnerLease = {
    ownerTabId,
    ownerUserId,
    expiresAt: now + POLL_OWNER_LEASE_MS,
    updatedAt: now,
  };

  try {
    window.localStorage.setItem(
      WORKBENCH_POLL_OWNER_STORAGE_KEY,
      JSON.stringify(lease),
    );
  } catch {
    // Polling should keep working if browser storage is unavailable.
  }
}

function readPollOwnerLease() {
  try {
    return parsePollOwnerLease(
      window.localStorage.getItem(WORKBENCH_POLL_OWNER_STORAGE_KEY),
    );
  } catch {
    return undefined;
  }
}

function parsePollOwnerLease(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PollOwnerLease>;

    if (
      typeof parsed.ownerTabId !== "string" ||
      typeof parsed.ownerUserId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.updatedAt !== "number"
    ) {
      return undefined;
    }

    return parsed as PollOwnerLease;
  } catch {
    return undefined;
  }
}
