import type {
  KbChunkListItem,
  KbChunkSource,
  KbChunkType,
  KbDocDetail,
  KbDocListItem,
  KbDocStatus,
  KbDocType,
  KbListItem,
} from "@chatai/contracts";
import type { Selectable } from "kysely";
import type {
  XyWapEmbedAgentKb,
  XyWapEmbedAgentKbChunk,
  XyWapEmbedAgentKbDoc,
} from "../../db/schema.js";
import { normalizeMediaAssetUrl, parseJsonRecord } from "../chat/workbench-content-utils.js";
import { parseKbChunkContent, type ParsedKbChunkContent } from "./kb-chunk-content-parser.js";
import { KB_DOC_TYPE_ATTACHMENT } from "./kb-attachment.constants.js";
import {
  KB_DOC_TYPE_BLANK_DOCUMENT,
  KB_DOC_TYPE_BLANK_FAQ,
  KB_DOC_TYPE_DOCUMENT,
  KB_DOC_TYPE_FAQ,
  KB_DOC_TYPE_IMAGE,
} from "./kb-doc-type.constants.js";

export { KB_DOC_TYPE_ATTACHMENT };

const KB_CHUNK_SOURCE_MANUAL = 1;
const KB_CHUNK_SOURCE_SYSTEM = 2;
const KB_CHUNK_SOURCE_SIDEBAR = 3;

export const KB_DOC_DB_SYNC_STATUS_QUEUED = 2;
export const KB_DOC_DB_SYNC_STATUS_FAILED = 1;

const SYNC_STATUS_QUEUED = new Set([-1, KB_DOC_DB_SYNC_STATUS_QUEUED]);
const SYNC_STATUS_COMPLETED = 0;
const SYNC_STATUS_FAILED = KB_DOC_DB_SYNC_STATUS_FAILED;
const SYNC_STATUS_PARSING = new Set([3, 5, 6]);

const STATUS_MESSAGE_MAX_LENGTH = 200;

type KbListRow = Pick<
  Selectable<XyWapEmbedAgentKb>,
  "create_time" | "id" | "name" | "remark" | "update_time"
>;

type KbDocListRow = Pick<
  Selectable<XyWapEmbedAgentKbDoc>,
  | "brief_summary"
  | "create_time"
  | "doc_size"
  | "doc_suffix"
  | "doc_type"
  | "id"
  | "kb_id"
  | "name"
  | "point_num"
  | "remark"
  | "sync_error_msg"
  | "sync_status"
  | "update_time"
> & {
  has_doc_summary?: number | string | boolean | null;
};

type KbDocDetailRow = KbDocListRow &
  Pick<Selectable<XyWapEmbedAgentKbDoc>, "doc_summary" | "doc_url" | "volc_doc_id">;

export function mapKbListItem(row: KbListRow): KbListItem {
  return {
    createdAt: toIsoString(row.create_time),
    description: row.remark ?? "",
    kbId: String(row.id),
    name: row.name,
    updatedAt: toIsoString(row.update_time),
  };
}

