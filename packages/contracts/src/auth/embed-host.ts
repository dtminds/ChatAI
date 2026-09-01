export function isChatEmbedHostname(hostname: string) {
  const serviceLabel = normalizeHostname(hostname).split(".", 1)[0] ?? "";
  const serviceSegments = serviceLabel.split("-");

  return serviceSegments.slice(1).includes("embed");
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}
