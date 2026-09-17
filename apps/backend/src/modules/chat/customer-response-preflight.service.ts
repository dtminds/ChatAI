import type {
  CustomerResponseAssessment,
  CustomerResponsePreflightRequest,
  CustomerResponsePreflightResponse,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { CustomerResponseAssessmentSchema } from "@chatai/contracts";
import { VOLCENGINE_ARK_CUSTOMER_RESPONSE_PREFLIGHT_MODEL } from "@chatai/llm";
import { Value } from "@sinclair/typebox/value";
import { BadRequestError } from "../../shared/errors.js";
import { noopLogger, type AppLogger } from "../../shared/logger.js";
import type { WorkbenchRepository } from "./workbench-repository.js";

const VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const NATURAL_CONVERSATION_GAP_MS = 12 * 60 * 60 * 1_000;
const CONTEXT_LOOKBACK_MESSAGE_LIMIT = 100;
const MAX_CONTEXT_TEXT_CHARACTERS = 12_000;
const MAX_CONTEXT_IMAGES = 4;
const REQUEST_TIMEOUT_MS = 3_000;

type PreflightContentPart =
  | { text: string; type: "text" }
  | { image_url: { url: string }; type: "image_url" };

type PreflightContextMessage = {
  content: PreflightContentPart[];
  messageId: string;
  occurredAt: number;
  role: "assistant" | "user";
};

type CustomerResponsePreflightServiceOptions = {
  apiKey?: string;
  fetch?: typeof fetch;
  logger?: AppLogger;
  model?: string;
  repository: Pick<WorkbenchRepository, "listMessageContext">;
  timeoutMs?: number;
};

const fallbackAssessment: CustomerResponseAssessment = {
  direction: "handle_request",
  intentSummary: "客户发来新的消息",
  outcome: "response_needed",
};

export class CustomerResponsePreflightService {
  private readonly apiKey?: string;
  private readonly fetch: typeof fetch;
  private readonly logger: AppLogger;
  private readonly model: string;
  private readonly repository: CustomerResponsePreflightServiceOptions["repository"];
  private readonly timeoutMs: number;

  constructor(options: CustomerResponsePreflightServiceOptions) {
    this.apiKey = options.apiKey?.trim();
    this.fetch = options.fetch ?? globalThis.fetch;
    this.logger = options.logger ?? noopLogger;
    this.model =
      options.model ?? VOLCENGINE_ARK_CUSTOMER_RESPONSE_PREFLIGHT_MODEL;
    this.repository = options.repository;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async assess(
    uid: number,
    input: CustomerResponsePreflightRequest,
    requestSignal?: AbortSignal,
  ): Promise<CustomerResponsePreflightResponse> {
    const messageContext = await this.repository.listMessageContext({
      after: 0,
      before: CONTEXT_LOOKBACK_MESSAGE_LIMIT,
      conversationId: input.conversationId,
      messageId: input.triggerMessageId,
      uid,
    });
    const triggerMessage = messageContext.messages.find(
      (message) => String(message.seq) === input.triggerMessageId,
    );

    if (!triggerMessage) {
      throw new BadRequestError(
        "CUSTOMER_RESPONSE_PREFLIGHT_MESSAGE_NOT_FOUND",
        "触发消息不存在",
      );
    }

    if (triggerMessage.senderType !== "customer" || triggerMessage.isRevoked) {
      throw new BadRequestError(
        "CUSTOMER_RESPONSE_PREFLIGHT_MESSAGE_INVALID",
        "只能对客户消息执行回应预判",
      );
    }

    const context = buildCustomerResponsePreflightContext(
      messageContext.messages,
      input.triggerMessageId,
    );

    if (!this.apiKey || context.length === 0) {
      return buildResponse(input, fallbackAssessment, "fallback");
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const signal = requestSignal
      ? AbortSignal.any([requestSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await this.fetch(
        `${VOLCENGINE_ARK_BASE_URL}/chat/completions`,
        {
          body: JSON.stringify({
            max_tokens: 160,
            messages: buildModelMessages(context),
            model: this.model,
            response_format: { type: "json_object" },
            temperature: 0,
          }),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal,
        },
      );

      if (!response.ok) {
        throw new Error(`upstream status ${response.status}`);
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const assessment = parseAssessment(
        payload.choices?.[0]?.message?.content,
      );

      if (!assessment) {
        throw new Error("invalid preflight response");
      }

      return buildResponse(input, assessment, "model");
    } catch (error) {
      this.logger.warn(
        {
          conversationId: input.conversationId,
          error: error instanceof Error ? error.message : String(error),
          triggerMessageId: input.triggerMessageId,
        },
        "Customer response preflight fell back to generic confirmation",
      );
      return buildResponse(input, fallbackAssessment, "fallback");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildCustomerResponsePreflightContext(
  messages: WorkbenchMessageDto[],
  triggerMessageId: string,
): PreflightContextMessage[] {
  const normalized = messages
    .filter((message) => !message.isRevoked && message.senderType !== "system")
    .map(normalizeMessage)
    .filter((message): message is PreflightContextMessage => Boolean(message));
  const triggerIndex = normalized.findIndex(
    (message) => message.messageId === triggerMessageId,
  );

  if (triggerIndex < 0 || normalized[triggerIndex]?.role !== "user") {
    return [];
  }

  let segmentStart = triggerIndex;
  while (segmentStart > 0) {
    const current = normalized[segmentStart];
    const previous = normalized[segmentStart - 1];

    if (!current || !previous) break;
    if (current.occurredAt - previous.occurredAt > NATURAL_CONVERSATION_GAP_MS) {
      break;
    }

    segmentStart -= 1;
  }

  return applyContextBudget(
    normalized.slice(segmentStart, triggerIndex + 1),
    triggerMessageId,
  );
}

function normalizeMessage(
  message: WorkbenchMessageDto,
): PreflightContextMessage | undefined {
  const occurredAt = message.createdAt ?? 0;
  const content = normalizeMessageContent(message);

  if (!content.length || occurredAt <= 0) {
    return undefined;
  }

  return {
    content,
    messageId: String(message.seq),
    occurredAt,
    role: message.senderType === "customer" ? "user" : "assistant",
  };
}

function normalizeMessageContent(
  message: WorkbenchMessageDto,
): PreflightContentPart[] {
  const content = message.content;
  const text = (...values: unknown[]) =>
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");
  const textPart = (value: string): PreflightContentPart[] =>
    value ? [{ text: value, type: "text" }] : [];
  const imagePart = (value: unknown): PreflightContentPart[] => {
    const url = typeof value === "string" ? value.trim() : "";
    return url
      ? [{ image_url: { url }, type: "image_url" }]
      : [];
  };

  switch (message.contentType) {
    case "text":
      return textPart(text(content.text));
    case "quote": {
      const quoted = isRecord(content.quotedMessage)
        ? content.quotedMessage
        : undefined;
      return [
        ...textPart(
          text(
            content.text,
            quoted
              ? `[引用 ${text(
                  quoted.senderName,
                  quoted.text,
                  quoted.title,
                  quoted.fallbackText,
                )}]`
              : "",
          ),
        ),
        ...(quoted ? imagePart(quoted.imageUrl) : []),
      ];
    }
    case "voice":
      return textPart(text(content.transVoiceText));
    case "image":
      return [
        ...imagePart(content.fileUrl),
        ...textPart(text(content.alt)),
      ];
    case "emotion":
      return imagePart(content.fileUrl);
    case "video":
      return [
        ...imagePart(content.coverImageUrl),
        ...textPart("[视频]"),
      ];
    case "file":
      return textPart(text("[文件]", content.fileName, content.extension));
    case "h5":
      return textPart(
        text("[链接]", content.title, content.description, content.url),
      );
    case "contact-card":
      return textPart(text("[联系人]", content.name, content.company));
    case "location":
      return textPart(text("[位置]", content.title, content.address));
    case "sphfeed":
      return [
        ...imagePart(content.imageUrl),
        ...textPart(
          text("[视频号]", content.title, content.description, content.url),
        ),
      ];
    case "mini-program":
      return [
        ...imagePart(content.coverImageUrl),
        ...textPart(text("[小程序]", content.appName, content.title)),
      ];
    case "chatrecord":
      return textPart(
        text(
          "[聊天记录]",
          content.msgTitle,
          Array.isArray(content.msgContent)
            ? content.msgContent.filter((item) => typeof item === "string").join(" ")
            : "",
        ),
      );
    case "solitaire":
      return textPart(text("[接龙]", content.title, content.example, content.tail));
    case "redpacket":
      return textPart(text("[红包]", content.title, content.description));
    default:
      return [];
  }
}

function applyContextBudget(
  messages: PreflightContextMessage[],
  triggerMessageId: string,
) {
  const lastAgentIndex = findLastIndex(
    messages,
    (message) => message.role === "assistant",
  );
  const protectedStart = Math.min(lastAgentIndex + 1, messages.length - 1);
  const selected: PreflightContextMessage[] = [];
  let textCharacters = 0;
  let imageCount = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;

    const required =
      index >= protectedStart || message.messageId === triggerMessageId;
    const nextContent: PreflightContentPart[] = [];

    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content[partIndex];
      if (!part) continue;

      if (part.type === "image_url") {
        if (imageCount < MAX_CONTEXT_IMAGES) {
          nextContent.unshift(part);
          imageCount += 1;
        }
        continue;
      }

      const remaining = MAX_CONTEXT_TEXT_CHARACTERS - textCharacters;
      if (remaining <= 0 && !required) continue;
      const normalizedText = required && remaining <= 0
        ? part.text.slice(0, 500)
        : part.text.slice(0, Math.max(0, remaining));

      if (normalizedText) {
        nextContent.unshift({ text: normalizedText, type: "text" });
        textCharacters += normalizedText.length;
      }
    }

    if (nextContent.length) {
      selected.unshift({ ...message, content: nextContent });
    }

    if (!required && textCharacters >= MAX_CONTEXT_TEXT_CHARACTERS) {
      break;
    }
  }

  return selected;
}

function buildModelMessages(context: PreflightContextMessage[]) {
  return [
    {
      content: [
        "你是私域客服场景的客户回应预判器。",
        "你只判断当前最新客户消息是否需要客服继续回应，以及下一步回应方向。",
        "不要规划 Agent、工具、技能、SOP 或具体执行步骤。",
        "只有寒暄结束、单纯感谢、确认已解决且没有新增诉求时，才输出 no_response_needed。",
        "存在问题、投诉、转人工、查询、办理、信息不完整或无法确定时，输出 response_needed。",
        "direction 只能是 provide_response、request_information、handle_request。",
        "provide_response 表示可以直接回答、解释或安抚。",
        "request_information 表示必须先向客户追问必要信息。",
        "handle_request 表示需要先查询、核实或办理业务。",
        "只输出合法 JSON，不要输出 Markdown。",
        "response_needed 格式：{\"outcome\":\"response_needed\",\"direction\":\"handle_request\",\"intentSummary\":\"客户希望查询订单物流状态\"}",
        "no_response_needed 格式：{\"outcome\":\"no_response_needed\",\"reasonSummary\":\"客户已确认处理结果\"}",
        "摘要使用一句简短中文，不超过 30 个汉字，不补充会话中不存在的事实。",
      ].join("\n"),
      role: "system",
    },
    ...context.map((message) => ({
      content: message.content,
      role: message.role,
    })),
  ];
}

function parseAssessment(content: string | undefined) {
  if (!content?.trim()) return undefined;

  try {
    const parsed: unknown = JSON.parse(extractJsonObject(content));
    return Value.Check(CustomerResponseAssessmentSchema, parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function buildResponse(
  input: CustomerResponsePreflightRequest,
  assessment: CustomerResponseAssessment,
  source: CustomerResponsePreflightResponse["source"],
): CustomerResponsePreflightResponse {
  return {
    assessment,
    conversationId: input.conversationId,
    evaluatedThroughMessageId: input.triggerMessageId,
    source,
  };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) return index;
  }

  return -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
