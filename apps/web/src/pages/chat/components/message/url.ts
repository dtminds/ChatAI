export function getSafeMessageUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  if (url.startsWith("/")) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

const B5_MEDIA_HOST = "b5.bokr.com.cn";
const B5_IMAGE_THUMBNAIL_SUFFIX = "!w480.webp";
const B5_IMAGE_PREVIEW_SUFFIX = "!w1100.webp";

function getB5ImageBaseUrl(url: string) {
  if (url.endsWith(B5_IMAGE_THUMBNAIL_SUFFIX)) {
    return url.slice(0, -B5_IMAGE_THUMBNAIL_SUFFIX.length);
  }

  if (url.endsWith(B5_IMAGE_PREVIEW_SUFFIX)) {
    return url.slice(0, -B5_IMAGE_PREVIEW_SUFFIX.length);
  }

  return url;
}

function withB5ImageSuffix(url: string, suffix: string) {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname !== B5_MEDIA_HOST) {
      return url;
    }

    const baseUrl = getB5ImageBaseUrl(url);

    if (baseUrl.endsWith(suffix)) {
      return baseUrl;
    }

    return `${baseUrl}${suffix}`;
  } catch {
    return url;
  }
}

export function getOptimizedMessageImageUrl(url: string) {
  return withB5ImageSuffix(url, B5_IMAGE_THUMBNAIL_SUFFIX);
}

export function getPreviewMessageImageUrl(url: string) {
  return withB5ImageSuffix(url, B5_IMAGE_PREVIEW_SUFFIX);
}