export function mapKbDocListItem(row: KbDocListRow): KbDocListItem {
  const status = mapSyncStatus(row.sync_status);
  const statusMessage = truncateStatusMessage(row.sync_error_msg);

  return {
    briefSummary: normalizeOptionalText(row.brief_summary),
    createdAt: toIsoString(row.create_time),
    description: row.remark ?? undefined,
    docId: String(row.id),
    docSize: Number(row.doc_size ?? 0),
    docSuffix: row.doc_suffix,
    hasDocSummary: Boolean(Number(row.has_doc_summary ?? 0)),
    docType: mapDocType(row.doc_type),
    kbId: String(row.kb_id),
    name: row.name,
    sliceCount: row.point_num,
    status,
    statusMessage: status === "failed" ? statusMessage : undefined,
    updatedAt: toIsoString(row.update_time),
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

export function mapKbDocDetail(row: KbDocDetailRow): KbDocDetail {
  const docType = mapDocType(row.doc_type);

  return {
    ...mapKbDocListItem(row),
    docSummary: normalizeOptionalText(row.doc_summary),
    hasDocSummary: Boolean(normalizeOptionalText(row.doc_summary)),
    previewImageUrl:
      docType === "image" ? normalizeOptionalText(normalizeMediaAssetUrl(row.doc_url)) : undefined,
    volcDocId: row.volc_doc_id ?? undefined,
  };
}

export function mapKbChunkListItem(
  row: Selectable<XyWapEmbedAgentKbChunk>,
  docType: KbDocType,
): KbChunkListItem {
  const parsedContent = parseKbChunkContent(row.content);
  const rawContent = row.content?.trim() ?? "";
  const rawIsJson = Boolean(parseJsonRecord(rawContent));
  const chunkType = resolveKbChunkType(parsedContent, row.type, docType);
  const source = mapChunkSource(row.source);
  const imageUrls = resolveKbChunkImageUrls(row, chunkType, docType, parsedContent, rawIsJson);
  const content = resolveKbChunkContent(row, docType, parsedContent, rawIsJson);
  const description = row.description?.trim() || undefined;

  return {
    chunkId: String(row.id),
    chunkType,
    content,
    createdAt: toIsoString(row.create_time),
    description: docType === "image" ? (description ?? (content || undefined)) : description,
    docId: String(row.doc_id),
    imageUrls,
    kbId: String(row.kb_id),
    source,
    title: row.title?.trim() || parsedContent.title || undefined,
    updatedAt: toIsoString(row.update_time),
  };
}

type KbChunkContentRow = {
  content: string | null;
  description?: string | null;
};

export function resolveKbChunkType(
  parsedContent: ParsedKbChunkContent,
  rowType: number | string,
  docType: KbDocType,
): KbChunkType {
  if (docType === "image") {
    return "image";
  }

  if (parsedContent.chunkType) {
    return normalizeChunkType(parsedContent.chunkType, docType);
  }

  return normalizeChunkType(rowType, docType);
}

export function resolveKbChunkImageUrls(
  row: KbChunkContentRow,
  chunkType: KbChunkType,
  docType: KbDocType,
  parsedContent: ParsedKbChunkContent,
  rawIsJson: boolean,
) {
  if (parsedContent.imageUrls.length > 0) {
    return parsedContent.imageUrls;
  }

  if (chunkType !== "image" && docType !== "image") {
    return undefined;
  }

  const rawContent = row.content?.trim() ?? "";

  if (!rawContent || rawIsJson) {
    return undefined;
  }

  const normalizedUrl = normalizeMediaAssetUrl(rawContent);

  return normalizedUrl ? [normalizedUrl] : undefined;
}

export function resolveKbChunkContent(
  row: KbChunkContentRow,
  docType: KbDocType,
  parsedContent: ParsedKbChunkContent,
  rawIsJson: boolean,
) {
  if (docType === "image") {
    if (rawIsJson && parsedContent.content) {
      return parsedContent.content;
    }

    const description = row.description?.trim();

    if (description) {
      return description;
    }

    return parsedContent.content;
  }

  return parsedContent.content;
}

export function mapDocType(docType: number): KbDocType {
  if (docType === KB_DOC_TYPE_FAQ || docType === KB_DOC_TYPE_BLANK_FAQ) {
    return "qa";
  }

  if (docType === KB_DOC_TYPE_IMAGE) {
    return "image";
  }

  if (docType === KB_DOC_TYPE_ATTACHMENT) {
    return "attachment";
  }

  if (docType === KB_DOC_TYPE_DOCUMENT || docType === KB_DOC_TYPE_BLANK_DOCUMENT) {
    return "document";
  }

  return "document";
}

export function mapDocTypeToDb(docType: KbDocType): number {
  if (docType === "qa") {
    return KB_DOC_TYPE_FAQ;
  }

  if (docType === "image") {
    return KB_DOC_TYPE_IMAGE;
  }

  if (docType === "attachment") {
    return KB_DOC_TYPE_ATTACHMENT;
  }

  return KB_DOC_TYPE_DOCUMENT;
}

export function mapDocTypeFilterValues(docType: KbDocType): number[] {
  if (docType === "qa") {
    return [KB_DOC_TYPE_FAQ, KB_DOC_TYPE_BLANK_FAQ];
  }

  if (docType === "document") {
    return [KB_DOC_TYPE_DOCUMENT, KB_DOC_TYPE_BLANK_DOCUMENT];
  }

  return [mapDocTypeToDb(docType)];
}

export function mapSyncStatus(syncStatus: number): KbDocStatus {
  if (syncStatus === SYNC_STATUS_COMPLETED) {
    return "completed";
  }

  if (syncStatus === SYNC_STATUS_FAILED) {
    return "failed";
  }

  if (SYNC_STATUS_QUEUED.has(syncStatus)) {
    return "queued";
  }

  if (SYNC_STATUS_PARSING.has(syncStatus)) {
    return "parsing";
  }

  return "queued";
}

export function mapChunkSource(source: number): KbChunkSource {
  if (source === KB_CHUNK_SOURCE_MANUAL) {
    return "manual";
  }

  if (source === KB_CHUNK_SOURCE_SIDEBAR) {
    return "sidebar";
  }

  return "system";
}

export function normalizeChunkType(rawType: number | string, docType: KbDocType): KbChunkType {
  if (typeof rawType === "number") {
    if (rawType === 1) {
      return "faq";
    }

    if (rawType === 3) {
      return "image";
    }

    return "text";
  }

  if (typeof rawType === "string") {
    const normalized = rawType.trim().toLowerCase();

    if (normalized === "faq") {
      return "faq";
    }

    if (normalized === "image" || normalized === "doc-image") {
      return "image";
    }

    if (normalized === "text") {
      return "text";
    }
  }

  if (docType === "qa") {
    return "faq";
  }

  if (docType === "image") {
    return "image";
  }

  return "text";
}

function truncateStatusMessage(message: string | null | undefined) {
  if (!message?.trim()) {
    return undefined;
  }

  const trimmed = message.trim();

  if (trimmed.length <= STATUS_MESSAGE_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, STATUS_MESSAGE_MAX_LENGTH)}…`;
}

function toIsoString(value: Date | number | string | null | undefined) {
  if (value == null) {
    return new Date(0).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  // Database DATETIME timezone semantics are handled by mysql2 at the connection layer.
  // String inputs here are only a generic non-DB fallback.
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toISOString();
}
