export const ACCESS_TOKEN_STORAGE_KEY = "chatai.accessToken";
export const REFRESH_TOKEN_STORAGE_KEY = "chatai.refreshToken";
export const AUTH_TOKENS_CHANGED_EVENT = "chatai:auth-tokens-changed";

export function storeAuthTokens(tokens: { accessToken: string; refreshToken: string }) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
  notifyAuthTokensChanged();
}

export function clearAuthTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  notifyAuthTokensChanged();
}

export function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function hasStoredAuthToken() {
  return Boolean(
    window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ||
      window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY),
  );
}

export function subscribeAuthTokensChanged(listener: () => void) {
  window.addEventListener(AUTH_TOKENS_CHANGED_EVENT, listener);

  return () => {
    window.removeEventListener(AUTH_TOKENS_CHANGED_EVENT, listener);
  };
}

function notifyAuthTokensChanged() {
  window.dispatchEvent(new Event(AUTH_TOKENS_CHANGED_EVENT));
}
