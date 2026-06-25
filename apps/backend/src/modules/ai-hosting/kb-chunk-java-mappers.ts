import type { KbChunkListItem, KbDocType } from "@chatai/contracts";
import { parseJsonRecord } from "../chat/workbench-content-utils.js";
import { parseKbChunkContent } from "./kb-chunk-content-parser.js";
import {
  mapChunkSource,
  resolveKbChunkContent,
  resolveKbChunkImageUrls,
  resolveKbChunkType,
} from "./kb-read-mappers.js";

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
  const rawContent = item.content?.trim() ?? "";
  const rawIsJson = Boolean(parseJsonRecord(rawContent));
  const chunkType = resolveKbChunkType(parsed, item.type, docType);

  return {
    chunkId: String(item.id),
    chunkType,
    content: resolveKbChunkContent(
      { content: item.content, description: null },
      docType,
      parsed,
      rawIsJson,
    ),
    createdAt: toIsoString(item.createTime),
    docId: String(item.docId),
    imageUrls: resolveKbChunkImageUrls(
      { content: item.content },
      chunkType,
      docType,
      parsed,
      rawIsJson,
    ),
    kbId: String(item.kbId),
    source: mapChunkSource(item.source),
    title: item.title?.trim() || parsed.title || undefined,
    updatedAt: toIsoString(item.updateTime),
  };
}

export const parseJavaChunkContent = parseKbChunkContent;

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
