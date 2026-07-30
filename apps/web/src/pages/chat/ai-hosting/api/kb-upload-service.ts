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
import {
  buildCosUploadObjectKey,
  normalizeCosUploadPrefix,
  resolveImageUploadExtension,
} from "@/pages/chat/lib/cos-upload-key";

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
  const extension = resolveImageUploadExtension(file.type);

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

  return buildCosUploadObjectKey(prefix, extension);
}

function resolveUploadPrefix(credential: KbDocUploadCredentialResponse) {
  const prefix = credential.allowPerfixs?.[0];

  if (!prefix?.trim()) {
    throw new Error("获取文件上传凭证失败：缺少允许路径");
  }

  return normalizeUploadPrefix(prefix);
}

function normalizeUploadPrefix(prefix: string) {
  return normalizeCosUploadPrefix(prefix);
}

function getKbQaUploadExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".faq.xlsx")) {
    return "faq.xlsx";
  }

  return getFileExtension(fileName).toLowerCase() || DEFAULT_FALLBACK_EXTENSION;
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
