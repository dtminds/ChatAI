import type {
  AuthEmbedSsoRequest,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthRefreshResponse,
  AuthSessionResponse,
  SupportInvestigationAccountListResponse,
  SupportInvestigationStartRequest,
  SupportInvestigationStartResponse,
} from "@chatai/contracts";
import {
  exchangeEmbedSso,
  http,
  RequestNormalizedError,
} from "@/lib/request";

export async function login(payload: AuthLoginRequest) {
  return http.post<{ data: AuthLoginResponse }, AuthLoginRequest>(
    "/auth/login",
    payload,
    {
      _skipAuthRetry: true,
    },
  );
}

export async function loginWithEmbedSso(payload: AuthEmbedSsoRequest) {
  return exchangeEmbedSso(payload);
}

export function isEmbedSsoRejected(error: unknown) {
  return error instanceof RequestNormalizedError && error.code === "EMBED_SSO_REJECTED";
}

export function isEmbedHandoffRejected(error: unknown) {
  return error instanceof RequestNormalizedError
    && error.code === "EMBED_HANDOFF_REJECTED";
}

export function isAuthSessionRejected(error: unknown) {
  return error instanceof RequestNormalizedError && error.status === 401;
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
