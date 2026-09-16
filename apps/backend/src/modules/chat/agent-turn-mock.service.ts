import { randomUUID } from "node:crypto";
import type {
  AgentTurnEvent,
  AgentTurnEventEnvelope,
  AgentTurnFinishInput,
  AgentTurnKfClarificationInput,
  AgentTurnMockScenario,
  ResolveAgentTurnDecisionRequest,
  ResolveAgentTurnKfClarificationRequest,
  StartAgentTurnRequest,
  StartAgentTurnResponse,
} from "@chatai/contracts";
import {
  BadRequestError,
  NotFoundError,
  TooManyRequestsError,
} from "../../shared/errors.js";

const DEFAULT_STEP_DELAY_MS = 700;
const MAX_RETAINED_TURNS = 100;
const TURN_RETENTION_MS = 30 * 60 * 1_000;

type ThinkingStep = {
  kind: "thinking";
  summary: string;
};

type ToolStep = {
  approvalMode: "auto" | "human";
  input: unknown;
  kind: "tool";
  name: string;
  output: unknown;
  summary: string;
};

type ClarificationStep = {
  input: AgentTurnKfClarificationInput;
  kind: "clarification";
  summary: string;
};

type FinishStep = {
  input: (context: {
    clarificationInstruction?: string;
    rejected: boolean;
  }) => AgentTurnFinishInput;
  kind: "finish";
};

type ScenarioStep = ThinkingStep | ToolStep | ClarificationStep | FinishStep;

type PendingDecision = {
  callId: string;
  decisionId: string;
  step: ToolStep;
};

type PendingClarification = {
  callId: string;
  input: AgentTurnKfClarificationInput;
};

type TurnStatus =
  | "running"
  | "awaiting_decision"
  | "awaiting_clarification"
  | "completed"
  | "cancelled"
  | "failed";

type TurnRecord = {
  activityIndex: number;
  callIndex: number;
  conversationId: string;
  events: AgentTurnEventEnvelope[];
  expiresAt: number;
  id: string;
  ownerSubUserId: string;
  pendingClarification?: PendingClarification;
  pendingDecision?: PendingDecision;
  clarificationInstruction?: string;
  rejected: boolean;
  sequence: number;
  status: TurnStatus;
  stepDelayMs: number;
  stepIndex: number;
  steps: ScenarioStep[];
  subscribers: Set<(event: AgentTurnEventEnvelope) => void>;
  timers: Set<ReturnType<typeof setTimeout>>;
};

export type AgentTurnSubscription = {
  events: AgentTurnEventEnvelope[];
  isTerminal: boolean;
  unsubscribe: () => void;
};

export class AgentTurnMockService {
  private readonly turns = new Map<string, TurnRecord>();

  start(
    ownerSubUserId: string,
    request: StartAgentTurnRequest,
  ): StartAgentTurnResponse {
    this.pruneExpiredTurns();

    if (this.turns.size >= MAX_RETAINED_TURNS) {
      throw new TooManyRequestsError(
        "AGENT_TURN_MOCK_CAPACITY_EXCEEDED",
        "模拟 Agent Turn 数量已达上限",
      );
    }

    const turnId = `turn-${randomUUID()}`;
    const scenario = request.mock?.scenario ?? pickRandomScenario();
    const record: TurnRecord = {
      activityIndex: 0,
      callIndex: 0,
      conversationId: request.conversationId,
      events: [],
      expiresAt: Date.now() + TURN_RETENTION_MS,
      id: turnId,
      ownerSubUserId,
      rejected: false,
      sequence: 0,
      status: "running",
      stepDelayMs: request.mock?.stepDelayMs ?? DEFAULT_STEP_DELAY_MS,
      stepIndex: 0,
      steps: createScenarioSteps(scenario),
      subscribers: new Set(),
      timers: new Set(),
    };

    this.turns.set(turnId, record);
    this.emit(record, {
      trigger: request.trigger,
      type: "turn.started",
    });
    this.schedule(record, () => this.advance(record));
    this.schedule(record, () => this.expireTurn(record), TURN_RETENTION_MS);

    return { turnId };
  }

