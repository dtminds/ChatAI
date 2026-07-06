import type {
  ApiSuccessEnvelope,
  KbAttachmentBatchDeleteResponse,
  KbAttachmentCreateRequest,
  KbAttachmentCreateResponse,
  KbAttachmentDeleteResponse,
  KbAttachmentInitResponse,
  KbAttachmentListResponse,
  KbAttachmentType,
  KbAttachmentUpdateRequest,
  KbAttachmentUpdateResponse,
} from "@chatai/contracts";
import { http, isRequestError, RequestNormalizedError } from "@/lib/request";
import type { QuickReplyDraftAttachment } from "@/pages/chat/components/quick-reply/quick-reply-attachment-picker";
import {
  toKbAttachmentContent,
  toKbAttachmentItem,
} from "@/pages/chat/ai-hosting/kb-components/kb-attachment-types";
import { uploadKbImageToCos } from "@/pages/chat/ai-hosting/api/kb-upload-service";

export type ListKbAttachmentsParams = {
  attachmentType: KbAttachmentType;
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

export async function resolveKbAttachmentDraftPayload(
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
  payload: QuickReplyDraftAttachment;
  title?: string;
}): Promise<KbAttachmentCreateRequest> {
  const resolvedPayload = await resolveKbAttachmentDraftPayload(input.payload);

  return {
    attachmentContent: toKbAttachmentContent(resolvedPayload),
    attachmentType: input.attachmentType,
    description: input.description,
    title: input.title,
  };
}

export async function buildKbAttachmentUpdateRequest(input: {
  description: string;
  nextPayload: QuickReplyDraftAttachment;
  previousPayload: QuickReplyDraftAttachment;
  title?: string;
}): Promise<KbAttachmentUpdateRequest> {
  const request: KbAttachmentUpdateRequest = {
    description: input.description,
    title: input.title,
  };

  const resolvedPayload = await resolveKbAttachmentDraftPayload(input.nextPayload);
  const resolvedPreviousPayload = await resolveKbAttachmentDraftPayload(input.previousPayload);

  if (
    JSON.stringify(toKbAttachmentContent(resolvedPayload))
    !== JSON.stringify(toKbAttachmentContent(resolvedPreviousPayload))
  ) {
    request.attachmentContent = toKbAttachmentContent(resolvedPayload);
  }

  return request;
}

export function isKbAttachmentNotInitialized(error: unknown) {
  if (error instanceof RequestNormalizedError) {
    return (
      error.status === 404
      && error.code === "KB_ATTACHMENT_NOT_INITIALIZED"
    );
  }

  if (isRequestError(error)) {
    return (
      error.status === 404
      && error.code === "KB_ATTACHMENT_NOT_INITIALIZED"
    );
  }

  return false;
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
