import { http, isRequestError } from "@/lib/request";
import type { WorkbenchSidebarIframeParamsDto } from "@chatai/contracts";

export type FetchWorkbenchSidebarIframeParamsInput = {
  conversationId: string;
  seatId: string;
};

/** 服务端按席位与会话签发的侧栏 iframe 涂色参数；未配置密钥时返回 `null` */
export async function fetchWorkbenchSidebarIframeParams(
  input: FetchWorkbenchSidebarIframeParamsInput,
): Promise<WorkbenchSidebarIframeParamsDto | null> {
  try {
    return await http.post<WorkbenchSidebarIframeParamsDto>("/server/sidebar-iframe-params", input);
  } catch (unknownError: unknown) {
    if (isRequestError(unknownError) && unknownError.status === 404) {
      return null;
    }

    throw unknownError;
  }
}