  subscribe(
    turnId: string,
    ownerSubUserId: string,
    afterSequence: number,
    listener: (event: AgentTurnEventEnvelope) => void,
  ): AgentTurnSubscription {
    const record = this.getOwnedTurn(turnId, ownerSubUserId);
    const events = record.events.filter((event) => event.sequence > afterSequence);
    const isTerminal = isTerminalStatus(record.status);

    if (!isTerminal) {
      record.subscribers.add(listener);
    }

    return {
      events,
      isTerminal,
      unsubscribe: () => record.subscribers.delete(listener),
    };
  }

  resolveDecision(
    turnId: string,
    ownerSubUserId: string,
    decisionId: string,
    request: ResolveAgentTurnDecisionRequest,
  ) {
    const record = this.getOwnedTurn(turnId, ownerSubUserId);
    const pending = record.pendingDecision;

    if (!pending || pending.decisionId !== decisionId) {
      throw new BadRequestError(
        "AGENT_TURN_DECISION_NOT_PENDING",
        "当前没有待处理的 Agent 决策",
      );
    }

    record.pendingDecision = undefined;
    record.status = "running";
    this.emit(record, {
      action: request.action,
      callId: pending.callId,
      decisionId,
      type: "decision.resolved",
    });

    if (request.action === "reject") {
      record.rejected = true;
      this.emit(record, {
        callId: pending.callId,
        output: { rejected: true },
        status: "cancelled",
        type: "tool_result",
      });
      this.schedule(record, () => this.advance(record));
      return { ok: true as const };
    }

    this.schedule(record, () => {
      this.emit(record, {
        callId: pending.callId,
        output: pending.step.output,
        status: "succeeded",
        type: "tool_result",
      });
      this.advance(record);
    });

    return { ok: true as const };
  }

  resolveClarification(
    turnId: string,
    ownerSubUserId: string,
    callId: string,
    request: ResolveAgentTurnKfClarificationRequest,
  ) {
    const record = this.getOwnedTurn(turnId, ownerSubUserId);
    const pending = record.pendingClarification;

    if (!pending || pending.callId !== callId) {
      throw new BadRequestError(
        "AGENT_TURN_CLARIFICATION_NOT_PENDING",
        "当前没有待回复的客服澄清",
      );
    }

    const resolved = resolveClarificationResponse(pending.input, request);
    record.clarificationInstruction = resolved.instruction;
    record.pendingClarification = undefined;
    record.status = "running";
    this.emit(record, {
      callId,
      output: resolved,
      status: "succeeded",
      type: "tool_result",
    });
    this.schedule(record, () => this.advance(record));

    return { ok: true as const };
  }

  cancel(turnId: string, ownerSubUserId: string) {
    const record = this.getOwnedTurn(turnId, ownerSubUserId);

    if (isTerminalStatus(record.status)) {
      throw new BadRequestError(
        "AGENT_TURN_ALREADY_FINISHED",
        "Agent Turn 已结束",
      );
    }

    if (record.pendingClarification) {
      this.emit(record, {
        callId: record.pendingClarification.callId,
        output: { reason: "operator_terminated" },
        status: "cancelled",
        type: "tool_result",
      });
    }

    record.pendingClarification = undefined;
    record.pendingDecision = undefined;
    record.status = "cancelled";
    this.emit(record, {
      reason: "operator_terminated",
      type: "turn.cancelled",
    });

    return { ok: true as const };
  }

  dispose() {
    for (const record of this.turns.values()) {
      for (const timer of record.timers) {
        clearTimeout(timer);
      }
      record.timers.clear();
      record.subscribers.clear();
    }
    this.turns.clear();
  }

