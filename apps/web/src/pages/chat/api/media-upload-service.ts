import COS from "cos-js-sdk-v5";
import { getUploadCredential } from "@/pages/chat/api/workbench-gateway";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import type { WorkbenchUploadCredentialResponse } from "@chatai/contracts";

const DEFAULT_IMAGE_UPLOAD_PREFIX = "chat-images/";
const DEFAULT_IMAGE_EXTENSION = "bin";
const MEDIA_ASSET_BASE_URL = "https://b5.bokr.com.cn";
const UPLOAD_SLICE_SIZE = 1024 * 1024;

export async function resolveImageSegmentsForSend(
  conversationId: string,
  segments: ComposerSegment[],
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

    uploads.set(segment, {
      alt: segment.alt,
      fileId: key,
      height: segment.height,
      type: "image",
      url: buildObjectUrl(key),
      width: segment.width,
    });
  }));

  return segments.map((segment) => uploads.get(segment) ?? segment);
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
    credential.allowPerfixs[0] ?? DEFAULT_IMAGE_UPLOAD_PREFIX,
  );
  const extension = getImageExtension(contentType);
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}${Date.now()}-${randomPart}.${extension}`;
}

function normalizeUploadPrefix(prefix: string) {
  const normalizedPrefix = prefix
    .trim()
    .replace(/^\/+/, "")
    .replace(/\*+$/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/");

  if (!normalizedPrefix) {
    return DEFAULT_IMAGE_UPLOAD_PREFIX;
  }

  return `${normalizedPrefix}/`;
}

function getImageExtension(contentType: string) {
  const [, rawSubtype] = contentType.split("/");
  const subtype = rawSubtype?.split(";")[0]?.trim().toLowerCase();

  if (!subtype) {
    return DEFAULT_IMAGE_EXTENSION;
  }

  if (subtype === "jpeg") {
    return "jpg";
  }

  if (subtype.includes("+")) {
    return subtype.split("+")[0] || DEFAULT_IMAGE_EXTENSION;
  }

  return subtype.replace(/[^a-z0-9]/g, "") || DEFAULT_IMAGE_EXTENSION;
}

function buildObjectUrl(key: string) {
  return `${MEDIA_ASSET_BASE_URL}/${encodeCosKey(key)}`;
}

function encodeCosKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}
