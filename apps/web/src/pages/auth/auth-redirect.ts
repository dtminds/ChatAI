import {
  getRememberedEmbedHandoffToken,
  stripEmbedHandoffTokenFromSearch,
} from "@/lib/embed-access-token";

const DEFAULT_AUTH_REDIRECT = "/chat";
const EMBED_PATH = "/embed";

type RedirectLocation = {
  hash?: string;
  pathname: string;
  search?: string;
};

export type EmbedSsoParams = {
  token: string;
};

export function isEmbedPath(pathname: string) {
  return pathname === EMBED_PATH || pathname.startsWith(`${EMBED_PATH}/`);
}

export function readEmbedSsoParams(search: string): EmbedSsoParams | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const token = params.get("token")?.trim() ?? "";

  if (!token) {
    return null;
  }

  return { token };
}

export function readEmbedSsoAttempt(location: RedirectLocation) {
  if (isEmbedPath(location.pathname)) {
    const token = getRememberedEmbedHandoffToken();

    if (!token) {
      return null;
    }

    return {
      params: { token },
      returnPath: `${location.pathname}${stripEmbedHandoffTokenFromSearch(location.search ?? "")}`,
    };
  }

  if (location.pathname !== "/login") {
    return null;
  }

  const redirect = resolveLoginRedirect(location.search ?? "");

  try {
    const redirectUrl = new URL(redirect, "https://chatai.local");

    if (!isEmbedPath(redirectUrl.pathname)) {
      return null;
    }

    const params = readEmbedSsoParams(redirectUrl.search);

    if (!params) {
      return null;
    }

    return {
      params,
      returnPath: `${redirectUrl.pathname}${stripEmbedHandoffTokenFromSearch(redirectUrl.search)}`,
    };
  } catch {
    return null;
  }
}

export function buildLoginRedirectPath(location: RedirectLocation) {
  const search = stripEmbedHandoffTokenFromSearch(location.search ?? "");
  const redirect = `${location.pathname}${search}${location.hash ?? ""}`;
  const searchParams = new URLSearchParams({ redirect });

  return `/login?${searchParams.toString()}`;
}

export function resolveLoginRedirect(search: string) {
  const redirect = new URLSearchParams(search).get("redirect");

  if (!redirect || !isSafeInternalRedirect(redirect)) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return redirect;
}

function isSafeInternalRedirect(redirect: string) {
  if (
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    redirect.includes("\\")
  ) {
    return false;
  }

  try {
    const url = new URL(redirect, "https://chatai.local");
    const normalizedPathname = decodeURIComponent(url.pathname).toLowerCase();

    return (
      url.origin === "https://chatai.local" &&
      normalizedPathname !== "/login" &&
      !normalizedPathname.startsWith("/login/")
    );
  } catch {
    return false;
  }
}
