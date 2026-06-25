const PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";

export function normalizeMediaAssetUrl(value: string) {
  const url = value.trim();

  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);

    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? url : "";
  } catch {
    const normalizedPath = url.replace(/^\/+/, "");

    if (!normalizedPath.startsWith("s5/")) {
      return "";
    }

    return `https://${PLAYABLE_MEDIA_HOST}/${normalizedPath}`;
  }
}
