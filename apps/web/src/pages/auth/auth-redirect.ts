const DEFAULT_AUTH_REDIRECT = "/chat";

type RedirectLocation = {
  hash?: string;
  pathname: string;
  search?: string;
};

export function buildLoginRedirectPath(location: RedirectLocation) {
  const redirect = `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
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
