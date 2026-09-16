import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { LexicalEditor } from "lexical";
import { toast } from "sonner";
import type {
  AgentTurnEvent,
  AgentTurnFinishInput,
  AgentTurnKfClarificationInput,
  AgentTurnMockScenario,
  ResolveAgentTurnDecisionRequest,
  ResolveAgentTurnKfClarificationRequest,
  WorkbenchOutgoingMessageSegment,
} from "@chatai/contracts";
import {
  cancelAgentTurnMock,
  resolveAgentTurnMockClarification,
  resolveAgentTurnMockDecision,
  startAgentTurnMock,
  subscribeAgentTurnMockEvents,
} from "@/pages/chat/api/agent-turn-mock";
import type {
  ChatAIAssistantAction,
  ChatAIAssistantStatus,
} from "@/pages/chat/components/chat-ai-assistant-status-bar";
import { REPLACE_COMPOSER_COMMAND } from "@/pages/chat/components/composer/lexical-commands";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";

type AgentTurnMockPhase =
  | "idle"
  | "running"
  | "awaiting_decision"
  | "awaiting_clarification"
  | "reply_ready"
  | "completed"
  | "failed";

type PendingDecision = {
  callId: string;
  decisionId: string;
};

type AgentTurnMockToolCall = Extract<AgentTurnEvent, { type: "tool_call" }>;

export type AgentTurnMockApproval = {
  decisionId: string;
  toolCall: AgentTurnMockToolCall;
};

export type AgentTurnMockState = {
  activeScenario?: AgentTurnMockScenario;
  clarification?: {
    callId: string;
    input: AgentTurnKfClarificationInput;
  };
  finishCall?: {
    callId: string;
    input: AgentTurnFinishInput;
  };
  label?: string;
  pendingDecision?: PendingDecision;
  phase: AgentTurnMockPhase;
  reason?: string;
  toolCalls: Record<string, AgentTurnMockToolCall>;
  toolSummaries: Record<string, string>;
  turnId?: string;
};

const INITIAL_STATE: AgentTurnMockState = {
  phase: "idle",
  toolCalls: {},
  toolSummaries: {},
};

export type AgentTurnMockView = {
  label?: string;
  reason?: string;
  status: ChatAIAssistantStatus;
  waitingForCustomer?: boolean;
};

