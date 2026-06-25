import {
  normalizeMediaAssetUrl,
  parseJsonRecord,
  readRecordString,
} from "../chat/workbench-content-utils.js";

export type ParsedKbChunkContent = {
  chunkType?: string;
  content: string;
  imageUrls: string[];
  title?: string;
};

export function parseKbChunkContent(
  rawContent: string | null | undefined,
): ParsedKbChunkContent {
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
    content: readRecordString(parsed, "content") ?? "",
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
