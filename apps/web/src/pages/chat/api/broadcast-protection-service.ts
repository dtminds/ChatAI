import type { WorkbenchBroadcastProtectionStatusDto } from "@chatai/contracts";
import { http } from "@/lib/request";

export function getBroadcastProtectionStatus(options?: { signal?: AbortSignal }) {
  return http.get<WorkbenchBroadcastProtectionStatusDto>(
    "/server/broadcast-protection",
    { signal: options?.signal },
  );
}
