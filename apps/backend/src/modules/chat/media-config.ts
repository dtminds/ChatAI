const DEFAULT_PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";
export const SOURCE_VOICE_PREFIXES = ["/s5/voice/", "/s5/msg/"] as const;
export const PLAYABLE_VOICE_PREFIX = "/s5/playable-voice/";

export function getPlayableMediaHost(env: NodeJS.ProcessEnv = process.env) {
  return normalizeHost(env.PLAYABLE_MEDIA_HOST) ?? DEFAULT_PLAYABLE_MEDIA_HOST;
}

function normalizeHost(host: string | undefined) {
  const normalizedHost = host?.trim().replace(/^https?:\/\//u, "").replace(/\/+$/u, "");

  return normalizedHost || undefined;
}

export function toPlayableVoicePathname(pathname: string) {
  const sourcePrefix = SOURCE_VOICE_PREFIXES.find((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!sourcePrefix) {
    return undefined;
  }

  return `${PLAYABLE_VOICE_PREFIX}${pathname.slice(sourcePrefix.length)}`.replace(
    /\.[^/.]+$/u,
    ".wav",
  );
}

export function isPlayableVoicePathname(pathname: string) {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return (
    normalizedPathname.startsWith(PLAYABLE_VOICE_PREFIX) &&
    /\.wav$/i.test(normalizedPathname)
  );
}
