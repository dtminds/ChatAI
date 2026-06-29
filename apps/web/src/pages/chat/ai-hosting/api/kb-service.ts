import type {
  ApiSuccessEnvelope,
  KbChunkListItem,
  KbChunkListResponse,
  KbCreateRequest,
  KbCreateResponse,
  KbDocDetail,
  KbDocListItem,
  KbDocListResponse,
  KbDocType,
  KbListItem,
  KbListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";
import { buildMediaAssetUrl } from "@/lib/media-asset-url";
import type {
  KbDocChunkViewItem,
  KbDocType as KbDocViewType,
  KbDocViewItem,
  KbListViewItem,
  KbStatus,
} from "@/pages/chat/ai-hosting/kb-types";

export type ListKbsParams = {
  page?: number;
  pageSize?: number;
  query?: string;
};

export type ListKbDocsParams = {
  docType?: KbDocType;
  page?: number;
  pageSize?: number;
  query?: string;
};

export type ListKbDocChunksParams = {
  page?: number;
  pageSize?: number;
  title?: string;
};

export async function listKbs(params: ListKbsParams = {}) {
  const response = await http.get<ApiSuccessEnvelope<KbListResponse>>(
    `/server/ai-hosting/kbs${buildQueryString(params)}`,
  );

  return response.data;
}

export async function createKb(payload: KbCreateRequest) {
  const response = await http.post<ApiSuccessEnvelope<KbCreateResponse>>(
    "/server/ai-hosting/kbs",
    payload,
  );

  return response.data;
}

export async function getKb(kbId: string) {
  const response = await http.get<ApiSuccessEnvelope<KbListItem>>(
    `/server/ai-hosting/kbs/${kbId}`,
  );

  return response.data;
}

export async function listKbDocs(kbId: string, params: ListKbDocsParams = {}) {
  const response = await http.get<ApiSuccessEnvelope<KbDocListResponse>>(
    `/server/ai-hosting/kbs/${kbId}/docs${buildQueryString(params)}`,
  );

  return response.data;
}

export async function getKbDoc(docId: string) {
  const response = await http.get<ApiSuccessEnvelope<KbDocDetail>>(
    `/server/ai-hosting/kb-docs/${docId}`,
  );

  return response.data;
}

export async function listKbDocChunks(docId: string, params: ListKbDocChunksParams = {}) {
  const response = await http.get<ApiSuccessEnvelope<KbChunkListResponse>>(
    `/server/ai-hosting/kb-docs/${docId}/chunks${buildQueryString(params)}`,
  );

  return response.data;
}

export function toKbListViewItem(item: KbListItem): KbListViewItem {
  return {
    createdAt: formatDisplayTime(item.createdAt),
    description: item.description,
    id: item.kbId,
    lastUpdatedAt: formatDisplayTime(item.updatedAt),
    name: item.name,
  };
}

export function toKbDocViewItem(item: KbDocListItem): KbDocViewItem {
  return {
    createdAt: formatDisplayTime(item.createdAt),
    docUrl: item.docUrl,
    fileExtension: item.docSuffix,
    id: item.docId,
    kbId: item.kbId,
    name: item.name,
    sliceCount: item.sliceCount,
    status: item.status as KbStatus,
    type: item.docType as KbDocViewType,
    typeLabel: getDocTypeLabel(item.docType, item.docSuffix),
    updatedAt: formatDisplayTime(item.updatedAt),
  };
}

export function toKbDocChunkViewItem(
  item: KbChunkListItem,
  docType: KbDocViewType,
  options?: { docUrl?: string },
): KbDocChunkViewItem {
  const imageUrls = resolveKbDocChunkImageUrls(item.imageUrls, docType, options?.docUrl);
  const chunk: KbDocChunkViewItem = {
    createdAt: formatDisplayTime(item.createdAt),
    docId: item.docId,
    id: item.chunkId,
    imageUrls,
    kbId: item.kbId,
    source: item.source,
    type: docType,
    updatedAt: formatDisplayTime(item.updatedAt),
  };

  if (docType === "qa") {
    chunk.question = item.title ?? "";
    chunk.answer = item.content;
    return chunk;
  }

  chunk.title = item.title ?? "";
  chunk.content = item.content;
  return chunk;
}

export function resolveKbDocImageUrl(docUrl: string) {
  const normalizedDocUrl = docUrl.trim();

  if (!normalizedDocUrl) {
    return "";
  }

  if (/^https?:\/\//iu.test(normalizedDocUrl)) {
    return normalizedDocUrl;
  }

  return buildMediaAssetUrl(normalizedDocUrl);
}

function resolveKbDocChunkImageUrls(
  imageUrls: string[] | undefined,
  docType: KbDocViewType,
  docUrl?: string,
) {
  if (imageUrls?.length) {
    return imageUrls;
  }

  if (docType !== "image" || !docUrl?.trim()) {
    return undefined;
  }

  const normalizedDocUrl = docUrl.trim();

  if (/^https?:\/\//iu.test(normalizedDocUrl)) {
    return [normalizedDocUrl];
  }

  return [buildMediaAssetUrl(normalizedDocUrl)];
}

function buildQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
}

function formatDisplayTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${lookup("year")}-${lookup("month")}-${lookup("day")} ${lookup("hour")}:${lookup("minute")}:${lookup("second")}`;
}

function getDocTypeLabel(docType: KbDocType, docSuffix: string) {
  if (docType === "qa") {
    return "FAQ";
  }

  const normalizedSuffix = docSuffix.toLowerCase();

  if (docType === "image") {
    return `图片（.${normalizedSuffix}）`;
  }

  if (normalizedSuffix === "txt" || normalizedSuffix === "md") {
    return "纯文本";
  }

  return `文件（.${normalizedSuffix}）`;
}
