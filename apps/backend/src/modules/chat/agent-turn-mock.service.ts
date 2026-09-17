import { randomUUID } from "node:crypto";
import type {
  AgentTurnEvent,
  AgentTurnEventEnvelope,
  AgentTurnFinishInput,
  AgentTurnKfClarificationInput,
  AgentTurnMockScenario,
  LatestAgentTurnResponse,
  ResolveAgentTurnDecisionRequest,
  ResolveAgentTurnKfClarificationRequest,
  StartAgentTurnMockRequest,
  StartAgentTurnResponse,
} from "@chatai/contracts";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors.js";

const DEFAULT_STEP_DELAY_MS = 700;

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
    operatorInstruction?: string;
    rejected: boolean;
  }) => AgentTurnFinishInput;
  kind: "finish";
};

type ScenarioStep = ToolStep | ClarificationStep | FinishStep;

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
  callIndex: number;
  conversationId: string;
  events: AgentTurnEventEnvelope[];
  id: string;
  ownerSubUserId: string;
  pendingClarification?: PendingClarification;
  pendingDecision?: PendingDecision;
  clarificationInstruction?: string;
  operatorInstruction?: string;
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

  getLatest(
    ownerSubUserId: string,
    conversationId: string,
  ): LatestAgentTurnResponse {
    let latest: TurnRecord | undefined;
    for (const record of this.turns.values()) {
      if (
        record.ownerSubUserId === ownerSubUserId &&
        record.conversationId === conversationId
      ) {
        latest = record;
      }
    }

    if (!latest) return null;

    return {
      events: [...latest.events],
      status: toSnapshotStatus(latest.status),
      turnId: latest.id,
    };
  }

  start(
    ownerSubUserId: string,
    request: StartAgentTurnMockRequest,
  ): StartAgentTurnResponse {
    this.releaseSupersededTurns(ownerSubUserId, request.conversationId);

    const turnId = `turn-${randomUUID()}`;
    const record: TurnRecord = {
      callIndex: 0,
      conversationId: request.conversationId,
      events: [],
      id: turnId,
      ownerSubUserId,
      rejected: false,
      sequence: 0,
      status: "running",
      stepDelayMs: request.stepDelayMs ?? DEFAULT_STEP_DELAY_MS,
      stepIndex: 0,
      steps: createScenarioSteps(request.scenario),
      subscribers: new Set(),
      timers: new Set(),
    };

    this.turns.set(turnId, record);
    this.emit(record, {
      trigger: request.trigger,
      type: "turn.started",
    });
    this.schedule(record, () => this.advance(record));

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

    const instruction =
      request.action === "redirect" ? request.instruction.trim() : undefined;

    if (request.action === "redirect" && !instruction) {
      throw new BadRequestError(
        "AGENT_TURN_REDIRECT_INSTRUCTION_REQUIRED",
        "请输入处理指令",
      );
    }

    record.pendingDecision = undefined;
    record.status = "running";
    this.emit(record, {
      action: request.action,
      callId: pending.callId,
      decisionId,
      ...(instruction ? { instruction } : {}),
      type: "decision.resolved",
    });

    if (request.action !== "approve") {
      record.rejected = true;
      record.operatorInstruction = instruction;
      this.emit(record, {
        callId: pending.callId,
        output: instruction
          ? { instruction, reason: "operator_redirected" }
          : { reason: "operator_rejected" },
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
      this.schedule(record, () => this.advance(record));
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

    this.cancelRecord(record);

    return { ok: true as const };
  }

  dispose() {
    for (const record of [...this.turns.values()]) {
      this.releaseTurn(record);
    }
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
      operatorInstruction: record.operatorInstruction,
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
          {
            id: "redirect",
            label: "拒绝并告知其他方式",
            tone: "quiet",
          },
          { id: "reject", label: "拒绝", tone: "quiet" },
          { id: "approve", label: "继续", tone: "primary" },
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
      this.schedule(record, () => this.advance(record));
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
    this.clearWorkTimers(record);
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
      if (
        this.turns.get(record.id) !== record ||
        isTerminalStatus(record.status)
      ) {
        return;
      }
      task();
    }, delayMs);
    record.timers.add(timer);
  }

  private getOwnedTurn(turnId: string, ownerSubUserId: string) {
    const record = this.turns.get(turnId);

    if (!record || record.ownerSubUserId !== ownerSubUserId) {
      throw new NotFoundError("AGENT_TURN_NOT_FOUND", "Agent Turn 不存在");
    }

    return record;
  }

  private releaseSupersededTurns(
    ownerSubUserId: string,
    conversationId: string,
  ) {
    for (const record of [...this.turns.values()]) {
      if (
        record.ownerSubUserId !== ownerSubUserId ||
        record.conversationId !== conversationId
      ) {
        continue;
      }

      if (!isTerminalStatus(record.status)) {
        this.cancelRecord(record);
      }
      this.releaseTurn(record);
    }
  }

  private cancelRecord(record: TurnRecord) {
    this.clearWorkTimers(record);

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
  }

  private clearWorkTimers(record: TurnRecord) {
    for (const timer of record.timers) {
      clearTimeout(timer);
    }
    record.timers.clear();
  }

  private releaseTurn(record: TurnRecord) {
    this.clearWorkTimers(record);
    record.subscribers.clear();
    if (this.turns.get(record.id) === record) {
      this.turns.delete(record.id);
    }
  }
}

