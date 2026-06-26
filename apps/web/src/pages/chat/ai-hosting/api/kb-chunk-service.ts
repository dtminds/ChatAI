import type {
  ApiSuccessEnvelope,
  KbChunkCreateRequest,
  KbChunkCreateResponse,
  KbChunkDeleteResponse,
  KbChunkUpdateRequest,
  KbChunkUpdateResponse,
} from "@chatai/contracts";
import { request } from "@/lib/request";

export async function createKbChunk(payload: KbChunkCreateRequest) {
  const response = await request<ApiSuccessEnvelope<KbChunkCreateResponse>>({
    data: payload,
    method: "POST",
    url: "/server/ai-hosting/kb-chunks",
  });

  return response.data;
}

export async function updateKbChunk(chunkId: string, payload: KbChunkUpdateRequest) {
  const response = await request<ApiSuccessEnvelope<KbChunkUpdateResponse>>({
    data: payload,
    method: "POST",
    url: `/server/ai-hosting/kb-chunks/${chunkId}/update`,
  });

  return response.data;
}

export async function deleteKbChunk(chunkId: string) {
  const response = await request<ApiSuccessEnvelope<KbChunkDeleteResponse>>({
    method: "POST",
    url: `/server/ai-hosting/kb-chunks/${chunkId}/delete`,
  });

  return response.data;
}
