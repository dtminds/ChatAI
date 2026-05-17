import { Readable } from "node:stream";
import {
  BadGatewayError,
  BadRequestError,
} from "../../shared/errors.js";
import { noopLogger, type AppLogger } from "../../shared/logger.js";

const ALLOWED_MEDIA_HOST = "b5.bokr.com.cn";
const DEFAULT_MEDIA_PROXY_TIMEOUT_MS = 8000;

export type ProxiedMediaAsset = {
  body: Readable;
  contentLength?: string;
  contentType: string;
};

export async function fetchProxiedMediaAsset(
  rawUrl: string,
  logger: AppLogger = noopLogger,
) {
  const url = parseAllowedMediaUrl(rawUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    readMediaProxyTimeoutMs(),
  );
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
    });
  } catch (error) {
    logger.error(
      {
        host: url.hostname,
        operation: "media-proxy",
        path: url.pathname,
        reason: error instanceof Error ? error.name : "unknown",
      },
      "媒体资源代理获取失败",
    );
    throw new BadGatewayError("MEDIA_PROXY_FETCH_FAILED", "媒体资源获取失败", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    logger.error(
      {
        host: url.hostname,
        operation: "media-proxy",
        path: url.pathname,
        status: response.status,
      },
      "媒体资源代理返回异常状态",
    );
    throw new BadGatewayError("MEDIA_PROXY_FETCH_FAILED", "媒体资源获取失败", {
      status: response.status,
    });
  }

  if (!response.body) {
    logger.error(
      {
        host: url.hostname,
        operation: "media-proxy",
        path: url.pathname,
      },
      "媒体资源代理响应体为空",
    );
    throw new BadGatewayError("MEDIA_PROXY_FETCH_FAILED", "媒体资源获取失败");
  }

  return {
    body: Readable.fromWeb(response.body),
    contentLength: response.headers.get("content-length") ?? undefined,
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
  } satisfies ProxiedMediaAsset;
}

function parseAllowedMediaUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestError("INVALID_MEDIA_URL", "媒体资源地址无效");
  }

  if (url.protocol !== "https:" || url.hostname !== ALLOWED_MEDIA_HOST) {
    throw new BadRequestError("MEDIA_URL_NOT_ALLOWED", "媒体资源地址不允许访问");
  }

  return url;
}

function readMediaProxyTimeoutMs() {
  const value = Number.parseInt(process.env.MEDIA_PROXY_TIMEOUT_MS ?? "", 10);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_MEDIA_PROXY_TIMEOUT_MS;
}
