import {
  isWorkflowAiCollectExecutionConfigComplete,
  type WorkflowExecutionNode,
  type WorkflowMessage,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";

export const WORKFLOW_AI_COLLECT_QUIET_PERIOD_MS = 30_000;
export const WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE = "collect-fields" as const;

export type WorkflowAiCollectMessageCursor = {
  id: number;
  timestamp: number;
};

export type WorkflowAiCollectConversation = {
  conversationId: number;
};

export type WorkflowAiCollectMessageBatch = {
  cursor: WorkflowAiCollectMessageCursor | null;
  hasMore: boolean;
  messages: WorkflowMessage[];
};

export interface WorkflowAiCollectConversationPort {
  readCustomerMessages(input: {
    after: WorkflowAiCollectMessageCursor | null;
    seatId: number;
    thirdExternalUserId: string;
    uid: number;
    until: Date;
  }): Promise<WorkflowAiCollectMessageBatch>;
  resolveConversation(input: {
    seatId: number;
    thirdExternalUserId: string;
    uid: number;
  }): Promise<WorkflowAiCollectConversation>;
  sendOpeningMessage(input: {
    idempotencyKey: string;
    message: string;
    seatId: number;
    signal: AbortSignal;
    thirdExternalUserId: string;
    uid: number;
  }): Promise<void>;
}

export interface WorkflowConversationDirectivePort {
  activate(input: {
    bizId: string;
    bizInfo: string;
    conversationId: number;
    expiresAt: Date;
    limitRound: number;
    payload: string;
    priority: number;
    signal: AbortSignal;
    type: typeof WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE;
    uid: number;
  }): Promise<void>;
  disable(input: {
    bizId: string;
    reason: string;
    signal: AbortSignal;
    type: typeof WORKFLOW_AI_COLLECT_DIRECTIVE_TYPE;
    uid: number;
  }): Promise<void>;
}

export function createWorkflowAiCollectBizId(taskId: string) {
  const bizId = `workflow-task:${taskId}`;
  if (bizId.length > 64) {
    throw aiCollectConfigError("AI Collect Task ID cannot form a valid directive bizId");
  }
  return bizId;
}

export function getWorkflowAiCollectTimeoutAt(node: WorkflowExecutionNode, startedAt: Date) {
  if (node.kind !== "ai-collect" || !isWorkflowAiCollectExecutionConfigComplete(node.config)) {
    return null;
  }
  const config = node.config;
  if (!("timeout" in config)) return null;
  const multiplier = config.timeout.unit === "hour" ? 3_600_000 : 60_000;
  return new Date(startedAt.getTime() + config.timeout.duration * multiplier);
}

export function renderWorkflowAiCollectDirective(
  node: WorkflowExecutionNode,
  collected: Readonly<Record<string, unknown>>,
) {
  if (node.kind !== "ai-collect" || !isWorkflowAiCollectExecutionConfigComplete(node.config)) {
    throw aiCollectConfigError("AI Collect execution config failed schema validation");
  }
  const fields = node.config.fields
    .filter(field => !(field.id in collected))
    .map(field => `- ${field.name}`);
  return [
    "当前临时沟通目标：在自然对话中请客户提供以下资料。",
    fields.join("\n"),
    [
      "沟通要求：",
      "- 先回答客户当前的问题；若还缺资料，在同一轮回复末尾用一句口语请对方提供最相关的一项，不要把这段指引读给客户。",
      "- 还缺多项时按对话进展分步了解，一轮只跟进一项，不要一次问完。",
      "- 客户已经明确说过的内容不要再问；说得含糊或不完整时，用对方听得懂的方式请补充，不要要求特定格式，也不要念出校验规则。",
      "- 客户明确表示暂时无法提供或拒绝提供时，礼貌理解并继续帮当前的忙，不要反复催要。",
    ].join("\n"),
  ].join("\n\n");
}

export function isWorkflowAiCollectComplete(
  node: WorkflowExecutionNode,
  collected: Readonly<Record<string, unknown>>,
) {
  return node.kind === "ai-collect"
    && isWorkflowAiCollectExecutionConfigComplete(node.config)
    && node.config.fields.every(field => field.id in collected);
}

function aiCollectConfigError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_AI_COLLECT_CONFIG_INVALID",
    "资料收集配置不可用，流程已停止",
    { diagnosticMessage },
  );
}
