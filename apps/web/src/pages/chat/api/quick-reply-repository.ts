import type {
  WorkbenchQuickReplyBatchCreateRequest,
  WorkbenchQuickReplyBatchCreateResponse,
  WorkbenchQuickReplyCategoryContentRequest,
  WorkbenchQuickReplyCategoryContentResponse,
  WorkbenchQuickReplyCategoryCreateRequest,
  WorkbenchQuickReplyCategoryEnsureRequest,
  WorkbenchQuickReplyCategoryEnsureResponse,
  WorkbenchQuickReplyCategoryListRequest,
  WorkbenchQuickReplyCategoryListResponse,
  WorkbenchQuickReplyCategoryMoveRequest,
  WorkbenchQuickReplyCategorySortRequest,
  WorkbenchQuickReplyCategoryUpdateRequest,
  WorkbenchQuickReplyCreateRequest,
  WorkbenchQuickReplyListRequest,
  WorkbenchQuickReplyListResponse,
  WorkbenchQuickReplyMoveRequest,
  WorkbenchQuickReplyOkResponse,
  WorkbenchQuickReplySortRequest,
  WorkbenchQuickReplyUpdateRequest,
} from "@chatai/contracts";

export type QuickReplyRepository = {
  listCategories: (
    request: WorkbenchQuickReplyCategoryListRequest,
  ) => Promise<WorkbenchQuickReplyCategoryListResponse>;
  ensureCategories: (
    request: WorkbenchQuickReplyCategoryEnsureRequest,
  ) => Promise<WorkbenchQuickReplyCategoryEnsureResponse>;
  listCategoryContent: (
    request: WorkbenchQuickReplyCategoryContentRequest,
  ) => Promise<WorkbenchQuickReplyCategoryContentResponse>;
  listQuickReplies: (
    request: WorkbenchQuickReplyListRequest,
  ) => Promise<WorkbenchQuickReplyListResponse>;
  createCategory: (
    request: WorkbenchQuickReplyCategoryCreateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  renameCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
    request: WorkbenchQuickReplyCategoryUpdateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  topCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  bottomCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  deleteCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  moveCategory: (
    categoryId: string,
    scopeType: WorkbenchQuickReplyCategoryListRequest["scopeType"],
    request: WorkbenchQuickReplyCategoryMoveRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  sortCategories: (
    request: WorkbenchQuickReplyCategorySortRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  createQuickReply: (
    request: WorkbenchQuickReplyCreateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  batchCreateQuickReplies: (
    request: WorkbenchQuickReplyBatchCreateRequest,
  ) => Promise<WorkbenchQuickReplyBatchCreateResponse>;
  updateQuickReply: (
    quickReplyId: string,
    request: WorkbenchQuickReplyUpdateRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  topQuickReply: (
    quickReplyId: string,
    scopeType: WorkbenchQuickReplyListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  bottomQuickReply: (
    quickReplyId: string,
    scopeType: WorkbenchQuickReplyListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  deleteQuickReply: (
    quickReplyId: string,
    scopeType: WorkbenchQuickReplyListRequest["scopeType"],
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  moveQuickReply: (
    quickReplyId: string,
    scopeType: WorkbenchQuickReplyListRequest["scopeType"],
    request: WorkbenchQuickReplyMoveRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
  sortQuickReplies: (
    request: WorkbenchQuickReplySortRequest,
  ) => Promise<WorkbenchQuickReplyOkResponse>;
};
