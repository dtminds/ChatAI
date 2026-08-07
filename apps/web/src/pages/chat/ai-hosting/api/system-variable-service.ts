import type {
  ApiSuccessEnvelope,
  SystemVariableListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listSystemVariables() {
  const response = await http.get<ApiSuccessEnvelope<SystemVariableListResponse>>(
    "/server/ai-hosting/system-variables",
  );

  return response.data;
}
