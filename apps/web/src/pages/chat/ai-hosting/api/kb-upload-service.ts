import type {
  ApiSuccessEnvelope,
  KbDocUploadCredentialResponse,
} from "@chatai/contracts";
import { buildMediaAssetUrl } from "@/lib/media-asset-url";
import { request } from "@/lib/request";
import { getFileExtension } from "@/pages/chat/ai-hosting/kb-components/shared";
import {
  createCosClient,
  uploadCosFile,
} from "@/pages/chat/lib/cos-upload-runtime";

const DEFAULT_FALLBACK_EXTENSION = "bin";
export type KbCosUploadResult = {
  docUrl: string;
  url: string;
};

export async function uploadKbDocFileToCos(
  file: File,
  options: KbCosUploadOptions = {},
): Promise<KbCosUploadResult> {
  const extension =
    getFileExtension(file.name).toLowerCase() || DEFAULT_FALLBACK_EXTENSION;

  return uploadFileToCos(file, extension, options);
}

export async function uploadKbImageToCos(
  file: File,
  options: KbCosUploadOptions = {},
): Promise<KbCosUploadResult> {
  const extension = getImageExtension(file.type) || DEFAULT_FALLBACK_EXTENSION;

  return uploadFileToCos(file, extension, options);
}

export async function uploadKbQaFileToCos(
  file: File,
  options: KbCosUploadOptions = {},
): Promise<KbCosUploadResult> {
  const extension = getKbQaUploadExtension(file.name);

  return uploadFileToCos(file, extension, options);
}

type KbCosUploadOptions = {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

async function uploadFileToCos(
  file: File,
  extension: string,
  options: KbCosUploadOptions,
): Promise<KbCosUploadResult> {
  const credential = await fetchKbDocUploadCredential();
  const cos = await createCosClient(credential);
  const key = buildObjectKey({
    credential,
    extension,
  });
  await uploadCosFile({
    body: file,
    contentType: file.type,
    cos,
    credential,
    key,
    onProgress: options.onProgress,
    signal: options.signal,
  });

  return {
    docUrl: key,
    url: buildObjectUrl(key),
  };
}

function buildObjectKey({
  credential,
  extension,
}: {
  credential: KbDocUploadCredentialResponse;
  extension: string;
}) {
  const prefix = resolveUploadPrefix(credential);
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${prefix}${Date.now()}-${randomPart}.${extension}`;
}

function resolveUploadPrefix(credential: KbDocUploadCredentialResponse) {
  const prefix = credential.allowPerfixs?.[0];

  if (!prefix?.trim()) {
    throw new Error("获取文件上传凭证失败：缺少允许路径");
  }

  return normalizeUploadPrefix(prefix);
}

function normalizeUploadPrefix(prefix: string) {
  const normalizedPrefix = prefix
    .trim()
    .replace(/^\/+/, "")
    .replace(/\*+$/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/");

  return `${normalizedPrefix}/`;
}

function getKbQaUploadExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".faq.xlsx")) {
    return "faq.xlsx";
  }

  return getFileExtension(fileName).toLowerCase() || DEFAULT_FALLBACK_EXTENSION;
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
  return buildMediaAssetUrl(key);
}

async function fetchKbDocUploadCredential() {
  const response = await request<ApiSuccessEnvelope<KbDocUploadCredentialResponse>>({
    method: "POST",
    url: "/server/ai-hosting/kb-docs/upload-credential",
  });

  return response.data;
}
