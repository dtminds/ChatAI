import { getPlayableMediaHost } from "./media-config.js";

export function normalizeMediaAssetUrl(value: string) {
  const url = value.trim();

  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);

    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? url : "";
  } catch {
    return `https://${getPlayableMediaHost()}/${url.replace(/^\/+/, "")}`;
  }
}

export function parseJsonRecord(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function readRecordNumber(value: Record<string, unknown>, key: string) {
  const field = value[key];
  const numeric = typeof field === "number" ? field : Number(field);

  return Number.isFinite(numeric) ? numeric : undefined;
}

export function readRecordString(value: Record<string, unknown>, key: string) {
  const field = value[key];

  return typeof field === "string" ? field : "";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