  private advance(record: TurnRecord) {
    if (record.status !== "running") {
      return;
    }

    const step = record.steps[record.stepIndex];
    record.stepIndex += 1;

    if (!step) {
      this.failTurn(record, "MOCK_SCENARIO_INCOMPLETE", "模拟场景未正常结束");
      return;
    }

    if (step.kind === "thinking") {
      const activityId = `thinking-${++record.activityIndex}`;
      this.emit(record, {
        activity: {
          id: activityId,
          kind: "thinking",
          status: "running",
          summary: step.summary,
        },
        type: "activity.updated",
      });
      this.schedule(record, () => {
        this.emit(record, {
          activity: {
            id: activityId,
            kind: "thinking",
            status: "succeeded",
            summary: step.summary,
          },
          type: "activity.updated",
        });
        this.advance(record);
      });
      return;
    }

    if (step.kind === "tool") {
      this.runToolStep(record, step);
      return;
    }

    if (step.kind === "clarification") {
      this.runClarificationStep(record, step);
      return;
    }

    this.finishTurn(record, step.input({
      clarificationInstruction: record.clarificationInstruction,
      rejected: record.rejected,
    }));
  }

  private runToolStep(record: TurnRecord, step: ToolStep) {
    const callId = `call-${++record.callIndex}`;
    this.emit(record, {
      approvalMode: step.approvalMode,
      callId,
      category: "business",
      input: step.input,
      name: step.name,
      summary: step.summary,
      type: "tool_call",
    });

    if (step.approvalMode === "human") {
      const decisionId = `decision-${callId}`;
      record.pendingDecision = { callId, decisionId, step };
      record.status = "awaiting_decision";
      this.emit(record, {
        actions: [
          { id: "reject", label: "忽略", tone: "quiet" },
          { id: "approve", label: "批准", tone: "primary" },
        ],
        callId,
        decisionId,
        type: "decision.requested",
      });
      return;
    }

    this.schedule(record, () => {
      const failed = step.name === "order.query.mock_failure";
      this.emit(record, failed
        ? {
            callId,
            error: { code: "ORDER_QUERY_FAILED", message: "暂时无法查询订单" },
            status: "failed",
            type: "tool_result",
          }
        : {
            callId,
            output: step.output,
            status: "succeeded",
            type: "tool_result",
          });
      this.advance(record);
    });
  }

  private runClarificationStep(record: TurnRecord, step: ClarificationStep) {
    const callId = `call-${++record.callIndex}`;
    record.pendingClarification = { callId, input: step.input };
    record.status = "awaiting_clarification";
    this.emit(record, {
      approvalMode: "auto",
      callId,
      category: "control",
      input: step.input,
      name: "request_kf_clarification",
      summary: step.summary,
      type: "tool_call",
    });
  }

  private finishTurn(record: TurnRecord, input: AgentTurnFinishInput) {
    const callId = `call-${++record.callIndex}`;
    this.emit(record, {
      approvalMode: "auto",
      callId,
      category: "control",
      input,
      name: "turn.finish",
      summary: input.summary,
      type: "tool_call",
    });
    this.schedule(record, () => {
      this.emit(record, {
        callId,
        output: { outcome: input.outcome },
        status: "succeeded",
        type: "tool_result",
      });
      record.status = "completed";
      this.emit(record, {
        finishCallId: callId,
        outcome: input.outcome,
        type: "turn.completed",
      });
    });
  }

  private failTurn(record: TurnRecord, code: string, message: string) {
    record.status = "failed";
    this.emit(record, {
      error: { code, message },
      type: "turn.failed",
    });
  }

  private emit(record: TurnRecord, event: AgentTurnEvent) {
    const sequence = ++record.sequence;
    const envelope: AgentTurnEventEnvelope = {
      event,
      eventId: `${record.id}:${sequence}`,
      occurredAt: new Date().toISOString(),
      sequence,
      turnId: record.id,
    };

    record.events.push(envelope);
    for (const subscriber of record.subscribers) {
      subscriber(envelope);
    }
  }

