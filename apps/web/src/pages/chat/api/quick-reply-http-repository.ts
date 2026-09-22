import { http } from "@/lib/request";
import type {
  WorkbenchQuickReplyBatchCreateRequest,
  WorkbenchQuickReplyBatchCreateResponse,
  WorkbenchQuickReplyCategoryContentResponse,
  WorkbenchQuickReplyCategoryCreateRequest,
  WorkbenchQuickReplyCategoryEnsureRequest,
  WorkbenchQuickReplyCategoryEnsureResponse,
  WorkbenchQuickReplyCategoryListResponse,
  WorkbenchQuickReplyCategoryMoveRequest,
  WorkbenchQuickReplyCategorySortRequest,
  WorkbenchQuickReplyCategoryUpdateRequest,
  WorkbenchQuickReplyCreateRequest,
  WorkbenchQuickReplyListResponse,
  WorkbenchQuickReplyMoveRequest,
  WorkbenchQuickReplyOkResponse,
  WorkbenchQuickReplySortRequest,
  WorkbenchQuickReplyUpdateRequest,
} from "@chatai/contracts";
import type { QuickReplyRepository } from "./quick-reply-repository";

export function createHttpQuickReplyRepository(): QuickReplyRepository {
  return {
    listCategories(request) {
      return http.get<WorkbenchQuickReplyCategoryListResponse>(
        "/server/quick-replies/categories",
        {
          params: {
            scope_type: request.scopeType,
          },
        },
      );
    },
    ensureCategories(request) {
      return http.post<
        WorkbenchQuickReplyCategoryEnsureResponse,
        WorkbenchQuickReplyCategoryEnsureRequest
      >("/server/quick-replies/categories/ensure", request);
    },
    listCategoryContent(request) {
      return http.get<WorkbenchQuickReplyCategoryContentResponse>(
        "/server/quick-replies/category-content",
        {
          params: {
            parent_category_id: request.parentCategoryId,
            scope_type: request.scopeType,
          },
        },
      );
    },
    listQuickReplies(request) {
      return http.get<WorkbenchQuickReplyListResponse>("/server/quick-replies", {
        params: {
          category_id: request.categoryId,
          keyword: request.keyword,
          page: request.page,
          page_size: request.pageSize,
          scope_type: request.scopeType,
        },
      });
    },
    createCategory(request) {
      return http.post<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyCategoryCreateRequest
      >("/server/quick-replies/categories", request);
    },
    renameCategory(categoryId, scopeType, request) {
      return http.patch<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyCategoryUpdateRequest
      >(`/server/quick-replies/categories/${categoryId}`, request, {
        params: {
          scope_type: scopeType,
        },
      });
    },
    topCategory(categoryId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/categories/${categoryId}/top`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    bottomCategory(categoryId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/categories/${categoryId}/bottom`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    deleteCategory(categoryId, scopeType) {
      return http.delete<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/categories/${categoryId}`,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    moveCategory(categoryId, scopeType, request) {
      return http.post<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyCategoryMoveRequest
      >(`/server/quick-replies/categories/${categoryId}/move`, request, {
        params: {
          scope_type: scopeType,
        },
      });
    },
    sortCategories(request) {
      return http.post<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyCategorySortRequest
      >("/server/quick-replies/categories/sort", request);
    },
    createQuickReply(request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplyCreateRequest>(
        "/server/quick-replies",
        request,
      );
    },
    batchCreateQuickReplies(request) {
      return http.post<
        WorkbenchQuickReplyBatchCreateResponse,
        WorkbenchQuickReplyBatchCreateRequest
      >("/server/quick-replies/batch", request);
    },
    updateQuickReply(quickReplyId, request) {
      return http.patch<
        WorkbenchQuickReplyOkResponse,
        WorkbenchQuickReplyUpdateRequest
      >(`/server/quick-replies/${quickReplyId}`, request);
    },
    topQuickReply(quickReplyId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/${quickReplyId}/top`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    bottomQuickReply(quickReplyId, scopeType) {
      return http.post<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/${quickReplyId}/bottom`,
        undefined,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    deleteQuickReply(quickReplyId, scopeType) {
      return http.delete<WorkbenchQuickReplyOkResponse>(
        `/server/quick-replies/${quickReplyId}`,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    moveQuickReply(quickReplyId, scopeType, request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplyMoveRequest>(
        `/server/quick-replies/${quickReplyId}/move`,
        request,
        {
          params: {
            scope_type: scopeType,
          },
        },
      );
    },
    sortQuickReplies(request) {
      return http.post<WorkbenchQuickReplyOkResponse, WorkbenchQuickReplySortRequest>(
        "/server/quick-replies/sort",
        request,
      );
    },
  };
}
