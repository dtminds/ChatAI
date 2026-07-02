import type { AiHostingQuotaOverview, AuthSubUser } from "@chatai/contracts";
import { useAuthStore } from "@/store/auth-store";
import { getAiHostingQuota } from "./agent-service";

type QuotaListener = (quota: AiHostingQuotaOverview | null) => void;

let cachedQuota: AiHostingQuotaOverview | null = null;
let cacheOwnerKey: string | null = null;
let initialLoadAttempted = false;
let inFlightQuotaRequest: Promise<AiHostingQuotaOverview> | null = null;
let requestGeneration = 0;
const listeners = new Set<QuotaListener>();

export function formatAiHostingQuotaOwnerKey(subUser?: AuthSubUser) {
  return subUser ? `${subUser.uid}:${subUser.subUserId}` : "anonymous";
}

function getAiHostingQuotaOwnerKey() {
  return formatAiHostingQuotaOwnerKey(useAuthStore.getState().subUser);
}

function shouldApplyRequestResult(generation: number, requestOwnerKey: string | null) {
  return generation === requestGeneration && requestOwnerKey === cacheOwnerKey;
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
    requestGeneration += 1;
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
  const requestOwnerKey = cacheOwnerKey;

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
  const generation = ++requestGeneration;

  const request = getAiHostingQuota()
    .then((quota) => {
      if (!shouldApplyRequestResult(generation, requestOwnerKey)) {
        return quota;
      }

      cachedQuota = quota;
      emitQuotaChange();
      return quota;
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
  requestGeneration = 0;
  emitQuotaChange();
}
