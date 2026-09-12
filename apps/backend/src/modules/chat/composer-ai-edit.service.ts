import type {
  ComposerAiEditAction,
  ComposerAiEditRequest,
  ComposerAiEditResponse,
} from "@chatai/contracts";
import { VOLCENGINE_ARK_AI_EDIT_MODEL } from "@chatai/llm";
import type { WorkbenchRepository } from "./workbench-repository.js";
import type { AuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import {
  BadGatewayError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";

const VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MAX_COMPOSER_TEXT_LENGTH = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

const actionInstructions: Record<ComposerAiEditAction, string> = {
  custom: "严格按照客服给出的补充要求改写",
  polish: "润色表达，使语句自然、清晰、顺畅，同时保持原意",
  polite: "改写得更礼貌、亲切、有服务意识，避免生硬或过度承诺",
  professional: "改写得更专业、准确、可信，适合私域客服直接发送",
  shorten: "在保留关键信息和原意的前提下压缩表达，使内容更简洁",
};

type ComposerAiEditServiceOptions = {
  apiKey?: string;
  fetch?: typeof fetch;
  model?: string;
  repository: WorkbenchRepository;
  timeoutMs?: number;
};

export class ComposerAiEditService {
  private readonly apiKey?: string;
  private readonly fetch: typeof fetch;
  private readonly model: string;
  private readonly repository: WorkbenchRepository;
  private readonly timeoutMs: number;

  constructor(options: ComposerAiEditServiceOptions) {
    this.apiKey = options.apiKey?.trim();
    this.fetch = options.fetch ?? globalThis.fetch;
    this.model = options.model ?? VOLCENGINE_ARK_AI_EDIT_MODEL;
    this.repository = options.repository;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async rewrite(
    subUserId: string,
    scope: AuthenticatedWorkbenchScope,
    input: ComposerAiEditRequest,
  ): Promise<ComposerAiEditResponse> {
    await this.assertOperableConversation(subUserId, scope, input.conversationId);

    if (!this.apiKey) {
      throw new ServiceUnavailableError(
        "COMPOSER_AI_EDIT_UNAVAILABLE",
        "AI 助写暂未配置",
      );
    }

    const instruction = buildInstruction(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(
        `${VOLCENGINE_ARK_BASE_URL}/chat/completions`,
        {
          body: JSON.stringify({
            max_tokens: 1000,
            messages: [
              {
                content: [
                  "你是私域客服的中文文案编辑助手。",
                  "只输出改写后的文本，不解释过程，不使用 Markdown，不添加引号。",
                  "保留原文事实、数字、专有名词和业务承诺，不编造信息。",
                  "不要代替客服新增优惠、时效、退款或售后承诺。",
                  instruction,
                ].join("\n"),
                role: "system",
              },
              {
                content: `<original_text>\n${input.content}\n</original_text>`,
                role: "user",
              },
            ],
            model: this.model,
            temperature: 0.3,
          }),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new BadGatewayError(
          "COMPOSER_AI_EDIT_UPSTREAM_FAILED",
          "AI 助写暂时不可用",
          { status: response.status },
        );
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new BadGatewayError(
          "COMPOSER_AI_EDIT_RESPONSE_EMPTY",
          "AI 助写暂时不可用",
        );
      }

      if (content.length > MAX_COMPOSER_TEXT_LENGTH) {
        throw new BadGatewayError(
          "COMPOSER_AI_EDIT_RESPONSE_TOO_LONG",
          "AI 助写结果超过字数限制",
        );
      }

      return { content };
    } catch (error) {
      if (error instanceof BadGatewayError) {
        throw error;
      }

      throw new BadGatewayError(
        controller.signal.aborted
          ? "COMPOSER_AI_EDIT_TIMEOUT"
          : "COMPOSER_AI_EDIT_REQUEST_FAILED",
        "AI 助写暂时不可用",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async assertOperableConversation(
    subUserId: string,
    scope: AuthenticatedWorkbenchScope,
    conversationId: string,
  ) {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    const canAccess = await this.repository.canAccessSeat(
      { ...scope, subUserId },
      conversation.seatId,
    );

    if (!canAccess) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }

    const seat = await this.repository.getSeatOperateScope(conversation.seatId);

    if (!seat || seat.hostSubUserId !== subUserId) {
      throw new ForbiddenError("SEAT_NOT_TAKEN_OVER", "当前账号尚未由你接管");
    }
  }
}

function buildInstruction(input: ComposerAiEditRequest) {
  if (input.action !== "custom") {
    return actionInstructions[input.action];
  }

  return `${actionInstructions.custom}：${input.instruction ?? "优化表达"}`;
}
