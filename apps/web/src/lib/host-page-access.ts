import {
  isChatEmbedHostname,
  parseChatEmbedHostnames,
} from "@chatai/contracts";

export function isPagePathAllowedForHostname(
  hostname: string,
  pathname: string,
) {
  const embedPath = pathname === "/embed" || pathname.startsWith("/embed/");

  const configuredHostnames = parseChatEmbedHostnames(
    import.meta.env.VITE_CHAT_EMBED_HOSTNAMES,
  );

  if (isChatEmbedHostname(hostname, configuredHostnames)) {
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
