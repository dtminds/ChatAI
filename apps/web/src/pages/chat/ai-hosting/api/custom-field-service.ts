import type {
  ApiSuccessEnvelope,
  CustomFieldListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type ListCustomFieldsParams = {
  /** 0 关闭，1 开启；不传则返回全部 */
  status?: 0 | 1;
};

export async function listCustomFields(params: ListCustomFieldsParams = {}) {
  const query = new URLSearchParams();

  if (params.status != null) {
    query.set("status", String(params.status));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await http.get<ApiSuccessEnvelope<CustomFieldListResponse>>(
    `/server/ai-hosting/custom-fields${suffix}`,
  );

  return response.data;
}
