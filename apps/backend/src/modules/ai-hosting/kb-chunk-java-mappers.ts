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
    createdAt: normalizeJavaChunkDisplayTime(item.createTime),
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
    updatedAt: normalizeJavaChunkDisplayTime(item.updateTime),
    volcChunkId: item.volcChunkId?.trim() || undefined,
  };
}

export const parseJavaChunkContent = parseKbChunkContent;

function normalizeJavaChunkDisplayTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  // The Java chunk API returns wall-clock strings without timezone semantics.
  // Keep them display-oriented and do not parse them as Date instants.
  const naiveDatetime = value.trim().match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/,
  );

  if (!naiveDatetime) {
    return value.trim();
  }

  return `${naiveDatetime[1]} ${naiveDatetime[2]}`;
}
