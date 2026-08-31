const EMBED_AUTH_HANDOFF_STORAGE_KEY = "chatai.embed-auth-handoff";

export type EmbedTickets = {
  id: string;
  uid: string;
};

let embedAccessToken: string | null = null;
let embedTickets: EmbedTickets | null = null;

export function setEmbedAccessToken(token: string | null) {
  embedAccessToken = token && token.trim() ? token : null;
  persistEmbedAuthHandoff();
}

export function getEmbedAccessToken() {
  return embedAccessToken;
}

export function rememberEmbedTickets(tickets: EmbedTickets | null) {
  embedTickets = tickets && tickets.id.trim() && tickets.uid.trim()
    ? { id: tickets.id.trim(), uid: tickets.uid.trim() }
    : null;
  persistEmbedAuthHandoff();
}

export function getRememberedEmbedTickets() {
  return embedTickets;
}

export function clearEmbedAuthHandoff() {
  embedAccessToken = null;
  embedTickets = null;
  persistEmbedAuthHandoff();
}

export function restoreEmbedAuthHandoff() {
  if (embedAccessToken && embedTickets) {
    return;
  }

  const stored = readStoredEmbedAuthHandoff();

  if (!embedAccessToken && stored.accessToken) {
    embedAccessToken = stored.accessToken;
  }

  if (!embedTickets && stored.tickets) {
    embedTickets = stored.tickets;
  }
}

export function consumeEmbedAuthHandoffFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const token = params.get("token")?.trim() ?? "";
  const id = params.get("id")?.trim() ?? "";
  const uid = params.get("uid")?.trim() ?? "";

  if (token) {
    setEmbedAccessToken(token);
  }

  if (id && uid) {
    rememberEmbedTickets({ id, uid });
  }

  params.delete("token");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function stripEmbedAccessTokenFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("token");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function stripEmbedAccessTokenFromWindowLocation() {
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

export function withEmbedAuthHandoff(path: string) {
  const url = new URL(path, "https://chatai.local");

  if (embedTickets) {
    if (!url.searchParams.get("id")) {
      url.searchParams.set("id", embedTickets.id);
    }

    if (!url.searchParams.get("uid")) {
      url.searchParams.set("uid", embedTickets.uid);
    }
  }

  return `${url.pathname}${url.search}`;
}

function persistEmbedAuthHandoff() {
  try {
    if (!embedAccessToken && !embedTickets) {
      sessionStorage.removeItem(EMBED_AUTH_HANDOFF_STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(
      EMBED_AUTH_HANDOFF_STORAGE_KEY,
      JSON.stringify({
        accessToken: embedAccessToken,
        tickets: embedTickets,
      }),
    );
  } catch {
    // Ignore private-mode or disabled storage.
  }
}

function readStoredEmbedAuthHandoff(): {
  accessToken: string | null;
  tickets: EmbedTickets | null;
} {
  try {
    const raw = sessionStorage.getItem(EMBED_AUTH_HANDOFF_STORAGE_KEY);

    if (!raw) {
      return { accessToken: null, tickets: null };
    }

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return { accessToken: null, tickets: null };
    }

    const record = parsed as {
      accessToken?: unknown;
      tickets?: unknown;
    };
    const accessToken =
      typeof record.accessToken === "string" && record.accessToken.trim()
        ? record.accessToken.trim()
        : null;
    const ticketsRecord =
      record.tickets && typeof record.tickets === "object"
        ? record.tickets as { id?: unknown; uid?: unknown }
        : null;
    const id = typeof ticketsRecord?.id === "string" ? ticketsRecord.id.trim() : "";
    const uid = typeof ticketsRecord?.uid === "string" ? ticketsRecord.uid.trim() : "";

    return {
      accessToken,
      tickets: id && uid ? { id, uid } : null,
    };
  } catch {
    return { accessToken: null, tickets: null };
  }
}
