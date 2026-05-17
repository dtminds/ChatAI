import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

export const WORKBENCH_POLL_OWNER_STORAGE_KEY = "chatai.workbench.pollOwner";

const POLL_OWNER_LEASE_MS = 15000;
const POLL_OWNER_RENEW_INTERVAL_MS = 5000;

type PollOwnerLease = {
  ownerTabId: string;
  ownerUserId: string;
  expiresAt: number;
  updatedAt: number;
};

type UseWorkbenchPollingLeaseOptions = {
  currentUserId?: string;
  enabled: boolean;
  onLostLease: () => void;
};

type WorkbenchPollingLease = {
  isOwnedByAnotherTab: () => boolean;
  isPausedByOtherTab: boolean;
};

export function useWorkbenchPollingLease({
  currentUserId,
  enabled,
  onLostLease,
}: UseWorkbenchPollingLeaseOptions): WorkbenchPollingLease {
  const [isPausedByOtherTab, setIsPausedByOtherTab] = useState(false);
  const tabIdRef = useRef(createPollOwnerTabId());
  const handleLostLease = useEffectEvent(() => {
    setIsPausedByOtherTab(true);
    onLostLease();
  });

  const isOwnedByAnotherTab = useEffectEvent(() =>
    isLeaseOwnedByAnotherTab(readPollOwnerLease(), currentUserId, tabIdRef.current),
  );

  useEffect(() => {
    if (!enabled || !currentUserId || isPausedByOtherTab) {
      return;
    }

    let renewIntervalId: number | undefined;
    let cancelled = false;

    const clearLeaseRenewal = () => {
      if (renewIntervalId == null) {
        return;
      }

      window.clearInterval(renewIntervalId);
      renewIntervalId = undefined;
    };

    const claimLease = () => {
      if (cancelled || isPausedByOtherTab) {
        return;
      }

      writePollOwnerLease(tabIdRef.current, currentUserId);
    };

    const renewLease = () => {
      if (cancelled || isPausedByOtherTab) {
        return;
      }

      if (isOwnedByAnotherTab()) {
        clearLeaseRenewal();
        handleLostLease();
        return;
      }

      writePollOwnerLease(tabIdRef.current, currentUserId);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== WORKBENCH_POLL_OWNER_STORAGE_KEY) {
        return;
      }

      if (
        isLeaseOwnedByAnotherTab(parsePollOwnerLease(event.newValue), currentUserId, tabIdRef.current)
      ) {
        clearLeaseRenewal();
        handleLostLease();
      }
    };

    claimLease();
    renewIntervalId = window.setInterval(
      renewLease,
      POLL_OWNER_RENEW_INTERVAL_MS,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      cancelled = true;
      clearLeaseRenewal();
      window.removeEventListener("storage", handleStorage);
    };
  }, [
    currentUserId,
    enabled,
    isPausedByOtherTab,
  ]);

  return useMemo(
    () => ({
      isOwnedByAnotherTab,
      isPausedByOtherTab,
    }),
    [isOwnedByAnotherTab, isPausedByOtherTab],
  );
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

function isLeaseOwnedByAnotherTab(
  lease: PollOwnerLease | undefined,
  currentUserId: string | undefined,
  tabId: string,
) {
  return Boolean(
    lease &&
      lease.ownerUserId === currentUserId &&
      lease.ownerTabId !== tabId &&
      lease.expiresAt > Date.now(),
  );
}
