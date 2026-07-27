import type { ApiSuccessEnvelope, CdpTagGroupListResponse } from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listCdpTagGroups() {
  const response = await http.get<ApiSuccessEnvelope<CdpTagGroupListResponse>>(
    "/server/ai-hosting/cdp-tag-groups",
  );

  return response.data;
}
