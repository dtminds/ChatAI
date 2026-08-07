import { useEffect } from "react";
import type { WorkbenchBroadcastProtectionStatusDto } from "@chatai/contracts";
import { create } from "zustand";
import { getBroadcastProtectionStatus } from "@/pages/chat/api/broadcast-protection-service";
import { useAuthStore } from "@/store/auth-store";

export const BROADCAST_PROTECTION_POLL_INTERVAL_MS = 60_000;
const BROADCAST_PROTECTION_FAILURE_LIMIT = 3;

export type BroadcastProtectionRefreshResult =
  | {
      kind: "active";
      status: WorkbenchBroadcastProtectionStatusDto;
    }
  | { kind: "error" }
  | { kind: "inactive" }
  | { kind: "stale" };

type BroadcastProtectionState = {
  consecutiveFailureCount: number;
  scopeUid?: number;
  status?: WorkbenchBroadcastProtectionStatusDto;
};

const initialState: BroadcastProtectionState = {
  consecutiveFailureCount: 0,
  scopeUid: undefined,
  status: undefined,
};

export const useBroadcastProtectionStore = create<BroadcastProtectionState>(
  () => initialState,
);

let inFlightRequest: Promise<BroadcastProtectionRefreshResult> | null = null;
let requestController: AbortController | null = null;

function cancelInFlightRequest() {
  requestController?.abort();
  requestController = null;
  inFlightRequest = null;
}

export function setBroadcastProtectionScope(uid: number | undefined) {
  if (useBroadcastProtectionStore.getState().scopeUid === uid) {
    return;
  }

  cancelInFlightRequest();
  useBroadcastProtectionStore.setState({
    consecutiveFailureCount: 0,
    scopeUid: uid,
    status: undefined,
  });
}

export function clearBroadcastProtectionScope(uid: number) {
  if (useBroadcastProtectionStore.getState().scopeUid !== uid) {
    return;
  }

  cancelInFlightRequest();
  useBroadcastProtectionStore.setState(initialState);
}

export function resetBroadcastProtectionStore() {
  cancelInFlightRequest();
  useBroadcastProtectionStore.setState(initialState, true);
}

export function refreshBroadcastProtection(): Promise<BroadcastProtectionRefreshResult> {
  const uid = useBroadcastProtectionStore.getState().scopeUid;

  if (uid == null) {
    return Promise.resolve({ kind: "inactive" });
  }

  if (inFlightRequest) {
    return inFlightRequest;
  }

  const controller = new AbortController();
  requestController = controller;
  const request = Promise.resolve()
    .then(() => getBroadcastProtectionStatus({ signal: controller.signal }))
    .then<BroadcastProtectionRefreshResult>((status) => {
      if (useBroadcastProtectionStore.getState().scopeUid !== uid) {
        return { kind: "stale" };
      }

      if (status.degradeCallbackCnt > 0) {
        useBroadcastProtectionStore.setState({
          consecutiveFailureCount: 0,
          status,
        });
        return { kind: "active", status };
      }

      useBroadcastProtectionStore.setState({
        consecutiveFailureCount: 0,
        status: undefined,
      });
      return { kind: "inactive" };
    })
    .catch<BroadcastProtectionRefreshResult>(() => {
      if (
        controller.signal.aborted ||
        useBroadcastProtectionStore.getState().scopeUid !== uid
      ) {
        return { kind: "stale" };
      }

      const current = useBroadcastProtectionStore.getState();
      const consecutiveFailureCount = current.consecutiveFailureCount + 1;
      useBroadcastProtectionStore.setState({
        consecutiveFailureCount,
        status:
          consecutiveFailureCount >= BROADCAST_PROTECTION_FAILURE_LIMIT
            ? undefined
            : current.status,
      });
      return { kind: "error" };
    })
    .finally(() => {
      if (inFlightRequest === request) {
        inFlightRequest = null;
        requestController = null;
      }
    });

  inFlightRequest = request;
  return request;
}

export function useBroadcastProtectionPolling() {
  const uid = useAuthStore((state) => state.subUser?.uid);

  useEffect(() => {
    setBroadcastProtectionScope(uid);

    if (uid == null) {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshBroadcastProtection();
      }
    };
    const intervalId = window.setInterval(
      refreshIfVisible,
      BROADCAST_PROTECTION_POLL_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", refreshIfVisible);
    refreshIfVisible();

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      clearBroadcastProtectionScope(uid);
    };
  }, [uid]);
}