  private schedule(
    record: TurnRecord,
    task: () => void,
    delayMs = record.stepDelayMs,
  ) {
    const timer = setTimeout(() => {
      record.timers.delete(timer);
      task();
    }, delayMs);
    record.timers.add(timer);
  }

  private expireTurn(record: TurnRecord) {
    if (this.turns.get(record.id) !== record) return;

    if (!isTerminalStatus(record.status)) {
      this.failTurn(record, "AGENT_TURN_EXPIRED", "模拟 Agent Turn 已过期");
    }

    for (const timer of record.timers) {
      clearTimeout(timer);
    }
    record.timers.clear();
    record.subscribers.clear();
    this.turns.delete(record.id);
  }

  private getOwnedTurn(turnId: string, ownerSubUserId: string) {
    const record = this.turns.get(turnId);

    if (!record || record.ownerSubUserId !== ownerSubUserId) {
      throw new NotFoundError("AGENT_TURN_NOT_FOUND", "Agent Turn 不存在");
    }

    return record;
  }

  private pruneExpiredTurns() {
    const now = Date.now();
    for (const [turnId, record] of this.turns) {
      if (record.expiresAt > now) {
        continue;
      }
      for (const timer of record.timers) {
        clearTimeout(timer);
      }
      if (!isTerminalStatus(record.status)) {
        this.failTurn(record, "AGENT_TURN_EXPIRED", "模拟 Agent Turn 已过期");
      }
      record.subscribers.clear();
      this.turns.delete(turnId);
    }
  }
}

function isTerminalStatus(status: TurnStatus) {
  return status === "completed" || status === "cancelled" || status === "failed";
}

function pickRandomScenario(): AgentTurnMockScenario {
  const scenarios: AgentTurnMockScenario[] = [
    "knowledge_reply",
    "order_reply",
    "after_sales_approval",
    "operator_clarification",
    "tool_failure",
    "no_reply",
  ];

  return scenarios[Math.floor(Math.random() * scenarios.length)] ?? "knowledge_reply";
}

function createScenarioSteps(scenario: AgentTurnMockScenario): ScenarioStep[] {
  switch (scenario) {
    case "knowledge_reply":
      return [
        thinking("正在理解客户的问题"),
        tool("knowledge.search", "正在查询知识库", { query: "护肤产品使用方法" }, {
          items: [{ title: "产品使用说明", excerpt: "建议洁面后早晚使用" }],
        }),
        thinking("正在整理回复"),
        finish(() => replyFinish("已起草回复", "建议洁面后早晚使用，如有不适请先暂停使用。")),
      ];
    case "order_reply":
      return [
        thinking("正在核对客户提供的信息"),
        tool("order.query", "正在查询订单", { orderNumber: "MOCK-20260916-001" }, {
          orderNumber: "MOCK-20260916-001",
          status: "已签收",
        }),
        thinking("正在根据订单状态起草回复"),
        finish(() => replyFinish("已起草回复", "订单已经签收，请问具体遇到了什么售后问题？")),
      ];
    case "after_sales_approval":
      return [
        thinking("正在核对订单和售后条件"),
        tool("order.query", "正在查询订单", { orderNumber: "MOCK-20260916-002" }, {
          orderNumber: "MOCK-20260916-002",
          refundable: true,
          status: "已签收",
        }),
        tool(
          "after_sales.apply",
          "申请退款",
          { amount: 99, orderNumber: "MOCK-20260916-002", reason: "客户申请退款" },
          { afterSalesId: "AS-MOCK-001", status: "submitted" },
          "human",
        ),
        thinking("正在整理处理结果"),
        finish(({ rejected }) => rejected
          ? replyFinish("已起草回复", "本次退款申请暂未执行，如需继续处理请告诉我。")
          : replyFinish("已起草回复", "退款申请已经提交，后续进度会及时同步给你。")),
      ];
    case "operator_clarification":
      return [
        thinking("正在分析可行的处理方案"),
        clarification("需要你确认处理方式", {
          question: "物流停滞超过 48 小时，请确认下一步处理方式",
          suggestions: [
            {
              id: "REFUND",
              instruction: "为该订单办理仅退款",
              label: "办理仅退款",
            },
            {
              id: "EXPEDITE",
              instruction: "先联系物流加急催派，暂不退款",
              label: "加急催派",
            },
          ],
        }),
        thinking("正在根据客服指令继续处理"),
        finish(({ clarificationInstruction }) =>
          replyFinish(
            "已根据客服指令起草回复",
            clarificationInstruction?.includes("退款")
              ? "已为您记录退款诉求，我们会尽快核实并同步处理结果。"
              : "已记录您的诉求，我们会按照确认后的方案继续处理并及时同步进展。",
          ),
        ),
      ];
    case "tool_failure":
      return [
        thinking("正在核对订单信息"),
        tool(
          "order.query.mock_failure",
          "正在查询订单",
          { orderNumber: "MOCK-ERROR" },
          null,
        ),
        thinking("订单查询失败，正在查找替代处理方式"),
        tool("knowledge.search", "正在查询售后说明", { query: "无法查询订单时如何处理" }, {
          items: [{ title: "订单查询异常处理", excerpt: "请客户稍后重试或补充订单截图" }],
        }),
        finish(() => replyFinish("已起草回复", "暂时没有查到订单信息，麻烦提供订单截图，我再帮你核实。")),
      ];
    case "no_reply":
      return [
        thinking("正在判断是否需要回复"),
        finish(() => ({
          outcome: "no_reply",
          reason: "当前消息已经由客服处理",
          summary: "无需再次回复",
        })),
      ];
  }
}

