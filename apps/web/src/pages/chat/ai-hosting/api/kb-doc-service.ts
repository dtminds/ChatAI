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
  getFileExtension,
  stripFileExtension,
} from "@/pages/chat/ai-hosting/kb-components/shared";

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

export async function uploadKbDocFile(file: File, kbId: string) {
  await getKbDocUploadCredential();

  // TOS 直传尚未接入；先 mock 上传结果，仅用于前后端联调。
  const docSuffix = getFileExtension(file.name).toLowerCase();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return `mock://kb-docs/${kbId}/${token}.${docSuffix}`;
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
  const docUrl = await uploadKbDocFile(input.file, input.kbId);

  return createKbDoc(
    buildKbDocCreateRequest({
      ...input,
      docUrl,
    }),
  );
}
