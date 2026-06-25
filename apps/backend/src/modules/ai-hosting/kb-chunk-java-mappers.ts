import type { KbChunkListItem, KbChunkType, KbDocType } from "@chatai/contracts";
import {
  normalizeMediaAssetUrl,
  parseJsonRecord,
  readRecordString,
} from "../chat/workbench-content-utils.js";
import { mapChunkSource, normalizeChunkType } from "./kb-read-mappers.js";

export type AgentKbJavaChunkPageItem = {
  content: string | null;
  createTime: string;
  docId: number;
  id: number;
  kbId: number;
  lastSyncTime?: string | null;
  source: number;
  title: string | null;
  type: number;
  uid: number;
  updateTime: string;
  volcChunkId?: string | null;
};

type ParsedJavaChunkContent = {
  chunkType?: string;
  content: string;
  imageUrls: string[];
  title?: string;
};

export function mapJavaChunkPageItem(
  item: AgentKbJavaChunkPageItem,
  docType: KbDocType,
): KbChunkListItem {
  const parsed = parseJavaChunkContent(item.content);
  const chunkType = resolveJavaChunkType(parsed.chunkType, item.type, docType);

  return {
    chunkId: String(item.id),
    chunkType,
    content: parsed.content,
    createdAt: toIsoString(item.createTime),
    docId: String(item.docId),
    imageUrls: parsed.imageUrls.length > 0 ? parsed.imageUrls : undefined,
    kbId: String(item.kbId),
    source: mapChunkSource(item.source),
    title: item.title?.trim() || parsed.title || undefined,
    updatedAt: toIsoString(item.updateTime),
  };
}

export function parseJavaChunkContent(rawContent: string | null | undefined): ParsedJavaChunkContent {
  const trimmed = rawContent?.trim() ?? "";

  if (!trimmed) {
    return { content: "", imageUrls: [] };
  }

  const parsed = parseJsonRecord(trimmed);

  if (!parsed) {
    return { content: trimmed, imageUrls: [] };
  }

  const imageUrls = extractChunkAttachmentImageUrls(parsed);

  return {
    chunkType: readRecordString(parsed, "chunkType"),
    content: readRecordString(parsed, "content") ?? trimmed,
    imageUrls,
    title: readRecordString(parsed, "chunkTitle"),
  };
}

function extractChunkAttachmentImageUrls(parsed: Record<string, unknown>) {
  const attachments = parsed.chunkAttachment;

  if (!Array.isArray(attachments)) {
    return [];
  }

  const imageUrls: string[] = [];

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") {
      continue;
    }

    const record = attachment as Record<string, unknown>;
    const type = readRecordString(record, "type");

    if (type !== "image") {
      continue;
    }

    const link = readRecordString(record, "link");

    if (!link) {
      continue;
    }

    const normalizedUrl = normalizeMediaAssetUrl(link);

    if (normalizedUrl) {
      imageUrls.push(normalizedUrl);
    }
  }

  return imageUrls;
}

function resolveJavaChunkType(
  parsedChunkType: string | undefined,
  javaType: number,
  docType: KbDocType,
): KbChunkType {
  if (parsedChunkType) {
    return normalizeChunkType(parsedChunkType, docType);
  }

  return normalizeChunkType(javaType, docType);
}

function toIsoString(value: Date | number | string | null | undefined) {
  if (value == null) {
    return new Date(0).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toISOString();
}
