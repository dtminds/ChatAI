import type { KbChunkListItem, KbChunkType, KbDocType } from "@chatai/contracts";
import { parseKbChunkContent } from "./kb-chunk-content-parser.js";
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

export function mapJavaChunkPageItem(
  item: AgentKbJavaChunkPageItem,
  docType: KbDocType,
): KbChunkListItem {
  const parsed = parseKbChunkContent(item.content);
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

export const parseJavaChunkContent = parseKbChunkContent;

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
