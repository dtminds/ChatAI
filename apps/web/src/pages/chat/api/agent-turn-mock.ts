import type {
  AgentTurnEventEnvelope,
  AgentTurnMockScenario,
  ResolveAgentTurnDecisionRequest,
  ResolveAgentTurnKfClarificationRequest,
  StartAgentTurnRequest,
  StartAgentTurnResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export function startAgentTurnMock(input: {
  conversationId: string;
  messageId?: string;
  scenario: AgentTurnMockScenario;
}) {
  const request: StartAgentTurnRequest = {
    conversationId: input.conversationId,
    mock: {
      scenario: input.scenario,
      stepDelayMs: 700,
    },
    trigger: {
      ...(input.messageId ? { messageId: input.messageId } : {}),
      type: "agent_request",
    },
  };

  return http.post<StartAgentTurnResponse, StartAgentTurnRequest>(
    "/server/agent-turns",
    request,
  );
}

export function resolveAgentTurnMockDecision(input: {
  decisionId: string;
  resolution: ResolveAgentTurnDecisionRequest;
  turnId: string;
}) {
  return http.post<{ ok: true }, ResolveAgentTurnDecisionRequest>(
    `/server/agent-turns/${encodeURIComponent(input.turnId)}/decisions/${encodeURIComponent(input.decisionId)}`,
    input.resolution,
  );
}

export function resolveAgentTurnMockClarification(input: {
  callId: string;
  response: ResolveAgentTurnKfClarificationRequest;
  turnId: string;
}) {
  return http.post<{ ok: true }, ResolveAgentTurnKfClarificationRequest>(
    `/server/agent-turns/${encodeURIComponent(input.turnId)}/tool-calls/${encodeURIComponent(input.callId)}/responses`,
    input.response,
  );
}

export function cancelAgentTurnMock(turnId: string) {
  return http.post<{ ok: true }>(
    `/server/agent-turns/${encodeURIComponent(turnId)}/cancel`,
  );
}

export function subscribeAgentTurnMockEvents(
  turnId: string,
  handlers: {
    onError: () => void;
    onEvent: (event: AgentTurnEventEnvelope) => void;
  },
) {
  const source = new EventSource(
    `${resolveApiBaseUrl()}/server/agent-turns/${encodeURIComponent(turnId)}/events`,
    { withCredentials: true },
  );
  const handleEvent = (event: MessageEvent<string>) => {
    const envelope = JSON.parse(event.data) as AgentTurnEventEnvelope;
    handlers.onEvent(envelope);

    if (
      envelope.event.type === "turn.completed" ||
      envelope.event.type === "turn.cancelled" ||
      envelope.event.type === "turn.failed"
    ) {
      source.close();
    }
  };

  source.addEventListener("agent-turn", handleEvent as EventListener);
  source.onerror = () => {
    source.close();
    handlers.onError();
  };

  return () => {
    source.removeEventListener("agent-turn", handleEvent as EventListener);
    source.close();
  };
}

function resolveApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
}
