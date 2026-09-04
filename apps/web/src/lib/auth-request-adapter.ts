import {
  isChatEmbedHostname,
  type AuthEmbedRefreshResponse,
  type AuthRefreshResponse,
  type AuthSubUser,
} from "@chatai/contracts";
import {
  setEmbedAccessToken,
} from "@/lib/embed-access-token";

export type AuthScope = "app" | "embed";

export type AuthRefreshPayload =
  | AuthEmbedRefreshResponse
  | AuthRefreshResponse;

type AuthRequestAdapter = {
  applyRefresh: (payload: AuthRefreshPayload) => AuthSubUser;
  refreshUrl: string;
};

const appAuthAdapter: AuthRequestAdapter = {
  applyRefresh: ({ subUser }) => subUser,
  refreshUrl: "/auth/refresh",
};

const embedAuthAdapter: AuthRequestAdapter = {
  applyRefresh: (payload) => {
    if (!("accessToken" in payload)) {
      throw new Error("Embed auth refresh did not return an access token");
    }

    setEmbedAccessToken(payload.accessToken);
    return payload.subUser;
  },
  refreshUrl: "/embed/auth/refresh",
};

export function getAuthRequestAdapter(scope: AuthScope) {
  return scope === "embed" ? embedAuthAdapter : appAuthAdapter;
}

export function getAuthScopeForHostname(hostname: string): AuthScope {
  return isChatEmbedHostname(hostname) ? "embed" : "app";
}
