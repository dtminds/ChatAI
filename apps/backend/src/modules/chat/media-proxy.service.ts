import {
  BadGatewayError,
  BadRequestError,
} from "../../shared/errors.js";
import { noopLogger, type AppLogger } from "../../shared/logger.js";
import { getPlayableMediaHost } from "./media-config.js";

const DEFAULT_MEDIA_PROXY_TIMEOUT_MS = 8000;
const SOURCE_VOICE_PREFIXES = ["/s5/voice/", "/s5/msg/"] as const;
const PLAYABLE_VOICE_PREFIX = "/s5/playable-voice/";

export type PlayableVoiceStatus = {
  playable: boolean;
  playableUrl?: string;
};

export async function checkPlayableVoiceAsset(
  rawUrl: string,
  logger: AppLogger = noopLogger,
): Promise<PlayableVoiceStatus> {
  const sourceUrl = parseAllowedMediaUrl(rawUrl);
  const playableUrl = buildPlayableVoiceUrl(sourceUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    readMediaProxyTimeoutMs(),
  );
  let response: Response;

  try {
    response = await fetch(playableUrl.toString(), {
      method: "HEAD",
      signal: controller.signal,
    });
  } catch (error) {
    logger.error(
      {
        host: playableUrl.hostname,
        operation: "playable-voice-head",
        path: playableUrl.pathname,
        reason: error instanceof Error ? error.name : "unknown",
      },
      "可播放语音资源检查失败",
    );
    throw new BadGatewayError("PLAYABLE_VOICE_CHECK_FAILED", "语音资源检查失败", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 404) {
    return { playable: false };
  }

  if (!response.ok) {
    logger.error(
      {
        host: playableUrl.hostname,
        operation: "playable-voice-head",
        path: playableUrl.pathname,
        status: response.status,
      },
      "可播放语音资源检查返回异常状态",
    );
    throw new BadGatewayError("PLAYABLE_VOICE_CHECK_FAILED", "语音资源检查失败", {
      status: response.status,
    });
  }

  return {
    playable: true,
    playableUrl: playableUrl.toString(),
  };
}

function parseAllowedMediaUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestError("INVALID_MEDIA_URL", "媒体资源地址无效");
  }

  if (url.protocol !== "https:" || url.host !== getPlayableMediaHost()) {
    throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "媒体资源地址不允许访问");
  }

  return url;
}

function buildPlayableVoiceUrl(sourceUrl: URL) {
  const sourcePrefix = SOURCE_VOICE_PREFIXES.find((prefix) =>
    sourceUrl.pathname.startsWith(prefix),
  );

  if (!sourcePrefix) {
    throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "媒体资源地址不允许访问");
  }

  const playableUrl = new URL(sourceUrl);
  playableUrl.pathname = `${PLAYABLE_VOICE_PREFIX}${sourceUrl.pathname.slice(sourcePrefix.length)}`
    .replace(/\.[^/.]+$/u, ".wav");
  playableUrl.search = "";
  playableUrl.hash = "";

  return playableUrl;
}

function readMediaProxyTimeoutMs() {
  const value = Number.parseInt(process.env.MEDIA_PROXY_TIMEOUT_MS ?? "", 10);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_MEDIA_PROXY_TIMEOUT_MS;
}
