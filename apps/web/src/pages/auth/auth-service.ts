import type {
  AuthEmbedSsoRequest,
  AuthEmbedSsoResponse,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthRefreshResponse,
  AuthSessionResponse,
  SupportInvestigationAccountListResponse,
  SupportInvestigationStartRequest,
  SupportInvestigationStartResponse,
} from "@chatai/contracts";
import { setEmbedAccessToken } from "@/lib/embed-access-token";
import { http, RequestNormalizedError } from "@/lib/request";

export async function login(payload: AuthLoginRequest) {
  return http.post<{ data: AuthLoginResponse }, AuthLoginRequest>(
    "/auth/login",
    payload,
    {
      _skipAuthRetry: true,
    },
  );
}

let embedSsoInFlight:
  | Promise<{ data: AuthEmbedSsoResponse }>
  | null = null;
let embedSsoInFlightKey: string | null = null;

export async function loginWithEmbedSso(payload: AuthEmbedSsoRequest) {
  const key = `${payload.id}\0${payload.uid}`;

  if (embedSsoInFlight && embedSsoInFlightKey === key) {
    return embedSsoInFlight;
  }

  embedSsoInFlightKey = key;
  embedSsoInFlight = http.post<{ data: AuthEmbedSsoResponse }, AuthEmbedSsoRequest>(
    "/auth/embed-sso",
    payload,
    {
      _skipAuthRetry: true,
    },
  ).then((response) => {
    setEmbedAccessToken(response.data.accessToken);
    return response;
  }).finally(() => {
    if (embedSsoInFlightKey === key) {
      embedSsoInFlight = null;
      embedSsoInFlightKey = null;
    }
  });

  return embedSsoInFlight;
}

export function isEmbedSsoRejected(error: unknown) {
  return error instanceof RequestNormalizedError && error.code === "EMBED_SSO_REJECTED";
}

export async function refreshAccessToken() {
  return http.post<{ data: AuthRefreshResponse }>(
    "/auth/refresh",
    undefined,
    {
      _skipAuthRetry: true,
    },
  );
}

export async function getAuthSession() {
  return http.get<{ data: AuthSessionResponse }>("/auth/session", {
    _skipAuthRetry: true,
  });
}

export async function getSupportInvestigationAccounts(uid: number) {
  return http.get<{ data: SupportInvestigationAccountListResponse }>(
    "/auth/support-investigation/accounts",
    { params: { uid } },
  );
}

export async function startSupportInvestigation(
  payload: SupportInvestigationStartRequest,
) {
  return http.post<
    { data: SupportInvestigationStartResponse },
    SupportInvestigationStartRequest
  >("/auth/support-investigation/start", payload);
}

export async function logout() {
  return http.post<{ data: { revoked: boolean } }>(
    "/auth/logout",
    undefined,
    { supportReadonlyAllowed: true },
  );
}
