import { useEffect, useEffectEvent, useRef } from "react";

export const WORKBENCH_POLL_OWNER_STORAGE_KEY = "chatai.workbench.pollOwner";

const POLL_OWNER_LEASE_MS = 15000;
const POLL_OWNER_RENEW_INTERVAL_MS = 5000;

type PollOwnerLease = {
  ownerTabId: string;
  ownerUserId: string;
  expiresAt: number;
  updatedAt: number;
};

type UseWorkbenchPollingOptions = {
  activeAccountId?: string;
  bootstrapStatus: "idle" | "loading" | "ready" | "error";
  currentUserId?: string;
  intervalMs: number;
  jitterMs: number;
  onPollingPausedByOtherTab?: () => void;
  pollWorkbench: () => Promise<void>;
};

export function useWorkbenchPolling({
  activeAccountId,
  bootstrapStatus,
  currentUserId,
  intervalMs,
  jitterMs,
  onPollingPausedByOtherTab,
  pollWorkbench,
}: UseWorkbenchPollingOptions) {
  const isPollingRef = useRef(false);
  const isPausedByOtherTabRef = useRef(false);
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
      isPausedByOtherTabRef.current
    ) {
      return;
    }

    let timeoutId: number | undefined;
    let renewIntervalId: number | undefined;
    let cancelled = false;
    let pausedByOtherTab = false;

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

    const pauseForOtherTab = () => {
      if (pausedByOtherTab) {
        return;
      }

      isPausedByOtherTabRef.current = true;
      pausedByOtherTab = true;
      clearScheduledPoll();
      clearLeaseRenewal();
      onPollingPausedByOtherTab?.();
    };

    const pauseIfAnotherTabOwnsLease = () => {
      const currentLease = readPollOwnerLease();

      if (
        currentLease &&
        currentLease.ownerUserId === currentUserId &&
        currentLease.ownerTabId !== tabIdRef.current &&
        currentLease.expiresAt > Date.now()
      ) {
        pauseForOtherTab();
        return true;
      }

      return false;
    };

    const claimLease = () => {
      if (cancelled || pausedByOtherTab) {
        return;
      }

      writePollOwnerLease(tabIdRef.current, currentUserId);
    };

    const renewLease = () => {
      if (cancelled || pausedByOtherTab) {
        return;
      }

      if (pauseIfAnotherTabOwnsLease()) {
        return;
      }

      writePollOwnerLease(tabIdRef.current, currentUserId);
    };

    const scheduleNextPoll = () => {
      if (pausedByOtherTab) {
        return;
      }

      clearScheduledPoll();

      const baseInterval =
        document.visibilityState === "hidden"
          ? Math.max(10000, intervalMs)
          : intervalMs;
      const jitter = Math.floor(Math.random() * jitterMs);

      timeoutId = window.setTimeout(async () => {
        timeoutId = undefined;
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
      if (pausedByOtherTab) {
        return;
      }

      clearScheduledPoll();
      if (pauseIfAnotherTabOwnsLease()) {
        return;
      }

      await runPollCycle();

      if (!cancelled) {
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (pausedByOtherTab) {
        return;
      }

      if (document.visibilityState === "visible") {
        void pollNowAndReschedule();
        return;
      }

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
        pauseForOtherTab();
      }
    };

    claimLease();
    renewIntervalId = window.setInterval(
      renewLease,
      POLL_OWNER_RENEW_INTERVAL_MS,
    );
    scheduleNextPoll();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      cancelled = true;
      clearScheduledPoll();
      clearLeaseRenewal();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [
    activeAccountId,
    bootstrapStatus,
    currentUserId,
    intervalMs,
    jitterMs,
    onPollingPausedByOtherTab,
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
