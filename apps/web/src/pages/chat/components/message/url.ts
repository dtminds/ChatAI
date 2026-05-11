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
const B5_IMAGE_PREVIEW_SUFFIX = "!w480.webp";

export function getOptimizedMessageImageUrl(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (
      parsedUrl.hostname === B5_MEDIA_HOST &&
      !url.endsWith(B5_IMAGE_PREVIEW_SUFFIX)
    ) {
      return `${url}${B5_IMAGE_PREVIEW_SUFFIX}`;
    }
  } catch {
    return url;
  }

  return url;
}
