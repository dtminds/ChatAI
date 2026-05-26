import type {
  WorkbenchAttachmentDto,
  WorkbenchSmartReplyAttachmentsResponse,
} from "@chatai/contracts";

type JavaAttachmentItem = {
  appId?: string;
  appInfo?: {
    appOriginId?: string;
    appPath?: string;
    appid?: string;
    headImg?: string;
    nickName?: string;
  };
  content?: string;
  coverUrl?: string;
  fileContentType?: string;
  fileDuration?: string;
  fileHeight?: number | string;
  fileLength?: number | string;
  fileName?: string;
  fileType?: number | string;
  fileWidth?: number | string;
  id?: number | string;
  jumpUrl?: string;
  localPath?: string;
  slocalPath?: string;
  textContent?: string;
};

export function normalizeAttachmentIds(ids: string[]) {
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const id of ids) {
    const trimmed = id.trim();

    if (!/^\d+$/.test(trimmed)) {
      continue;
    }

    const numeric = Number.parseInt(trimmed, 10);

    if (!Number.isSafeInteger(numeric) || numeric <= 0 || seen.has(numeric)) {
      continue;
    }

    seen.add(numeric);
    normalized.push(numeric);
  }

  return normalized;
}

export function mapJavaAttachmentList(data: unknown): WorkbenchSmartReplyAttachmentsResponse {
  const items = extractJavaAttachmentItems(data);
  const attachments: WorkbenchAttachmentDto[] = [];

  for (const item of items) {
    const mapped = mapJavaAttachmentItem(item);

    if (mapped) {
      attachments.push(mapped);
    }
  }

  return { attachments };
}

function extractJavaAttachmentItems(data: unknown): JavaAttachmentItem[] {
  if (Array.isArray(data)) {
    return data.filter(isJavaAttachmentItem);
  }

  if (!isRecord(data)) {
    return [];
  }

  const listCandidates = [data.list, data.items, data.records, data.attachments];

  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isJavaAttachmentItem);
    }
  }

  if (isJavaAttachmentItem(data)) {
    return [data];
  }

  return [];
}

function mapJavaAttachmentItem(item: JavaAttachmentItem): WorkbenchAttachmentDto | undefined {
  const id = readPositiveInteger(item.id);

  if (id == null) {
    return undefined;
  }

  return {
    appId: readString(item.appId),
    appInfo: item.appInfo
      ? {
          appOriginId: readString(item.appInfo.appOriginId),
          appPath: readString(item.appInfo.appPath),
          appid: readString(item.appInfo.appid),
          headImg: readString(item.appInfo.headImg),
          nickName: readString(item.appInfo.nickName),
        }
      : undefined,
    content: readString(item.content),
    coverUrl: readString(item.coverUrl),
    fileContentType: readString(item.fileContentType),
    fileDuration: readString(item.fileDuration),
    fileHeight: readPositiveInteger(item.fileHeight),
    fileLength: readPositiveInteger(item.fileLength),
    fileName: readString(item.fileName),
    fileType: readPositiveInteger(item.fileType),
    fileWidth: readPositiveInteger(item.fileWidth),
    id,
    jumpUrl: readString(item.jumpUrl),
    localPath: readString(item.localPath),
    slocalPath: readString(item.slocalPath),
    textContent: readString(item.textContent),
  };
}

function isJavaAttachmentItem(value: unknown): value is JavaAttachmentItem {
  return isRecord(value) && value.id != null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);

    return parsed > 0 ? parsed : undefined;
  }

  return undefined;
}
