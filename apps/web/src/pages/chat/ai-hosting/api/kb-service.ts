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
  content?: string;
  docType: KbDocType;
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

export async function listKbDocChunks(docId: string, params: ListKbDocChunksParams) {
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

export function toKbDocViewItem(item: KbDocDetail | KbDocListItem): KbDocViewItem {
  const nameWithExtension = getDocNameWithExtension(item.name, item.docSuffix);

  return {
    briefSummary: item.briefSummary,
    createdAt: formatDisplayTime(item.createdAt),
    docSummary: "docSummary" in item ? item.docSummary : undefined,
    fileSize: formatKbDocSize(item.docSize),
    fileExtension: item.docSuffix,
    hasDocSummary: item.hasDocSummary,
    id: item.docId,
    kbId: item.kbId,
    name: item.name,
    nameWithExtension,
    previewImageUrl: "previewImageUrl" in item ? item.previewImageUrl : undefined,
    sliceCount: item.sliceCount,
    status: item.status as KbStatus,
    type: item.docType as KbDocViewType,
    typeLabel: getDocTypeLabel(item.docType, item.docSuffix),
    updatedAt: formatDisplayTime(item.updatedAt),
  };
}

function getDocNameWithExtension(name: string, docSuffix: string) {
  const normalizedName = name.trim();
  const normalizedSuffix = docSuffix.trim().replace(/^\./u, "");

  if (!normalizedName || !normalizedSuffix) {
    return normalizedName || name;
  }

  if (normalizedName.toLowerCase().endsWith(`.${normalizedSuffix.toLowerCase()}`)) {
    return normalizedName;
  }

  const suffixParts = normalizedSuffix.split(".");
  if (
    suffixParts.length > 1
    && normalizedName.toLowerCase().endsWith(`.${suffixParts[0].toLowerCase()}`)
  ) {
    return `${normalizedName}.${suffixParts.slice(1).join(".")}`;
  }

  return `${normalizedName}.${normalizedSuffix}`;
}

function formatKbDocSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "-";
  }

  if (size < 1024) {
    return `${Math.round(size)}B`;
  }

  const kb = size / 1024;

  if (kb < 1024) {
    return `${formatKbDocSizeNumber(kb)}KB`;
  }

  const mb = kb / 1024;

  if (mb < 1024) {
    return `${formatKbDocSizeNumber(mb)}MB`;
  }

  return `${formatKbDocSizeNumber(mb / 1024)}GB`;
}

function formatKbDocSizeNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function toKbDocChunkViewItem(
  item: KbChunkListItem,
  docType: KbDocViewType,
): KbDocChunkViewItem {
  const imageUrls = resolveKbDocChunkImageUrls(item.imageUrls);
  const displayParts = resolveVolcChunkDisplayParts(item.volcChunkId);
  const chunk: KbDocChunkViewItem = {
    createdAt: formatDisplayTime(item.createdAt),
    displayChunkId: displayParts?.displayChunkId,
    docId: item.docId,
    id: item.chunkId,
    imageUrls,
    kbId: item.kbId,
    source: item.source,
    type: docType,
    updatedAt: formatDisplayTime(item.updatedAt),
    volcChunkId: item.volcChunkId,
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

function resolveVolcChunkDisplayParts(volcChunkId?: string) {
  const tail = volcChunkId?.split("_").pop()?.trim();

  if (!tail) {
    return undefined;
  }

  return {
    displayChunkId: tail,
  };
}

function resolveKbDocChunkImageUrls(imageUrls: string[] | undefined) {
  if (imageUrls?.length) {
    return imageUrls;
  }

  return undefined;
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
  const naiveDatetime = value.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/,
  );

  if (naiveDatetime) {
    return `${naiveDatetime[1]} ${naiveDatetime[2]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
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