function thinking(summary: string): ThinkingStep {
  return { kind: "thinking", summary };
}

function tool(
  name: string,
  summary: string,
  input: unknown,
  output: unknown,
  approvalMode: "auto" | "human" = "auto",
): ToolStep {
  return { approvalMode, input, kind: "tool", name, output, summary };
}

function clarification(
  summary: string,
  input: AgentTurnKfClarificationInput,
): ClarificationStep {
  return { input, kind: "clarification", summary };
}

function finish(input: FinishStep["input"]): FinishStep {
  return { input, kind: "finish" };
}

function replyFinish(summary: string, text: string): AgentTurnFinishInput {
  return {
    outcome: "reply",
    reply: {
      segments: [{ text, type: "text" }],
    },
    summary,
  };
}

function resolveClarificationResponse(
  input: AgentTurnKfClarificationInput,
  request: ResolveAgentTurnKfClarificationRequest,
) {
  if (request.type === "suggestion") {
    const suggestion = input.suggestions?.find(
      (item) => item.id === request.suggestionId,
    );

    if (!suggestion) {
      throw new BadRequestError(
        "AGENT_TURN_CLARIFICATION_SUGGESTION_NOT_FOUND",
        "澄清建议不存在",
      );
    }

    return {
      instruction: suggestion.instruction,
      provenance: {
        suggestionId: suggestion.id,
        type: "suggestion" as const,
      },
    };
  }

  const instruction = request.instruction.trim();
  if (!instruction) {
    throw new BadRequestError(
      "AGENT_TURN_CLARIFICATION_INSTRUCTION_REQUIRED",
      "请输入处理指令",
    );
  }

  if (
    request.basedOnSuggestionId &&
    !input.suggestions?.some((item) => item.id === request.basedOnSuggestionId)
  ) {
    throw new BadRequestError(
      "AGENT_TURN_CLARIFICATION_SUGGESTION_NOT_FOUND",
      "澄清建议不存在",
    );
  }

  return {
    instruction,
    provenance: request.basedOnSuggestionId
      ? {
          suggestionId: request.basedOnSuggestionId,
          type: "edited_suggestion" as const,
        }
      : {
          type: "free_text" as const,
        },
  };
}