function isTerminalStatus(status: TurnStatus) {
  return status === "completed" || status === "cancelled" || status === "failed";
}

function toSnapshotStatus(status: TurnStatus) {
  if (status === "awaiting_decision" || status === "awaiting_clarification") {
    return "waiting_for_human" as const;
  }

  return status;
}

function createScenarioSteps(scenario: AgentTurnMockScenario): ScenarioStep[] {
  switch (scenario) {
    case "knowledge_reply":
      return [
        tool("knowledge.search", "正在查询知识库", { query: "护肤产品使用方法" }, {
          items: [{ title: "产品使用说明", excerpt: "建议洁面后早晚使用" }],
        }),
        finish(() => replyFinish("已起草回复", "建议洁面后早晚使用，如有不适请先暂停使用。")),
      ];
    case "order_reply":
      return [
        tool("order.query", "正在查询订单", { orderNumber: "MOCK-20260916-001" }, {
          orderNumber: "MOCK-20260916-001",
          status: "已签收",
        }),
        finish(() => replyFinish("已起草回复", "订单已经签收，请问具体遇到了什么售后问题？")),
      ];
    case "order_binding_approval":
      return [
        tool(
          "order.bind",
          "绑定订单",
          { orderId: "20984239842348" },
          { bound: true, orderId: "20984239842348" },
          "human",
        ),
        finish(({ operatorInstruction, rejected }) => {
          if (operatorInstruction) {
            return replyFinish(
              "已根据客服指令重新规划",
              "我会按照你补充的处理方式重新核对订单信息。",
            );
          }

          return rejected
            ? replyFinish("已起草回复", "本次订单绑定未执行，如需继续请补充处理方式。")
            : replyFinish("已起草回复", "订单已经完成绑定，可以继续处理后续业务。");
        }),
      ];
    case "after_sales_approval":
      return [
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
        finish(({ rejected }) => rejected
          ? replyFinish("已起草回复", "本次退款申请暂未执行，如需继续处理请告诉我。")
          : replyFinish("已起草回复", "退款申请已经提交，后续进度会及时同步给你。")),
      ];
    case "operator_clarification":
      return [
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
        tool(
          "order.query.mock_failure",
          "正在查询订单",
          { orderNumber: "MOCK-ERROR" },
          null,
        ),
        tool("knowledge.search", "正在查询售后说明", { query: "无法查询订单时如何处理" }, {
          items: [{ title: "订单查询异常处理", excerpt: "请客户稍后重试或补充订单截图" }],
        }),
        finish(() => replyFinish("已起草回复", "暂时没有查到订单信息，麻烦提供订单截图，我再帮你核实。")),
      ];
    case "no_reply":
      return [
        finish(() => ({
          outcome: "no_reply",
          reason: "当前消息已经由客服处理",
          summary: "无需再次回复",
        })),
      ];
  }
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
