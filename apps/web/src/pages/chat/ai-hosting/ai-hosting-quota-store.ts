import type { AiHostingQuotaOverview } from "@chatai/contracts";
import { useAuthStore } from "@/store/auth-store";
import { getAiHostingQuota } from "./agent-service";

type QuotaListener = (quota: AiHostingQuotaOverview | null) => void;

let cachedQuota: AiHostingQuotaOverview | null = null;
let cacheOwnerKey: string | null = null;
let initialLoadAttempted = false;
let inFlightQuotaRequest: Promise<AiHostingQuotaOverview> | null = null;
const listeners = new Set<QuotaListener>();

export function getAiHostingQuotaOwnerKey() {
  const subUser = useAuthStore.getState().subUser;

  return subUser ? `${subUser.uid}:${subUser.subUserId}` : "anonymous";
}

function emitQuotaChange() {
  listeners.forEach((listener) => listener(cachedQuota));
}

function ensureCurrentOwner() {
  const ownerKey = getAiHostingQuotaOwnerKey();

  if (ownerKey !== cacheOwnerKey) {
    cacheOwnerKey = ownerKey;
    cachedQuota = null;
    initialLoadAttempted = false;
    inFlightQuotaRequest = null;
    emitQuotaChange();
  }
}

export function getCachedAiHostingQuota() {
  ensureCurrentOwner();
  return cachedQuota;
}

export function subscribeAiHostingQuota(listener: QuotaListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function fetchAiHostingQuota(options: {
  force: true;
}): Promise<AiHostingQuotaOverview>;
export function fetchAiHostingQuota(options?: {
  force?: false;
}): Promise<AiHostingQuotaOverview | null>;
export async function fetchAiHostingQuota(options: { force?: boolean } = {}) {
  ensureCurrentOwner();

  if (!options.force && cachedQuota) {
    return cachedQuota;
  }

  if (!options.force && inFlightQuotaRequest) {
    return inFlightQuotaRequest;
  }

  if (!options.force && initialLoadAttempted) {
    return cachedQuota;
  }

  initialLoadAttempted = true;

  const request = getAiHostingQuota()
    .then((quota) => {
      cachedQuota = quota;
      emitQuotaChange();
      return quota;
    })
    .catch((error) => {
      if (options.force) {
        cachedQuota = null;
        emitQuotaChange();
      }

      throw error;
    })
    .finally(() => {
      if (inFlightQuotaRequest === request) {
        inFlightQuotaRequest = null;
      }
    });

  inFlightQuotaRequest = request;
  return request;
}

export function resetAiHostingQuotaCacheForTest() {
  cachedQuota = null;
  cacheOwnerKey = null;
  initialLoadAttempted = false;
  inFlightQuotaRequest = null;
  emitQuotaChange();
}
