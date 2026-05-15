import { http, isRequestError } from "@/lib/request";
import type { WorkbenchSidebarTuseCryptoDto } from "@chatai/contracts";

/** 从 `xy_wap_embed_user_relation` 经后端解析的侧栏涂色 AES 参数与 `appId`（iframe 上为查询参数 `mid`）；未配置时返回 `null` */
export async function fetchWorkbenchSidebarTuseCrypto(): Promise<WorkbenchSidebarTuseCryptoDto | null> {
  try {
    return await http.get<WorkbenchSidebarTuseCryptoDto>("/server/me/sidebar-tuse-crypto");
  } catch (unknownError: unknown) {
    if (isRequestError(unknownError) && unknownError.status === 404) {
      return null;
    }

    throw unknownError;
  }
}
