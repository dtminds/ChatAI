import type { AuthLoginRequest, AuthLoginResponse } from "@chatai/contracts";
import { http } from "@/lib/request";

const ACCESS_TOKEN_STORAGE_KEY = "chatai.accessToken";

export async function login(payload: AuthLoginRequest) {
  return http.post<{ data: AuthLoginResponse }, AuthLoginRequest>(
    "/auth/login",
    payload,
  );
}

export function storeAccessToken(accessToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
}
