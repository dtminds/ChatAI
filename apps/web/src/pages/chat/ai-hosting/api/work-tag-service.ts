import type {
  ApiSuccessEnvelope,
  WorkTagAttr,
  WorkTagComponentType,
  WorkTagGroupListResponse,
  WorkTagListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type ListWorkTagGroupsParams = {
  /** 1 普通标签，2 互斥标签；默认由后端按 1 处理 */
  attr?: WorkTagAttr;
  /** 企微客户标签传 0 */
  type?: WorkTagComponentType;
};

export type ListWorkTagsParams = {
  attr?: WorkTagAttr;
  groupId?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
  /** 0 外部联系人（企微客户标签）；12 星云客户标签（小店标签） */
  type?: WorkTagComponentType;
};

export async function listWorkTagGroups(params: ListWorkTagGroupsParams = {}) {
  const query = new URLSearchParams();

  if (params.attr != null) {
    query.set("attr", String(params.attr));
  }

  if (params.type != null) {
    query.set("type", String(params.type));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await http.get<ApiSuccessEnvelope<WorkTagGroupListResponse>>(
    `/server/ai-hosting/work-tag-groups${suffix}`,
  );

  return response.data;
}

export async function listWorkTags(params: ListWorkTagsParams = {}) {
  const query = new URLSearchParams();

  if (params.attr != null) {
    query.set("attr", String(params.attr));
  }

  if (params.groupId != null) {
    query.set("groupId", String(params.groupId));
  }

  if (params.keyword?.trim()) {
    query.set("keyword", params.keyword.trim());
  }

  if (params.page != null) {
    query.set("page", String(params.page));
  }

  if (params.pageSize != null) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params.type != null) {
    query.set("type", String(params.type));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await http.get<ApiSuccessEnvelope<WorkTagListResponse>>(
    `/server/ai-hosting/work-tags${suffix}`,
  );

  return response.data;
}
