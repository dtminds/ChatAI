import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthRefreshRequest,
  AuthRefreshResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function login(payload: AuthLoginRequest) {
  return http.post<{ data: AuthLoginResponse }, AuthLoginRequest>(
    "/auth/login",
    payload,
  );
}

export async function refreshAccessToken(refreshToken: string) {
  return http.post<{ data: AuthRefreshResponse }, AuthRefreshRequest>(
    "/auth/refresh",
    { refreshToken },
    {
      _skipAuthRetry: true,
    },
  );
}

export async function logout() {
  return http.post<{ data: { revoked: boolean } }>("/auth/logout");
}
