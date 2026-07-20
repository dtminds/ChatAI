import type {
  ApiSuccessEnvelope,
  KbAttachmentBatchDeleteResponse,
  KbAttachmentCreateRequest,
  KbAttachmentCreateResponse,
  KbAttachmentDeleteResponse,
  KbAttachmentImageMaterialCreateResponse,
  KbAttachmentInitResponse,
  KbAttachmentListResponse,
  KbAttachmentStatusResponse,
  KbAttachmentType,
  KbAttachmentUpdateRequest,
  KbAttachmentUpdateResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";
import type { QuickReplyDraftAttachment } from "@/pages/chat/components/quick-reply/quick-reply-attachment-picker";
import { toKbAttachmentItem } from "@/pages/chat/ai-hosting/kb-components/kb-attachment-types";
import { uploadKbImageToCos } from "@/pages/chat/ai-hosting/api/kb-upload-service";

export type ListKbAttachmentsParams = {
  attachmentType?: KbAttachmentType;
  chunkId?: string;
  docId: string;
  page?: number;
  pageSize?: number;
  query?: string;
};

export { toKbAttachmentItem };

export async function initKbAttachments(kbId: string) {
  const response = await http.post<ApiSuccessEnvelope<KbAttachmentInitResponse>>(
    `/server/ai-hosting/kbs/${kbId}/attachments/init`,
  );

  return response.data;
}

export async function getKbAttachmentStatus(kbId: string) {
  const response = await http.get<ApiSuccessEnvelope<KbAttachmentStatusResponse>>(
    `/server/ai-hosting/kbs/${kbId}/attachments/status`,
  );

  return response.data;
}

export async function listKbAttachments(kbId: string, params: ListKbAttachmentsParams) {
  const response = await http.get<ApiSuccessEnvelope<KbAttachmentListResponse>>(
    `/server/ai-hosting/kbs/${kbId}/attachments${buildQueryString(params)}`,
  );

  return response.data;
}

export async function createKbAttachment(kbId: string, payload: KbAttachmentCreateRequest) {
  const response = await http.post<ApiSuccessEnvelope<KbAttachmentCreateResponse>>(
    `/server/ai-hosting/kbs/${kbId}/attachments`,
    payload,
  );

  return response.data;
}

export async function createKbAttachmentImageMaterial(
  kbId: string,
  payload: { alt?: string; fileUrl: string },
) {
  const response = await http.post<ApiSuccessEnvelope<KbAttachmentImageMaterialCreateResponse>>(
    `/server/ai-hosting/kbs/${kbId}/attachments/materials/image`,
    payload,
  );

  return response.data;
}

export async function updateKbAttachment(chunkId: string, payload: KbAttachmentUpdateRequest) {
  const response = await http.post<ApiSuccessEnvelope<KbAttachmentUpdateResponse>>(
    `/server/ai-hosting/kb-attachments/${chunkId}/update`,
    payload,
  );

  return response.data;
}

export async function deleteKbAttachment(chunkId: string) {
  const response = await http.post<ApiSuccessEnvelope<KbAttachmentDeleteResponse>>(
    `/server/ai-hosting/kb-attachments/${chunkId}/delete`,
  );

  return response.data;
}

export async function batchDeleteKbAttachments(chunkIds: string[]) {
  const response = await http.post<ApiSuccessEnvelope<KbAttachmentBatchDeleteResponse>>(
    "/server/ai-hosting/kb-attachments/batch-delete",
    { chunkIds },
  );

  return response.data;
}

export async function resolveKbAttachmentMaterialId(
  kbId: string,
  payload: QuickReplyDraftAttachment,
): Promise<string> {
  if (payload.materialCollectionId?.trim()) {
    return payload.materialCollectionId.trim();
  }

  if (payload.type === "image") {
    const fileUrl = readImageUploadUrl(payload);

    if (!fileUrl) {
      throw new Error("图片缺少上传地址");
    }

    const material = await createKbAttachmentImageMaterial(kbId, {
      alt: readString(payload.content.alt) || undefined,
      fileUrl,
    });

    return material.materialCollectionId;
  }

  throw new Error("请选择素材");
}

export async function resolveKbAttachmentDraftPayload(
  _kbId: string,
  payload: QuickReplyDraftAttachment,
): Promise<QuickReplyDraftAttachment> {
  if (payload.type === "image" && "localFile" in payload) {
    const uploadResult = await uploadKbImageToCos(payload.localFile);

    return {
      content: {
        alt: readString(payload.content.alt) || payload.localFile.name || "图片",
        fileUrl: uploadResult.url,
      },
      type: "image",
    };
  }

  return payload;
}

export async function buildKbAttachmentCreateRequest(input: {
  attachmentType: KbAttachmentType;
  description: string;
  kbId: string;
  payload: QuickReplyDraftAttachment;
  title?: string;
}): Promise<KbAttachmentCreateRequest> {
  const resolvedPayload = await resolveKbAttachmentDraftPayload(input.kbId, input.payload);
  const materialCollectionId = await resolveKbAttachmentMaterialId(
    input.kbId,
    resolvedPayload,
  );

  return {
    attachmentType: input.attachmentType,
    description: input.description,
    materialCollectionId,
    title: input.title,
  };
}

export async function buildKbAttachmentUpdateRequest(input: {
  description: string;
  kbId: string;
  nextPayload: QuickReplyDraftAttachment;
  previousPayload: QuickReplyDraftAttachment;
  title?: string;
}): Promise<KbAttachmentUpdateRequest> {
  const request: KbAttachmentUpdateRequest = {
    description: input.description,
    title: input.title,
  };

  const resolvedNextPayload = await resolveKbAttachmentDraftPayload(
    input.kbId,
    input.nextPayload,
  );
  const resolvedPreviousPayload = await resolveKbAttachmentDraftPayload(
    input.kbId,
    input.previousPayload,
  );
  const nextMaterialId = await resolveKbAttachmentMaterialId(
    input.kbId,
    resolvedNextPayload,
  );
  const previousMaterialId = resolvedPreviousPayload.materialCollectionId?.trim() || "";

  if (nextMaterialId !== previousMaterialId) {
    request.materialCollectionId = nextMaterialId;
  }

  return request;
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

function readImageUploadUrl(payload: QuickReplyDraftAttachment) {
  if (payload.type !== "image") {
    return "";
  }

  return (
    readString(payload.content.fileUrl)
    || readString(payload.content.imageUrl)
    || readString(payload.content.url)
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
