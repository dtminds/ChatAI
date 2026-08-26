export type InsightMessageContentStatus =
  | "ready"
  | "pending_transcription"
  | "unsupported"
  | "failed";

export type InsightMessageSenderRole =
  | "customer"
  | "agent"
  | "system"
  | "bot"
  | "unknown";

export type InsightMessageType =
  | "text"
  | "voice"
  | "file"
  | "link"
  | "miniapp"
  | "image"
  | "system"
  | "unsupported";

export type InsightMessageSourceRow = {
  chat_type: number;
  content: string | null;
  conversation_id: number | string;
  from_type: number | null;
  id: number | string;
  msgtime: number | string | Date;
  msgtype: string;
  third_from_id?: string | null;
  third_user_id?: string | null;
};

export type AiMessageInput = {
  aiText: string;
  contentStatus: InsightMessageContentStatus;
  conversationId: string;
  evidenceLabel: string;
  includedForAi: boolean;
  meaningfulForBoundary: boolean;
  messageType: InsightMessageType;
  occurredAt: number;
  senderRole: InsightMessageSenderRole;
  sourceMessageId: string;
};
