import { isChatEmbedHostname } from "@chatai/contracts";

export function getWorkflowDirectEntryOrigin() {
  const configuredOrigin = import.meta.env.VITE_WORKFLOW_DIRECT_ENTRY_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall through to the embedding page origin.
    }
  }

  if (typeof window === "undefined") return null;
  if (!isChatEmbedHostname(window.location.hostname)) return window.location.origin;

  try {
    if (window.parent !== window) return new URL(document.referrer).origin;
  } catch {
    // Cross-origin parent access is expected to fail.
  }

  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

export function isPagePathAllowedForHostname(
  hostname: string,
  pathname: string,
) {
  const embedPath = pathname === "/embed" || pathname.startsWith("/embed/");

  if (isChatEmbedHostname(hostname)) {
    return embedPath;
  }

  if (isLocalDevelopmentHostname(hostname)) {
    return true;
  }

  return !embedPath;
}

function isLocalDevelopmentHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");

  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized.endsWith(".localhost");
}
