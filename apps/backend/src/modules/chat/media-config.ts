const DEFAULT_PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";

export function getPlayableMediaHost(env: NodeJS.ProcessEnv = process.env) {
  return normalizeHost(env.PLAYABLE_MEDIA_HOST) ?? DEFAULT_PLAYABLE_MEDIA_HOST;
}

function normalizeHost(host: string | undefined) {
  const normalizedHost = host?.trim().replace(/^https?:\/\//u, "").replace(/\/+$/u, "");

  return normalizedHost || undefined;
}
