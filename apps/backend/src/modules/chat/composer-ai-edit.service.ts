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
  apologetic:
    "改写为真诚致歉的语气，换位共情客户的不便，并展现积极协助的态度；严禁擅自承诺退款、赔付、免单或具体处理结果",
  friendly:
    "改写得更友好、亲切、有耐心，有服务意识但不过度热情，不堆砌夸张标点或无意义拟声词",
  lengthen:
    "在不改变原意、不新增事实或承诺的前提下，适度补充必要的关怀、上下文说明或指引，使表达更完整，避免空洞套话",
  playful:
    "改写得更轻松、俏皮、有亲和力，可自然使用温和语气词（如‘哈’、‘啦’、‘哦’），但不油腻、不使用小众网络烂梗，确保信息准确",
  polish:
    "润色文案，纠正错别字和语病，使语句通顺自然，符合微信即时沟通的亲和力与对话感，避免生硬官腔",
  professional:
    "改写得更专业、严谨、条理清晰，适合私域客服使用；避免使用客户听不懂的内部术语或黑话",
  shorten:
    "在保留核心信息、业务结论和基本礼貌的前提下精炼文字，去除冗余修饰，避免语气生硬冷漠",
};

const actionTemperatures: Record<ComposerAiEditAction, number> = {
  apologetic: 0.2,
  friendly: 0.3,
  lengthen: 0.3,
  playful: 0.4,
  polish: 0.2,
  professional: 0.2,
  shorten: 0.2,
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
                content: buildSystemPrompt(input),
                role: "system",
              },
              {
                content: buildRewriteContext(input),
                role: "user",
              },
            ],
            model: this.model,
            temperature: actionTemperatures[input.action] ?? 0.3,
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
  return actionInstructions[input.action];
}

function buildSystemPrompt(input: ComposerAiEditRequest) {
  const taskInstruction = isFullTextRewrite(input)
    ? "你的任务是完整改写用户选中的全部草稿文本，可以调整整体句式、语序和表达，但必须保持原意。"
    : "你的任务是生成一段可直接替换选中文本的内容，不是重写整句话。";

  return [
    "你是私域微信客服的文案改写助手。",
    taskInstruction,
    "只输出改写结果，不要输出解释、标签、引号、Markdown 或‘改写后：’等前缀。",
    "保持原文事实、数字、专有名词、微信表情代码和变量占位符，不得新增优惠、时效、退款、赔付或售后承诺。",
    `改写风格：${buildInstruction(input)}`,
  ].join("\n");
}

function buildRewriteContext(input: ComposerAiEditRequest) {
  if (isFullTextRewrite(input)) {
    return [
      "<original_text>",
      input.content,
      "</original_text>",
      "完整改写以上全部文本，最终只输出改写后的完整文本。",
    ].join("\n");
  }

  return [
    `<before>${input.contextBefore}</before>`,
    `<replace>${input.content}</replace>`,
    `<after>${input.contextAfter}</after>`,
    "before 和 after 是不可修改的上下文，你的输出会直接插入二者之间。",
    "保持 replace 在原句中的语法角色：原来是词组、谓语、宾语或半句话，改写后仍保持同类结构；不要擅自增加主语、称呼、开场或收尾。",
    "不要重复 before 或 after 中已有的内容，也不要补写上下文已有的标点。",
    "回答前先在内部检查 before + 输出 + after 是否构成自然、通顺的中文，最终只输出替换文本。",
  ].join("\n");
}

function isFullTextRewrite(input: ComposerAiEditRequest) {
  return input.rewriteMode === "full";
}
