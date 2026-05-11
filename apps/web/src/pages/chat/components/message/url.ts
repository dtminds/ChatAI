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
