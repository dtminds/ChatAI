const DEFAULT_FALLBACK_EXTENSION = "bin";

export function buildCosUploadObjectKey(prefix: string, extension: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}${Date.now()}-${randomPart}.${extension}`;
}

export function normalizeCosUploadPrefix(
  prefix: string,
  fallbackPrefix?: string,
) {
  const normalizedPrefix = prefix
    .trim()
    .replace(/^\/+/, "")
    .replace(/\*+$/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/");

  if (!normalizedPrefix && fallbackPrefix !== undefined) {
    return fallbackPrefix;
  }

  return `${normalizedPrefix}/`;
}

export function resolveImageUploadExtension(
  contentType: string,
  fallbackExtension = DEFAULT_FALLBACK_EXTENSION,
) {
  const [, rawSubtype] = contentType.split("/");
  const subtype = rawSubtype?.split(";")[0]?.trim().toLowerCase();

  if (!subtype) {
    return fallbackExtension;
  }

  if (subtype === "jpeg") {
    return "jpg";
  }

  if (subtype.includes("+")) {
    return subtype.split("+")[0] || fallbackExtension;
  }

  return subtype.replace(/[^a-z0-9]/g, "") || fallbackExtension;
}
