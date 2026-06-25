import type {
  ApiSuccessEnvelope,
  KbDocChunkParams,
  KbDocChunkStrategy,
  KbDocCreateFaqRequest,
  KbDocCreateImageRequest,
  KbDocCreateRequest,
  KbDocCreateResponse,
  KbDocDeleteResponse,
  KbDocParseMode,
} from "@chatai/contracts";
import { request } from "@/lib/request";
import {
  uploadKbDocFileToCos,
  uploadKbImageToCos,
  uploadKbQaFileToCos,
  type KbCosUploadResult,
} from "@/pages/chat/ai-hosting/api/kb-upload-service";
import {
  getFileExtension,
  stripFileExtension,
} from "@/pages/chat/ai-hosting/kb-components/shared";

export type { KbCosUploadResult } from "@/pages/chat/ai-hosting/api/kb-upload-service";

export async function createKbDoc(payload: KbDocCreateRequest) {
  const response = await request<ApiSuccessEnvelope<KbDocCreateResponse>>({
    data: payload,
    method: "POST",
    url: "/server/ai-hosting/kb-docs/create",
  });

  return response.data;
}

export async function createKbFaqDoc(payload: KbDocCreateFaqRequest) {
  const response = await request<ApiSuccessEnvelope<KbDocCreateResponse>>({
    data: payload,
    method: "POST",
    url: "/server/ai-hosting/kb-docs/create-faq",
  });

  return response.data;
}

export async function createKbImageDoc(payload: KbDocCreateImageRequest) {
  const response = await request<ApiSuccessEnvelope<KbDocCreateResponse>>({
    data: payload,
    method: "POST",
    url: "/server/ai-hosting/kb-docs/create-image",
  });

  return response.data;
}

export async function deleteKbDoc(docId: string) {
  const response = await request<ApiSuccessEnvelope<KbDocDeleteResponse>>({
    method: "POST",
    url: `/server/ai-hosting/kb-docs/${docId}/delete`,
  });

  return response.data;
}

export async function uploadKbDocFile(
  file: File,
  options: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<KbCosUploadResult> {
  return uploadKbDocFileToCos(file, options);
}

export async function uploadKbImage(
  file: File,
  options: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<KbCosUploadResult> {
  return uploadKbImageToCos(file, options);
}

export async function uploadKbQaFile(
  file: File,
  options: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<KbCosUploadResult> {
  return uploadKbQaFileToCos(file, options);
}

export function buildKbDocCreateRequest(input: {
  chunkParams: KbDocChunkParams;
  chunkStrategy: KbDocChunkStrategy;
  docUrl: string;
  file: File;
  kbId: string;
  parseMode: KbDocParseMode;
  description?: string;
}) {
  const docSuffix = getFileExtension(input.file.name).toLowerCase();

  return {
    chunkParams: input.chunkParams,
    chunkStrategy: input.chunkStrategy,
    description: input.description,
    docSuffix,
    docUrl: input.docUrl,
    kbId: input.kbId,
    name: stripFileExtension(input.file.name) || input.file.name,
    parseMode: input.parseMode,
  } satisfies KbDocCreateRequest;
}

export async function importKbDoc(input: {
  chunkParams: KbDocChunkParams;
  chunkStrategy: KbDocChunkStrategy;
  file: File;
  kbId: string;
  parseMode: KbDocParseMode;
  description?: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}) {
  const uploadResult = await uploadKbDocFile(input.file, {
    onProgress: input.onProgress,
    signal: input.signal,
  });

  return createKbDoc(
    buildKbDocCreateRequest({
      ...input,
      docUrl: uploadResult.docUrl,
    }),
  );
}

export async function importKbQaDoc(input: {
  file: File;
  kbId: string;
  signal?: AbortSignal;
}) {
  const uploadResult = await uploadKbQaFile(input.file, {
    signal: input.signal,
  });
  const docSuffix = getKbQaDocSuffix(input.file.name);

  return createKbFaqDoc({
    docSuffix,
    docUrl: uploadResult.docUrl,
    kbId: input.kbId,
    name: stripFileExtension(input.file.name) || input.file.name,
  });
}

export async function importKbImageDoc(input: {
  description: string;
  file: File;
  kbId: string;
  name: string;
  signal?: AbortSignal;
}) {
  const uploadResult = await uploadKbImage(input.file, {
    signal: input.signal,
  });
  const docSuffix = getFileExtension(input.file.name).toLowerCase();

  return createKbImageDoc({
    description: input.description.trim(),
    docSuffix,
    docUrl: uploadResult.docUrl,
    kbId: input.kbId,
    name: input.name.trim(),
  });
}

export function getKbQaDocSuffix(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".faq.xlsx")) {
    return "faq.xlsx";
  }

  return getFileExtension(fileName).toLowerCase();
}
