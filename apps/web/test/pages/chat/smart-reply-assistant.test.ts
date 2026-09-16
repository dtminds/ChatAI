import { describe, expect, it } from "vitest";
import {
  hasBlockingSmartReplyAssistantTurn,
  resolveSmartReplyAssistantTurn,
} from "@/pages/chat/lib/smart-reply-assistant";
import { SMART_REPLY_SEMANTIC_WAIT_TIMEOUT_MS } from "@/pages/chat/api/smart-reply-adapter";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("smart reply assistant turn", () => {
  it("keeps a ready suggestion active and blocks another message", () => {
    const first = createMessage(1, "第一条");
    const second = createMessage(2, "第二条");
    const input = {
      activeMessageKey: "1",
      messages: [first, second],
      suggestions: {
        "1": {
          assistantName: "智能助手",
          content: "建议回复",
          generateStatus: 2,
          status: "ready" as const,
        },
      },
    };

    expect(resolveSmartReplyAssistantTurn(input)).toMatchObject({
      lookupKey: "1",
      phase: "confirmation",
      showComposer: true,
    });
    expect(hasBlockingSmartReplyAssistantTurn(input, "2")).toBe(true);
  });

  it("projects an attachment-only suggestion into the confirmation composer", () => {
    const message = createMessage(1, "最近有什么活动吗？");

    expect(
      resolveSmartReplyAssistantTurn({
        activeMessageKey: "1",
        messages: [message],
        suggestions: {
          "1": {
            assistantName: "智能助手",
            content: "",
            genAnswer:
              '[{"fileUrl":"s5/msg/product.jpg","msgtype":"image"}]',
            generateStatus: 2,
            pollComplete: true,
            status: "ready",
          },
        },
      }),
    ).toMatchObject({
      isComposerEditable: true,
      lookupKey: "1",
      phase: "confirmation",
      showComposer: true,
    });
  });

  it("keeps the previous content visible but locked while regenerating", () => {
    const message = createMessage(1, "问题");

    expect(
      resolveSmartReplyAssistantTurn({
        activeMessageKey: "1",
        messages: [message],
        pending: { "1": true },
        suggestions: {
          "1": {
            assistantName: "智能助手",
            content: "旧建议",
            generateStatus: 2,
            status: "ready",
          },
        },
      }),
    ).toMatchObject({
      isComposerEditable: false,
      phase: "thinking",
      showComposer: true,
    });
  });

  it("keeps an attachment-only suggestion visible while regenerating", () => {
    const message = createMessage(1, "问题");

    expect(
      resolveSmartReplyAssistantTurn({
        activeMessageKey: "1",
        messages: [message],
        pending: { "1": true },
        suggestions: {
          "1": {
            assistantName: "智能助手",
            content: "",
            genAnswer:
              '[{"fileUrl":"s5/msg/product.jpg","msgtype":"image"}]',
            generateStatus: 2,
            pollComplete: true,
            status: "ready",
          },
        },
      }),
    ).toMatchObject({
      isComposerEditable: false,
      phase: "thinking",
      showComposer: true,
    });
  });

  it("allows a newer customer message to continue semantic waiting", () => {
    const first = createMessage(1, "我要退款");
    const second = createMessage(2, "订单号 123");
    const input = {
      activeMessageKey: "1",
      messages: [first, second],
      suggestions: {
        "1": {
          assistantName: "智能助手",
          content: "",
          createdAt: Date.now(),
          generateStatus: 5,
        },
      },
    };

    expect(resolveSmartReplyAssistantTurn(input)).toBeUndefined();
    expect(hasBlockingSmartReplyAssistantTurn(input, "2")).toBe(false);
  });

  it.each([
    {
      expectedLabel: "生成失败：model_error",
      expectedPhase: "failed",
      suggestion: {
        assistantName: "智能助手",
        content: "",
        failReason: "model_error",
        generateStatus: 3,
      },
    },
    {
      expectedLabel: "这条消息信息不足，已跳过话术推荐",
      expectedPhase: "skipped",
      suggestion: {
        assistantName: "智能助手",
        content: "",
        failReason: "content_incomplete_skip",
        generateStatus: 3,
      },
    },
    {
      expectedLabel: "已跳过话术推荐",
      expectedReason: "命中人工处理规则",
      expectedPhase: "skipped",
      suggestion: {
        assistantName: "智能助手",
        content: "",
        failReason: "命中人工处理规则",
        generateStatus: 4,
      },
    },
  ])(
    "projects terminal smart reply state as $expectedPhase",
    ({ expectedLabel, expectedPhase, expectedReason, suggestion }) => {
      const message = createMessage(1, "问题");

      expect(
        resolveSmartReplyAssistantTurn({
          activeMessageKey: "1",
          messages: [message],
          suggestions: { "1": suggestion },
        }),
      ).toMatchObject({
        label: expectedLabel,
        phase: expectedPhase,
        ...(expectedReason ? { reason: expectedReason } : {}),
        showComposer: false,
      });

      if (expectedPhase === "skipped") {
        expect(
          hasBlockingSmartReplyAssistantTurn(
            {
              activeMessageKey: "1",
              messages: [message, createMessage(2, "下一条消息")],
              suggestions: { "1": suggestion },
            },
            "2",
          ),
        ).toBe(false);
      }
    },
  );

  it("projects an expired semantic wait as skipped", () => {
    const message = createMessage(1, "问题");
    const createdAt = Date.parse("2026-09-15T10:00:00+08:00");

    expect(
      resolveSmartReplyAssistantTurn({
        activeMessageKey: "1",
        messages: [message],
        now: createdAt + SMART_REPLY_SEMANTIC_WAIT_TIMEOUT_MS,
        suggestions: {
          "1": {
            assistantName: "智能助手",
            content: "",
            createdAt,
            generateStatus: 5,
          },
        },
      }),
    ).toMatchObject({
      label: "语义不完整，已跳过话术推荐",
      phase: "skipped",
      showComposer: false,
    });
  });

  it("does not replace a cleared request with another cached suggestion", () => {
    const first = createMessage(1, "较早的问题");
    const second = createMessage(2, "当前问题");

    expect(
      resolveSmartReplyAssistantTurn({
        activeMessageKey: undefined,
        messages: [first, second],
        suggestions: {
          "1": {
            assistantName: "智能助手",
            content: "较早的推荐",
            generateStatus: 2,
            status: "ready",
          },
          "2": {
            assistantName: "智能助手",
            content: "当前推荐",
            generateStatus: 2,
            status: "ready",
          },
        },
      }),
    ).toBeUndefined();
  });
});

function createMessage(seq: number, text: string): ChatMessage {
  return {
    content: { text, type: "text" },
    conversationId: "conversation-1",
    author: "客户",
    isOwnMessage: false,
    rawMsgtype: "text",
    role: "customer",
    sender: { id: "customer-1", name: "客户" },
    sentAt: "2026-09-15 10:00:00",
    seq,
    status: "sent",
    uiMessageKey: `message-${seq}`,
  };
}
