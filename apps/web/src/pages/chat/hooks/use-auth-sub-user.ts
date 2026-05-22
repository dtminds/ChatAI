import type { AuthSubUser } from "@chatai/contracts";
import { useEffect, useState } from "react";

import { getAuthSession } from "@/pages/auth/auth-service";

export function useAuthSubUser() {
  const [subUser, setSubUser] = useState<AuthSubUser | undefined>(undefined);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const response = await getAuthSession();

        if (!ignore) {
          setSubUser(response.data.subUser);
        }
      } catch {
        if (!ignore) {
          setSubUser(undefined);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  return subUser;
}

export function isChatReadOnlySubUser(subUser: AuthSubUser | undefined) {
  if (!subUser) {
    return false;
  }

  return subUser.role === "viewer" || !subUser.permissions.includes("chat.send");
}
