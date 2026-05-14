import COS from "cos-js-sdk-v5";
import { getUploadCredential } from "@/pages/chat/api/workbench-gateway";
import type {
  ComposerFileSegment,
  ComposerSegment,
} from "@/pages/chat/lib/composer-segments";
import type { WorkbenchUploadCredentialResponse } from "@chatai/contracts";

const DEFAULT_IMAGE_UPLOAD_PREFIX = "chat-images/";
const DEFAULT_FILE_UPLOAD_PREFIX = "chat-files/";
const DEFAULT_FALLBACK_EXTENSION = "bin";
const MEDIA_ASSET_BASE_URL = "https://b5.bokr.com.cn";
const UPLOAD_SLICE_SIZE = 1024 * 1024;

export async function resolveImageSegmentsForSend(
  conversationId: string,
  segments: ComposerSegment[],
  options: {
    onImageUploaded?: (payload: {
      nextSegment: ComposerSegment;
      previousSegment: ComposerSegment;
    }) => void;
  } = {},
): Promise<ComposerSegment[]> {
  const localImageSegments = segments.filter(isLocalImageSegment);

  if (localImageSegments.length === 0) {
    return segments;
  }

  const credential = await getUploadCredential(conversationId);
  const cos = createCosClient(credential);
  const uploads = new Map<ComposerSegment, ComposerSegment>();

  await Promise.all(localImageSegments.map(async (segment) => {
    if (segment.type !== "image" || !segment.localUrl) {
      return;
    }

    const blob = await dataUrlToBlob(segment.localUrl);
    const key = buildImageObjectKey({
      credential,
      contentType: blob.type,
    });
    await cos.uploadFile({
      Body: blob,
      Bucket: credential.bucket,
      ContentType: blob.type || undefined,
      Key: key,
      Region: credential.region,
      SliceSize: UPLOAD_SLICE_SIZE,
    });

    const nextSegment: ComposerSegment = {
      alt: segment.alt,
      fileId: key,
      height: segment.height,
      type: "image",
      url: buildObjectUrl(key),
      width: segment.width,
    };

    uploads.set(segment, nextSegment);
    options.onImageUploaded?.({
      nextSegment: {
        ...nextSegment,
        clientId: segment.clientId,
        localUrl: segment.localUrl,
      },
      previousSegment: segment,
    });
  }));

  return segments.map((segment) => uploads.get(segment) ?? segment);
}

export async function uploadWorkbenchFile(
  conversationId: string,
  file: File,
  options: {
    onProgress?: (progress: number) => void;
  } = {},
): Promise<ComposerFileSegment> {
  const credential = await getUploadCredential(conversationId);
  const cos = createCosClient(credential);
  const extension = getFileExtension(file.name) || DEFAULT_FALLBACK_EXTENSION;
  const key = buildFileObjectKey({
    credential,
    extension,
  });

  await cos.uploadFile({
    Body: file,
    Bucket: credential.bucket,
    ContentType: file.type || undefined,
    Key: key,
    Region: credential.region,
    SliceSize: UPLOAD_SLICE_SIZE,
    onProgress(progressData) {
      options.onProgress?.(Math.round((progressData.percent ?? 0) * 100));
    },
  });

  options.onProgress?.(100);

  return {
    extension,
    fileId: key,
    fileName: file.name,
    fileSize: file.size,
    fileSizeLabel: formatFileSize(file.size),
    type: "file",
    url: buildObjectUrl(key),
  };
}

function isLocalImageSegment(segment: ComposerSegment) {
  if (segment.type !== "image" || !segment.localUrl) {
    return false;
  }

  return !segment.url || segment.url === segment.localUrl || isLocalPreviewUrl(segment.url);
}

function isLocalPreviewUrl(url: string) {
  return url.startsWith("data:") || url.startsWith("blob:");
}

function createCosClient(credential: WorkbenchUploadCredentialResponse) {
  return new COS({
    ExpiredTime: credential.expiredTime,
    SecretId: credential.credentials.tmpSecretId,
    SecretKey: credential.credentials.tmpSecretKey,
    SecurityToken:
      credential.credentials.sessionToken || credential.credentials.token,
    StartTime: credential.startTime,
  });
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error("图片读取失败");
  }

  return response.blob();
}

function buildImageObjectKey({
  contentType,
  credential,
}: {
  contentType: string;
  credential: WorkbenchUploadCredentialResponse;
}) {
  const prefix = normalizeUploadPrefix(
    getAllowedUploadPrefixes(credential)[0] ?? DEFAULT_IMAGE_UPLOAD_PREFIX,
  );
  const extension = getImageExtension(contentType);
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}${Date.now()}-${randomPart}.${extension}`;
}

function buildFileObjectKey({
  credential,
  extension,
}: {
  credential: WorkbenchUploadCredentialResponse;
  extension: string;
}) {
  const prefix = normalizeUploadPrefix(
    getAllowedUploadPrefixes(credential)[0] ?? DEFAULT_FILE_UPLOAD_PREFIX,
    DEFAULT_FILE_UPLOAD_PREFIX,
  );
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}${Date.now()}-${randomPart}.${extension}`;
}

function normalizeUploadPrefix(
  prefix: string,
  fallbackPrefix = DEFAULT_IMAGE_UPLOAD_PREFIX,
) {
  const normalizedPrefix = prefix
    .trim()
    .replace(/^\/+/, "")
    .replace(/\*+$/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/");

  if (!normalizedPrefix) {
    return fallbackPrefix;
  }

  return `${normalizedPrefix}/`;
}

function getImageExtension(contentType: string) {
  const [, rawSubtype] = contentType.split("/");
  const subtype = rawSubtype?.split(";")[0]?.trim().toLowerCase();

  if (!subtype) {
    return DEFAULT_FALLBACK_EXTENSION;
  }

  if (subtype === "jpeg") {
    return "jpg";
  }

  if (subtype.includes("+")) {
    return subtype.split("+")[0] || DEFAULT_FALLBACK_EXTENSION;
  }

  return subtype.replace(/[^a-z0-9]/g, "") || DEFAULT_FALLBACK_EXTENSION;
}

function buildObjectUrl(key: string) {
  return `${MEDIA_ASSET_BASE_URL}/${encodeCosKey(key)}`;
}

function encodeCosKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();

  return extension && extension !== fileName.toLowerCase() ? extension : "";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${formatFileSizeUnit(bytes / 1024)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${formatFileSizeUnit(bytes / (1024 * 1024))} MB`;
  }

  return `${formatFileSizeUnit(bytes / (1024 * 1024 * 1024))} GB`;
}

function formatFileSizeUnit(value: number) {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function getAllowedUploadPrefixes(credential: WorkbenchUploadCredentialResponse) {
  return credential.allowPerfixs;
}
