import type {
  ApiSuccessEnvelope,
  KbDocChunkParams,
  KbDocChunkStrategy,
  KbDocCreateRequest,
  KbDocCreateResponse,
  KbDocParseMode,
  KbDocUploadCredentialResponse,
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
export { uploadKbImageToCos } from "@/pages/chat/ai-hosting/api/kb-upload-service";

export async function getKbDocUploadCredential() {
  const response = await request<ApiSuccessEnvelope<KbDocUploadCredentialResponse>>({
    method: "POST",
    url: "/server/ai-hosting/kb-docs/upload-credential",
  });

  return response.data;
}

export async function createKbDoc(payload: KbDocCreateRequest) {
  const response = await request<ApiSuccessEnvelope<KbDocCreateResponse>>({
    data: payload,
    method: "POST",
    url: "/server/ai-hosting/kb-docs/create",
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
}) {
  const uploadResult = await uploadKbDocFile(input.file);

  return createKbDoc(
    buildKbDocCreateRequest({
      ...input,
      docUrl: uploadResult.docUrl,
    }),
  );
}
