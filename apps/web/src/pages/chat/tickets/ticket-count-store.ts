import type { TicketCountsResponse } from "@chatai/contracts";
import { create } from "zustand";
import { getTicketCounts } from "./api/tickets-service";

type TicketCountInitialStatus = "error" | "idle" | "loading" | "ready";
export type TicketReminderDisplayMode = "dot" | "hidden" | "number";

type TicketCountState = {
  counts?: TicketCountsResponse;
  initialStatus: TicketCountInitialStatus;
  isRefreshing: boolean;
  lastSucceededAt?: number;
  reminderDisplayMode: TicketReminderDisplayMode;
};

const initialCountState = {
  counts: undefined,
  initialStatus: "idle",
  isRefreshing: false,
  lastSucceededAt: undefined,
} satisfies Omit<TicketCountState, "reminderDisplayMode">;
const ticketReminderDisplayStorageKey = "chat-ai-ticket-reminder-display";

let activeScopeKey: string | undefined;
let inFlight: Promise<void> | undefined;
let refreshQueued = false;
let scopeGeneration = 0;
let authoritativeCountGeneration = 0;

export const useTicketCountStore = create<TicketCountState>(() => ({
  ...initialCountState,
  reminderDisplayMode: readTicketReminderDisplayMode(),
}));

export function setTicketCountScope(scopeKey: string | undefined) {
  if (activeScopeKey === scopeKey) {
    return;
  }

  activeScopeKey = scopeKey;
  scopeGeneration += 1;
  refreshQueued = false;
  inFlight = undefined;
  useTicketCountStore.setState(initialCountState);
}

export function resetTicketCountStore() {
  activeScopeKey = undefined;
  scopeGeneration += 1;
  authoritativeCountGeneration += 1;
  refreshQueued = false;
  inFlight = undefined;
  useTicketCountStore.setState({
    ...initialCountState,
    reminderDisplayMode: readTicketReminderDisplayMode(),
  }, true);
}

export function setTicketReminderDisplayMode(
  reminderDisplayMode: TicketReminderDisplayMode,
) {
  writeTicketReminderDisplayMode(reminderDisplayMode);
  if (reminderDisplayMode === "hidden") {
    refreshQueued = false;
  }
  useTicketCountStore.setState({ reminderDisplayMode });
}

export function syncAssignedToMeActiveCount(count: number) {
  authoritativeCountGeneration += 1;
  useTicketCountStore.setState({
    counts: { assignedToMeActive: count },
    initialStatus: "ready",
    isRefreshing: false,
    lastSucceededAt: Date.now(),
  });
}

export function refreshTicketCounts(): Promise<void> {
  if (
    !activeScopeKey
    || useTicketCountStore.getState().reminderDisplayMode === "hidden"
  ) {
    return Promise.resolve();
  }

  if (inFlight) {
    refreshQueued = true;
    return inFlight;
  }

  const generation = scopeGeneration;
  const request = (async () => {
    do {
      refreshQueued = false;
      await fetchTicketCounts(generation);
    } while (
      refreshQueued
      && generation === scopeGeneration
      && useTicketCountStore.getState().reminderDisplayMode !== "hidden"
    );
  })();

  const trackedRequest = request.finally(() => {
    if (inFlight === trackedRequest) {
      inFlight = undefined;
    }
  });
  inFlight = trackedRequest;
  return trackedRequest;
}

async function fetchTicketCounts(generation: number) {
  const hasCachedCounts = useTicketCountStore.getState().counts != null;
  const countGeneration = authoritativeCountGeneration;
  useTicketCountStore.setState({
    initialStatus: hasCachedCounts ? "ready" : "loading",
    isRefreshing: hasCachedCounts,
  });

  try {
    const counts = await getTicketCounts();
    if (
      generation !== scopeGeneration
      || countGeneration !== authoritativeCountGeneration
    ) {
      return;
    }
    useTicketCountStore.setState({
      counts,
      initialStatus: "ready",
      isRefreshing: false,
      lastSucceededAt: Date.now(),
    });
  } catch {
    if (
      generation !== scopeGeneration
      || countGeneration !== authoritativeCountGeneration
    ) {
      return;
    }
    useTicketCountStore.setState({
      initialStatus: hasCachedCounts ? "ready" : "error",
      isRefreshing: false,
    });
  }
}

function readTicketReminderDisplayMode(): TicketReminderDisplayMode {
  if (typeof window === "undefined") {
    return "number";
  }

  try {
    const value = window.localStorage.getItem(ticketReminderDisplayStorageKey);
    return value === "dot" || value === "hidden" || value === "number"
      ? value
      : "number";
  } catch {
    return "number";
  }
}

function writeTicketReminderDisplayMode(mode: TicketReminderDisplayMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ticketReminderDisplayStorageKey, mode);
  } catch {
    // The ticket reminder preference is best-effort local UI state.
  }
}
