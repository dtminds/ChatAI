export function isExpiringUrlExpired(expireTime: number | undefined, now = Date.now()) {
  return isPositiveFiniteNumber(expireTime) && expireTime <= now;
}

export function canUseExpiringUrl(url: string, expireTime: number | undefined) {
  return isSafeHttpOrRelativeUrl(url) && !isExpiringUrlExpired(expireTime);
}

export function isSafeHttpOrRelativeUrl(url: string) {
  if (url.startsWith("/")) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
