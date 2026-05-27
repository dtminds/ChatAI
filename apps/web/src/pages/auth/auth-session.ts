import type { AuthSubUser } from "@chatai/contracts";

import { getAuthSession } from "@/pages/auth/auth-service";

type AuthSessionListener = (generation: number) => void;

let sessionGeneration = 0;
let cachedSubUser: AuthSubUser | undefined;
const listeners = new Set<AuthSessionListener>();

export function getAuthSessionGeneration() {
  return sessionGeneration;
}

export function getCachedAuthSubUser() {
  return cachedSubUser;
}

export function subscribeAuthSessionSnapshot(listener: AuthSessionListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function notifyAuthSessionSnapshot() {
  const generation = sessionGeneration;

  for (const listener of listeners) {
    listener(generation);
  }
}

export function resetAuthSessionSnapshot() {
  sessionGeneration += 1;
  cachedSubUser = undefined;
  notifyAuthSessionSnapshot();
}

export async function syncAuthSession(options: { force?: boolean } = {}) {
  if (!options.force && cachedSubUser !== undefined) {
    return cachedSubUser;
  }

  const generation = ++sessionGeneration;

  try {
    const response = await getAuthSession();

    if (generation !== sessionGeneration) {
      return undefined;
    }

    cachedSubUser = response.data.subUser;
    notifyAuthSessionSnapshot();
    return cachedSubUser;
  } catch {
    if (generation !== sessionGeneration) {
      return undefined;
    }

    cachedSubUser = undefined;
    notifyAuthSessionSnapshot();
    return undefined;
  }
}