export function useAgentTurnMock({
  composerRef,
  conversationId,
  messageId,
}: {
  composerRef: RefObject<LexicalEditor | null>;
  conversationId?: string;
  messageId?: string;
}) {
  const [state, setState] = useState<AgentTurnMockState>(INITIAL_STATE);
  const [appliedFinishCallId, setAppliedFinishCallId] = useState<string>();
  const [isResolvingDecision, setIsResolvingDecision] = useState(false);
  const [isResolvingClarification, setIsResolvingClarification] =
    useState(false);
  const closeStreamRef = useRef<() => void>(() => {});
  const generationRef = useRef(0);

  const reset = useCallback((options?: { clearComposer?: boolean }) => {
    generationRef.current += 1;
    closeStreamRef.current();
    closeStreamRef.current = () => {};
    setState(INITIAL_STATE);
    setAppliedFinishCallId(undefined);
    setIsResolvingDecision(false);
    setIsResolvingClarification(false);

    if (options?.clearComposer) {
      composerRef.current?.dispatchCommand(REPLACE_COMPOSER_COMMAND, {
        segments: [],
      });
    }
  }, [composerRef]);

  useEffect(() => reset, [conversationId, reset]);

  const startScenario = useCallback(async (scenario: AgentTurnMockScenario) => {
    if (!conversationId) return;

    reset();
    const generation = generationRef.current;
    setState({
      activeScenario: scenario,
      label: "正在启动 Agent",
      phase: "running",
      toolCalls: {},
      toolSummaries: {},
    });

    try {
      const { turnId } = await startAgentTurnMock({
        conversationId,
        messageId,
        scenario,
      });

      if (generationRef.current !== generation) return;

      setState((current) => ({ ...current, turnId }));
      closeStreamRef.current = subscribeAgentTurnMockEvents(turnId, {
        onError: () => {
          if (generationRef.current !== generation) return;
          setState((current) => ({
            ...current,
            clarification: undefined,
            label: "Agent 连接已中断",
            pendingDecision: undefined,
            phase: "failed",
            reason: "无法继续接收 Agent 事件",
          }));
          toast.error("操作失败，请稍后重试");
        },
        onEvent: (envelope) => {
          if (generationRef.current !== generation) return;
          setState((current) => reduceAgentTurnMockState(current, envelope.event));
        },
      });
    } catch {
      if (generationRef.current !== generation) return;
      setState((current) => ({
        ...current,
        label: "Agent 启动失败",
        phase: "failed",
        reason: "无法启动模拟 Agent Turn",
      }));
      toast.error("操作失败，请稍后重试");
    }
  }, [conversationId, messageId, reset]);

  useLayoutEffect(() => {
    if (
      state.phase !== "reply_ready" ||
      !state.finishCall ||
      state.finishCall.input.outcome !== "reply" ||
      appliedFinishCallId === state.finishCall.callId
    ) {
      return;
    }

    const segments = adaptReplySegments(state.finishCall.input.reply.segments);
    composerRef.current?.dispatchCommand(REPLACE_COMPOSER_COMMAND, { segments });
    setAppliedFinishCallId(state.finishCall.callId);
  }, [appliedFinishCallId, composerRef, state.finishCall, state.phase]);

  const resolveDecision = useCallback(async (
    resolution: ResolveAgentTurnDecisionRequest,
  ) => {
    if (!state.turnId || !state.pendingDecision || isResolvingDecision) return;

    setIsResolvingDecision(true);
    try {
      await resolveAgentTurnMockDecision({
        decisionId: state.pendingDecision.decisionId,
        resolution,
        turnId: state.turnId,
      });
    } catch {
      setIsResolvingDecision(false);
      toast.error("操作失败，请稍后重试");
    }
  }, [isResolvingDecision, state.pendingDecision, state.turnId]);

  const resolveClarification = useCallback(
    async (response: ResolveAgentTurnKfClarificationRequest) => {
      if (
        !state.turnId ||
        !state.clarification ||
        isResolvingClarification
      ) {
        return;
      }

      setIsResolvingClarification(true);
      try {
        await resolveAgentTurnMockClarification({
          callId: state.clarification.callId,
          response,
          turnId: state.turnId,
        });
      } catch {
        setIsResolvingClarification(false);
        toast.error("操作失败，请稍后重试");
      }
    },
    [isResolvingClarification, state.clarification, state.turnId],
  );

  const terminate = useCallback(async () => {
    if (!state.turnId || isResolvingClarification) return;

    setIsResolvingClarification(true);
    try {
      await cancelAgentTurnMock(state.turnId);
    } catch {
      setIsResolvingClarification(false);
      toast.error("操作失败，请稍后重试");
    }
  }, [isResolvingClarification, state.turnId]);

  useEffect(() => {
    if (state.phase !== "awaiting_decision") {
      setIsResolvingDecision(false);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "awaiting_clarification") {
      setIsResolvingClarification(false);
    }
  }, [state.phase]);

  const isReplyReady = Boolean(
    state.phase === "reply_ready" &&
      state.finishCall?.input.outcome === "reply" &&
      appliedFinishCallId === state.finishCall.callId,
  );
  const view = useMemo(
    () => projectAgentTurnMockView(state, isReplyReady),
    [isReplyReady, state],
  );
  const actions = useMemo<readonly ChatAIAssistantAction[]>(() => {
    if (isReplyReady || state.phase === "failed") {
      return [
        {
          id: "dismiss",
          label: "忽略",
          onSelect: () => reset({ clearComposer: isReplyReady }),
          tone: "quiet",
        },
      ];
    }

    return [];
  }, [isReplyReady, reset, state.phase]);

  const approval = useMemo<AgentTurnMockApproval | undefined>(() => {
    if (!state.pendingDecision) return undefined;

    const toolCall = state.toolCalls[state.pendingDecision.callId];
    if (!toolCall) return undefined;

    return {
      decisionId: state.pendingDecision.decisionId,
      toolCall,
    };
  }, [state.pendingDecision, state.toolCalls]);

  return {
    actions,
    activeScenario: state.activeScenario,
    approval,
    clarification: state.clarification?.input,
    isResolvingApproval: isResolvingDecision,
    isResolvingClarification,
    isActive: state.phase !== "idle",
    isReplyReady,
    markReplyHandled: reset,
    reset,
    resolveApproval: resolveDecision,
    resolveClarification,
    startScenario,
    terminate,
    view,
  };
}

