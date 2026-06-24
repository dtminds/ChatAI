const DEFAULT_PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";

export function getPlayableMediaHost() {
  const configuredHost = import.meta.env.VITE_PLAYABLE_MEDIA_HOST?.trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\/+$/u, "");

  return configuredHost || DEFAULT_PLAYABLE_MEDIA_HOST;
}

export function encodeCosObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function buildMediaAssetUrl(objectKey: string) {
  const normalizedKey = objectKey.replace(/^\/+/u, "");

  return `https://${getPlayableMediaHost()}/${encodeCosObjectKey(normalizedKey)}`;
}
