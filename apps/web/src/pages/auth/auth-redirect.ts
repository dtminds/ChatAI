import {
  getRememberedEmbedWorkflowTickets,
  stripEmbedAccessTokenFromSearch,
} from "@/lib/embed-access-token";

const DEFAULT_AUTH_REDIRECT = "/chat";
const EMBED_WORKFLOW_PATH = "/embed/workflows";

type RedirectLocation = {
  hash?: string;
  pathname: string;
  search?: string;
};

export type EmbedWorkflowSsoParams = {
  id: string;
  uid: string;
};

export function isEmbedWorkflowPath(pathname: string) {
  return pathname === EMBED_WORKFLOW_PATH
    || pathname.startsWith(`${EMBED_WORKFLOW_PATH}/`);
}

export function readEmbedWorkflowSsoParams(search: string): EmbedWorkflowSsoParams | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const id = params.get("id")?.trim() ?? "";
  const uid = params.get("uid")?.trim() ?? "";

  if (!id || !uid) {
    return null;
  }

  return { id, uid };
}

export function readEmbedWorkflowSsoAttempt(location: RedirectLocation) {
  if (isEmbedWorkflowPath(location.pathname)) {
    const params = readEmbedWorkflowSsoParams(location.search ?? "")
      ?? getRememberedEmbedWorkflowTickets();

    if (!params) {
      return null;
    }

    return {
      params,
      returnPath: `${location.pathname}${stripEmbedAccessTokenFromSearch(location.search ?? "")}`,
    };
  }

  if (location.pathname !== "/login") {
    return null;
  }

  const redirect = resolveLoginRedirect(location.search ?? "");

  try {
    const redirectUrl = new URL(redirect, "https://chatai.local");

    if (!isEmbedWorkflowPath(redirectUrl.pathname)) {
      return null;
    }

    const params = readEmbedWorkflowSsoParams(redirectUrl.search);

    if (!params) {
      return null;
    }

    return {
      params,
      returnPath: `${redirectUrl.pathname}${stripEmbedAccessTokenFromSearch(redirectUrl.search)}`,
    };
  } catch {
    return null;
  }
}

export function buildLoginRedirectPath(location: RedirectLocation) {
  const search = stripEmbedAccessTokenFromSearch(location.search ?? "");
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
