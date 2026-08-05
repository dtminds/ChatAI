export type SmartReplySuggestion = {
  assistantName: string;
  busyRequestId?: number;
  content: string;
  createdAt?: number;
  failReason?: string;
  /** Java 原始 genAnswer */
  genAnswer?: string;
  generateStatus?: number | string;
  pollComplete?: boolean;
  sent?: boolean;
  status?: "thinking" | "processing" | "ready";
  refAttachIds?: string[];
  recordId?: string;
};

export type SmartReplyRecommendedAttachment = {
  id: string;
  fileName: string;
  fileType: string;
  defaultSelected?: boolean;
  localPath?: string;
  slocalPath?: string;
  content?: string;
  coverUrl?: string;
  jumpUrl?: string;
  transMsgInfoId?: string;
};

export type SmartReplyViolationResult = {
  categoryLabel: string;
  words: string[];
};
