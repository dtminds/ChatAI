import type {
  ChatAgentPreflightRequest,
  ChatAgentPreflightResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export function requestChatAgentPreflight(
  input: ChatAgentPreflightRequest,
  signal?: AbortSignal,
) {
  return http.post<
    ChatAgentPreflightResponse,
    ChatAgentPreflightRequest
  >("/server/chat-agent/preflight", input, { signal });
}
