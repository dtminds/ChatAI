export function parseChatEmbedHostnames(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map(normalizeHostname)
      .filter(Boolean),
  );
}

export function isChatEmbedHostname(
  hostname: string,
  configuredHostnames: ReadonlySet<string>,
) {
  return configuredHostnames.has(normalizeHostname(hostname));
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}
