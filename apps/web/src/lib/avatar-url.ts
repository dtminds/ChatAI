const WECHAT_AVATAR_HOSTS = ["wx.qlogo.cn"];
const WECOM_AVATAR_HOSTS = ["wework.qpic.cn", "p.qlogo.cn"];
const TRAILING_SIZE_SEGMENT_PATTERN = /\/0(?=([?#].*)?$)/;

export function normalizeAvatarUrl(url: string | null | undefined) {
  const value = url?.trim() ?? "";

  if (!value) {
    return "";
  }

  const hostname = getUrlHostname(value);

  if (hostname && WECOM_AVATAR_HOSTS.includes(hostname)) {
    return value.replace(TRAILING_SIZE_SEGMENT_PATTERN, "/60");
  }

  if (hostname && WECHAT_AVATAR_HOSTS.includes(hostname)) {
    return value.replace(TRAILING_SIZE_SEGMENT_PATTERN, "/64");
  }

  return value;
}

function getUrlHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
