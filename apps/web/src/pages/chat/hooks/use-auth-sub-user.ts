import type { AuthSubUser } from "@chatai/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAuthSessionGeneration,
  getCachedAuthSubUser,
  subscribeAuthSessionSnapshot,
} from "@/pages/auth/auth-session";

export function useAuthSubUser() {
  const [subUser, setSubUser] = useState<AuthSubUser | undefined>(getCachedAuthSubUser);
  const isMountedRef = useRef(false);

  const applySnapshot = useCallback((generation: number) => {
    if (!isMountedRef.current) {
      return;
    }

    if (generation !== getAuthSessionGeneration()) {
      return;
    }

    setSubUser(getCachedAuthSubUser());
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    applySnapshot(getAuthSessionGeneration());

    const unsubscribe = subscribeAuthSessionSnapshot((generation) => {
      applySnapshot(generation);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [applySnapshot]);

  return subUser;
}

export function isChatReadOnlySubUser(subUser: AuthSubUser | undefined) {
  if (!subUser) {
    return true;
  }

  return subUser.role === "viewer" || !subUser.permissions?.includes("chat.send");
}