export function reduceAgentTurnMockState(
  state: AgentTurnMockState,
  event: AgentTurnEvent,
): AgentTurnMockState {
  switch (event.type) {
    case "turn.started":
      return {
        ...state,
        label: "AI 正在思考",
        phase: "running",
      };
    case "activity.updated":
      return event.activity.status === "running"
        ? {
            ...state,
            label: event.activity.summary,
            phase: "running",
          }
        : state;
    case "tool_call": {
      const summary = event.summary?.trim() || "AI 正在思考";
      const clarification =
        event.category === "control" &&
        event.name === "request_kf_clarification" &&
        isAgentTurnKfClarificationInput(event.input)
          ? {
              callId: event.callId,
              input: event.input,
            }
          : state.clarification;
      const finishCall =
        event.category === "control" && event.name === "turn.finish"
          ? {
              callId: event.callId,
              input: event.input as AgentTurnFinishInput,
            }
          : state.finishCall;

      return {
        ...state,
        clarification,
        finishCall,
        label: summary,
        phase:
          clarification?.callId === event.callId
            ? "awaiting_clarification"
            : "running",
        toolCalls: {
          ...state.toolCalls,
          [event.callId]: event,
        },
        toolSummaries: {
          ...state.toolSummaries,
          [event.callId]: summary,
        },
      };
    }
    case "decision.requested":
      return {
        ...state,
        label: state.toolSummaries[event.callId] || "需要你确认",
        pendingDecision: {
          callId: event.callId,
          decisionId: event.decisionId,
        },
        phase: "awaiting_decision",
      };
    case "decision.resolved":
      return {
        ...state,
        label: state.toolSummaries[event.callId] || "正在继续处理",
        pendingDecision: undefined,
        phase: "running",
      };
    case "tool_result":
      if (state.clarification?.callId === event.callId) {
        return event.status === "succeeded"
          ? {
              ...state,
              clarification: undefined,
              label: "正在根据客服指令继续处理",
              phase: "running",
            }
          : {
              ...state,
              clarification: undefined,
              label: "获取客服指令失败",
              phase: "failed",
            };
      }

      return event.status === "failed"
        ? {
            ...state,
            label: "处理遇到问题，正在继续尝试",
            phase: "running",
          }
        : state;
    case "turn.completed":
      return event.outcome === "reply" && state.finishCall?.input.outcome === "reply"
        ? {
            ...state,
            label: state.finishCall.input.summary,
            phase: "reply_ready",
          }
        : {
            ...state,
            label:
              state.finishCall?.input.outcome === "no_reply"
                ? state.finishCall.input.summary
                : "本轮处理已完成",
            phase: "completed",
            reason:
              state.finishCall?.input.outcome === "no_reply"
                ? state.finishCall.input.reason
                : undefined,
          };
    case "turn.failed":
      return {
        ...state,
        clarification: undefined,
        label: "Agent 执行失败",
        pendingDecision: undefined,
        phase: "failed",
        reason: event.error.message,
      };
    case "turn.cancelled":
      return INITIAL_STATE;
  }
}

function projectAgentTurnMockView(
  state: AgentTurnMockState,
  isReplyReady: boolean,
): AgentTurnMockView | null {
  if (state.phase === "idle") return null;

  if (state.phase === "completed") {
    return {
      label: state.label,
      reason: state.reason,
      status: "waiting",
      waitingForCustomer: true,
    };
  }

  if (
    state.phase === "awaiting_decision" ||
    state.phase === "awaiting_clarification" ||
    state.phase === "failed"
  ) {
    return {
      label: state.label,
      reason: state.reason,
      status: "confirmation",
    };
  }

  if (state.phase === "reply_ready" && isReplyReady) {
    return {
      label: state.label,
      status: "confirmation",
    };
  }

  return {
    label: state.label,
    status: "thinking",
  };
}

function isAgentTurnKfClarificationInput(
  input: unknown,
): input is AgentTurnKfClarificationInput {
  if (!input || typeof input !== "object") return false;

  const candidate = input as AgentTurnKfClarificationInput;
  if (typeof candidate.question !== "string" || !candidate.question.trim()) {
    return false;
  }

  return (
    candidate.suggestions === undefined ||
    (Array.isArray(candidate.suggestions) &&
      candidate.suggestions.every(
        (suggestion) =>
          typeof suggestion.id === "string" &&
          Boolean(suggestion.id.trim()) &&
          typeof suggestion.label === "string" &&
          Boolean(suggestion.label.trim()) &&
          typeof suggestion.instruction === "string" &&
          Boolean(suggestion.instruction.trim()),
      ))
  );
}

function adaptReplySegments(
  segments: WorkbenchOutgoingMessageSegment[],
): ComposerSegment[] {
  return segments.flatMap((segment) =>
    segment.type === "text"
      ? [{ text: segment.text, type: "text" as const }]
      : [],
  );
}
