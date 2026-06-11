import type { QuotedMessagePreviewContent } from "@/pages/chat/chat-types";
import {
  getComposerSegmentsPreview,
  normalizeComposerSegments,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";

export type ConversationComposerDraft = {
  draft: string;
  quotedMessage: QuotedMessagePreviewContent | null;
  segments: ComposerSegment[];
};

export function buildConversationComposerDraft(input: {
  draft: string;
  quotedMessage: QuotedMessagePreviewContent | null;
  segments: ComposerSegment[];
}): ConversationComposerDraft {
  return {
    draft: input.draft,
    quotedMessage: input.quotedMessage,
    segments: normalizeComposerSegments(input.segments),
  };
}

export function hasConversationComposerDraftContent(
  draft: ConversationComposerDraft | undefined,
) {
  if (!draft) {
    return false;
  }

  return (
    draft.draft.trim().length > 0 ||
    draft.segments.length > 0 ||
    draft.quotedMessage !== null
  );
}

export const CONVERSATION_COMPOSER_DRAFT_PREVIEW_PREFIX = "[草稿]";

export function getConversationComposerDraftPreview(
  draft: ConversationComposerDraft,
) {
  const preview = getComposerSegmentsPreview(draft.segments).trim();

  if (preview) {
    return `${CONVERSATION_COMPOSER_DRAFT_PREVIEW_PREFIX}${preview}`;
  }

  if (draft.quotedMessage) {
    return `${CONVERSATION_COMPOSER_DRAFT_PREVIEW_PREFIX}[引用消息]`;
  }

  const trimmedDraft = draft.draft.trim();

  return trimmedDraft
    ? `${CONVERSATION_COMPOSER_DRAFT_PREVIEW_PREFIX}${trimmedDraft}`
    : CONVERSATION_COMPOSER_DRAFT_PREVIEW_PREFIX;
}

export function getConversationComposerDraftPreviewParts(
  draft: ConversationComposerDraft,
) {
  const preview = getConversationComposerDraftPreview(draft);

  return {
    body: preview.slice(CONVERSATION_COMPOSER_DRAFT_PREVIEW_PREFIX.length),
    prefix: CONVERSATION_COMPOSER_DRAFT_PREVIEW_PREFIX,
  };
}
