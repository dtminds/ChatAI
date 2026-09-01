const EMBED_AUTH_HANDOFF_STORAGE_KEY = "chatai.embed-auth-handoff";

let embedAccessToken: string | null = null;
let embedHandoffToken: string | null = null;

export function setEmbedAccessToken(token: string | null) {
  embedAccessToken = token && token.trim() ? token : null;
  persistEmbedAuthHandoff();
}

export function getEmbedAccessToken() {
  return embedAccessToken;
}

export function rememberEmbedHandoffToken(token: string | null) {
  embedHandoffToken = token && token.trim() ? token.trim() : null;
}

export function getRememberedEmbedHandoffToken() {
  return embedHandoffToken;
}

export function clearEmbedHandoffToken() {
  embedHandoffToken = null;
}

export function clearEmbedAuthHandoff() {
  embedAccessToken = null;
  embedHandoffToken = null;
  persistEmbedAuthHandoff();
}

export function restoreEmbedAuthHandoff() {
  if (embedAccessToken) {
    return;
  }

  const stored = readStoredEmbedAuthHandoff();

  if (stored.accessToken) {
    embedAccessToken = stored.accessToken;
  }
}

export function consumeEmbedAuthHandoffFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const token = params.get("token")?.trim() ?? "";

  if (token) {
    rememberEmbedHandoffToken(token);
  }

  params.delete("token");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function stripEmbedHandoffTokenFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("token");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function stripEmbedHandoffTokenFromWindowLocation() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (!url.searchParams.has("token")) {
    return;
  }

  url.searchParams.delete("token");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function persistEmbedAuthHandoff() {
  try {
    if (!embedAccessToken) {
      sessionStorage.removeItem(EMBED_AUTH_HANDOFF_STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(
      EMBED_AUTH_HANDOFF_STORAGE_KEY,
      JSON.stringify({
        accessToken: embedAccessToken,
      }),
    );
  } catch {
    // Ignore private-mode or disabled storage.
  }
}

function readStoredEmbedAuthHandoff(): {
  accessToken: string | null;
} {
  try {
    const raw = sessionStorage.getItem(EMBED_AUTH_HANDOFF_STORAGE_KEY);

    if (!raw) {
      return { accessToken: null };
    }

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return { accessToken: null };
    }

    const record = parsed as { accessToken?: unknown };
    const accessToken =
      typeof record.accessToken === "string" && record.accessToken.trim()
        ? record.accessToken.trim()
        : null;
    return { accessToken };
  } catch {
    return { accessToken: null };
  }
}
