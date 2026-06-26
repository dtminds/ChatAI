import { describe, expect, it } from "vitest";
import type { ChatMessage, Conversation, Message } from "@/pages/chat/chat-types";
import {
  adaptSmartReplyAttachments,
  adaptSmartReplySuggestions,
  adaptSmartReplyViolationResult,
  buildSmartReplyRealAttachIds,
  buildSmartReplySendSegments,
  buildJavaGenAnswerFromText,
  resolveSmartReplyRealAnswer,
  collectNewSmartReplyPendingKeys,
  collectPendingSmartReplyPollMsgIds,
  collectQuestionImgs,
  collectSmartReplyPendingKeysFromSuggestions,
  collectUnansweredSmartReplyPendingKeys,
  collectSmartReplyMsgIds,
  collectSmartReplyPollMsgIds,
  canRequestSmartReplyMakeShorter,
  createMakeShorterSmartReplySuggestion,
  createPendingSmartReplySuggestion,
  createSentSmartReplySuggestion,
  createTriggeredSmartReplySuggestion,
  getSmartReplyCustomerQuestion,
  getSmartReplyLookupKey,
  getSmartReplyProcessingLabel,
  isSmartReplyContentIncompleteSkip,
  isSmartReplyEligibleMessage,
  isSmartReplySupportedConversation,
  isSmartReplyGenerationFailed,
  isSmartReplyKnowledgeMiss,
  isSmartReplyPollActiveGenerateStatus,
  isSmartReplyPollComplete,
  isSmartReplyReady,
  isSmartReplySent,
  resolveSmartReplyProcessingLabel,
  shouldShowSmartReplyCard,
  shouldShowSmartReplyTriggerIcon,
  SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
} from "@/pages/chat/api/smart-reply-adapter";

describe("smart-reply-adapter", () => {
  it("collects the latest message seq values up to the limit", () => {
    const msgIds = collectSmartReplyMsgIds(
      Array.from({ length: 120 }, (_, index) => ({
        uiMessageKey: `msg-${index}`,
        seq: index + 1,
      })),
      100,
    );

    expect(msgIds).toHaveLength(100);
    expect(msgIds[0]).toBe(21);
    expect(msgIds[99]).toBe(120);
  });

  it("drops messages without seq", () => {
    expect(
      collectSmartReplyMsgIds([
        {} as { seq?: number },
        { seq: 1022692 },
      ]),
    ).toEqual([1022692]);
  });

  it("uses seq for smart reply lookup key", () => {
    expect(getSmartReplyLookupKey({ uiMessageKey: "wx-msg-001", seq: 1090 })).toBe("1090");
    expect(getSmartReplyLookupKey({ uiMessageKey: "wx-msg-001" })).toBe("wx-msg-001");
  });

  it("returns processing labels by message content type", () => {
    expect(getSmartReplyProcessingLabel("voice", "processing")).toBe("正在处理语音消息...");
    expect(getSmartReplyProcessingLabel("image", "processing")).toBe("正在处理图片消息...");
    expect(getSmartReplyProcessingLabel("text", "processing")).toBe("思考中..");
  });

  it("returns generating label while smart reply is thinking", () => {
    expect(getSmartReplyProcessingLabel("voice", "thinking")).toBe("思考中..");
    expect(getSmartReplyProcessingLabel("image", "thinking")).toBe("思考中..");
    expect(resolveSmartReplyProcessingLabel("voice", "processing", true)).toBe(
      "思考中..",
    );
  });

  it("collects image urls for general-answer requests", () => {
    expect(
      collectQuestionImgs({
        content: { imageUrl: "https://example.com/image.png", alt: "图片", type: "image" },
        uiMessageKey: "msg-image",
        rawMsgtype: "image",
        role: "customer",
      } as ChatMessage),
    ).toEqual(["https://example.com/image.png"]);
    expect(
      collectQuestionImgs({
        content: { text: "文本", type: "text" },
        uiMessageKey: "msg-text",
        role: "customer",
      } as ChatMessage),
    ).toEqual([]);
    expect(
      collectQuestionImgs({
        content: {
          alt: "表情",
          imageUrl: "https://example.com/emotion.gif",
          type: "image",
          variant: "emotion",
        },
        uiMessageKey: "msg-emotion",
        rawMsgtype: "emotion",
        role: "customer",
      } as ChatMessage),
    ).toEqual([]);
  });

  it("only treats voice and image messages as eligible after usable content is ready", () => {
    const baseMessage = {
      uiMessageKey: "msg-1",
      role: "customer",
    } as ChatMessage;

    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          durationLabel: "0:05",
          transVoiceText: "",
          type: "voice",
        },
        rawMsgtype: "voice",
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          durationLabel: "0:05",
          transVoiceText: " 转写后的问题 ",
          type: "voice",
        },
        rawMsgtype: "voice",
      }),
    ).toBe(true);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          alt: "",
          imageUrl: "",
          type: "image",
        },
        rawMsgtype: "image",
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          alt: "产品照片",
          imageUrl: "",
          type: "image",
        } as ChatMessage["content"],
        rawMsgtype: "image",
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          alt: "",
          downloadStatus: "ing",
          imageUrl: "https://example.com/product.png",
          type: "image",
        },
        rawMsgtype: "image",
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          alt: "图片",
          imageUrl: "",
          type: "image",
        },
        rawMsgtype: "image",
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          alt: "",
          downloadStatus: "finished",
          imageUrl: "https://example.com/product.png",
          type: "image",
        },
        rawMsgtype: "image",
      }),
    ).toBe(true);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          alt: "表情",
          imageUrl: "https://example.com/emotion.gif",
          type: "image",
          variant: "emotion",
        },
        rawMsgtype: "emotion",
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          text: "缺少原始消息类型",
          type: "text",
        },
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          text: "[新消息]",
          type: "text",
        },
        rawMsgtype: "unsupported-msgtype",
      }),
    ).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...baseMessage,
        content: {
          text: "客户的问题",
          type: "text",
        },
        rawMsgtype: "text",
      }),
    ).toBe(true);
  });

  it("uses processed media text as the smart reply customer question", () => {
    expect(
      getSmartReplyCustomerQuestion({
        content: {
          durationLabel: "0:05",
          transVoiceText: "转写后的问题",
          type: "voice",
        },
        uiMessageKey: "msg-voice",
        role: "customer",
      } as ChatMessage),
    ).toBe("转写后的问题");
    expect(
      getSmartReplyCustomerQuestion({
        content: {
          alt: "客户上传的产品照片",
          imageUrl: "https://example.com/product.png",
          type: "image",
        },
        uiMessageKey: "msg-image",
        role: "customer",
      } as ChatMessage),
    ).toBe("客户上传的产品照片");
  });

  it("creates triggered suggestions with media processing state", () => {
    const pendingSuggestion = createTriggeredSmartReplySuggestion({
      content: { imageUrl: "https://example.com/image.png", alt: "图片", type: "image" },
      uiMessageKey: "msg-image",
      role: "customer",
    } as ChatMessage);

    expect(pendingSuggestion).toMatchObject({
      assistantName: "智能助手",
      content: "",
      status: "processing",
    });
    expect(pendingSuggestion.busyRequestId).toEqual(expect.any(Number));
    expect(
      createTriggeredSmartReplySuggestion({
        content: { text: "文本", type: "text" },
        uiMessageKey: "msg-text",
        role: "customer",
      } as ChatMessage),
    ).toMatchObject({
      busyRequestId: expect.any(Number),
      status: "thinking",
    });
    expect(
      createPendingSmartReplySuggestion().busyRequestId,
    ).toEqual(expect.any(Number));
  });

  it("treats ready suggestions and busy suggestions differently", () => {
    expect(
      isSmartReplyReady({
        assistantName: "护肤小助手",
        content: "建议回复",
        status: "ready",
      }),
    ).toBe(true);
    expect(
      isSmartReplyReady({
        assistantName: "护肤小助手",
        content: "",
        status: "thinking",
      }),
    ).toBe(false);
  });

  it("marks only newly appended customer messages as pending", () => {
    expect(
      collectNewSmartReplyPendingKeys(
        [
          {
            content: { text: "旧消息", type: "text" },
            uiMessageKey: "msg-1",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:00:00+08:00",
            seq: 10,
          },
        ] as Message[],
        [
          {
            content: { text: "新消息", type: "text" },
            uiMessageKey: "msg-2",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:01:00+08:00",
            seq: 11,
          },
        ] as Message[],
      ),
    ).toEqual(["11"]);
  });

  it("collects new smart reply pending keys from large histories without spreading seq values", () => {
    const previousMessages = Array.from({ length: 150_000 }, (_, index) => ({
      content: { text: `旧消息 ${index + 1}`, type: "text" as const },
      uiMessageKey: `msg-${index + 1}`,
      rawMsgtype: "text",
      role: "customer" as const,
      sender: { id: "cus-1", name: "客户" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: index + 1,
    })) as Message[];

    expect(
      collectNewSmartReplyPendingKeys(previousMessages, [
        {
          content: { text: "新消息", type: "text" },
          uiMessageKey: "msg-new",
          rawMsgtype: "text",
          role: "customer",
          sender: { id: "cus-1", name: "客户" },
          sentAt: "2026-05-25T10:01:00+08:00",
          seq: 150_001,
        },
      ] as Message[]),
    ).toEqual(["150001"]);
  });

  it("uses the latest sorted previous seq when the tail contains non-seq system messages", () => {
    expect(
      collectNewSmartReplyPendingKeys(
        [
          {
            content: { text: "旧消息", type: "text" },
            uiMessageKey: "msg-100",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:00:00+08:00",
            seq: 100,
          },
          {
            uiMessageKey: "typing-system",
            role: "system",
            sentAt: "2026-05-25T10:00:01+08:00",
            text: "系统提示",
          },
        ] as Message[],
        [
          {
            content: { text: "历史补齐消息", type: "text" },
            uiMessageKey: "msg-90",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T09:59:00+08:00",
            seq: 90,
          },
          {
            content: { text: "新消息", type: "text" },
            uiMessageKey: "msg-101",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:01:00+08:00",
            seq: 101,
          },
        ] as Message[]),
    ).toEqual(["101"]);
  });

  it("does not mark history preload messages as pending", () => {
    expect(
      collectNewSmartReplyPendingKeys(
        [],
        [
          {
            content: { text: "首屏消息", type: "text" },
            uiMessageKey: "msg-1",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:00:00+08:00",
            seq: 1,
          },
        ] as Message[],
      ),
    ).toEqual([]);
  });

  it("collects up to five latest unanswered customer messages after the last agent reply", () => {
    const messages = [
      {
        content: { text: "已回复的问题", type: "text" },
        uiMessageKey: "msg-old-customer",
        rawMsgtype: "text",
        role: "customer",
        sender: { id: "cus-1", name: "客户" },
        sentAt: "2026-05-25T10:00:00+08:00",
        seq: 1,
      },
      {
        content: { text: "客服回复", type: "text" },
        uiMessageKey: "msg-agent",
        role: "agent",
        sender: { id: "agent-1", name: "客服" },
        sentAt: "2026-05-25T10:01:00+08:00",
        seq: 2,
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        content: { text: `未回复问题 ${index + 1}`, type: "text" as const },
        uiMessageKey: `msg-new-${index + 1}`,
        rawMsgtype: "text",
        role: "customer" as const,
        sender: { id: "cus-1", name: "客户" },
        sentAt: `2026-05-25T10:0${index + 2}:00+08:00`,
        seq: index + 3,
      })),
    ] as Message[];

    expect(collectUnansweredSmartReplyPendingKeys(messages)).toEqual([
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
  });

  it("does not keep smart reply candidates when the conversation ends with an agent reply", () => {
    expect(
      collectUnansweredSmartReplyPendingKeys([
        {
          content: { text: "客户问题", type: "text" },
          uiMessageKey: "msg-customer",
          rawMsgtype: "text",
          role: "customer",
          sender: { id: "cus-1", name: "客户" },
          sentAt: "2026-05-25T10:00:00+08:00",
          seq: 1,
        },
        {
          content: { text: "客服回复", type: "text" },
          uiMessageKey: "msg-agent",
          role: "agent",
          sender: { id: "agent-1", name: "客服" },
          sentAt: "2026-05-25T10:01:00+08:00",
          seq: 2,
        },
      ] as Message[]),
    ).toEqual([]);
  });

  it("does not add a new customer message to pending when an agent replies after it in the same poll", () => {
    expect(
      collectNewSmartReplyPendingKeys(
        [
          {
            content: { text: "旧消息", type: "text" },
            uiMessageKey: "msg-1",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:00:00+08:00",
            seq: 10,
          },
        ] as Message[],
        [
          {
            content: { text: "新问题", type: "text" },
            uiMessageKey: "msg-2",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:01:00+08:00",
            seq: 11,
          },
          {
            content: { text: "客服回复", type: "text" },
            uiMessageKey: "msg-3",
            role: "agent",
            sender: { id: "agent-1", name: "客服" },
            sentAt: "2026-05-25T10:02:00+08:00",
            seq: 12,
          },
        ] as Message[],
      ),
    ).toEqual([]);
  });

  it("shows trigger icon only for eligible customer messages without a smart reply card", () => {
    const customerMessage = {
      content: { text: "客户消息", type: "text" },
      uiMessageKey: "msg-1",
      rawMsgtype: "text",
      role: "customer",
    } as ChatMessage;

    expect(isSmartReplySupportedConversation({ mode: "single" } as Conversation)).toBe(true);
    expect(isSmartReplySupportedConversation({ mode: "group" } as Conversation)).toBe(false);
    expect(
      isSmartReplyEligibleMessage({
        ...customerMessage,
        isGroupConversation: true,
      }),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          isGroupConversation: true,
        },
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(customerMessage, undefined),
    ).toBe(true);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          content: {
            alt: "产品图",
            downloadStatus: "ing",
            imageUrl: "https://example.com/image.png",
            type: "image",
          },
          rawMsgtype: "image",
        },
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          content: {
            alt: "产品图",
            downloadStatus: "finished",
            imageUrl: "https://example.com/image.png",
            type: "image",
          },
          rawMsgtype: "image",
        },
        undefined,
      ),
    ).toBe(true);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          content: {
            durationLabel: "0:05",
            type: "voice",
          },
        },
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          content: {
            extension: "pdf",
            fileName: "说明.pdf",
            fileSizeLabel: "1 MB",
            type: "file",
          },
        },
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          content: {
            alt: "视频",
            coverImageUrl: "https://example.com/cover.png",
            durationLabel: "0:30",
            type: "video",
            videoUrl: "https://example.com/video.mp4",
          },
        },
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(customerMessage, {
        assistantName: "护肤小助手",
        content: "建议回复",
        status: "ready",
      }),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(customerMessage, {
        assistantName: "护肤小助手",
        content: "",
        status: "processing",
      }),
    ).toBe(false);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          role: "agent",
        },
        undefined,
      ),
    ).toBe(false);
  });

  it("shows smart reply card when poll returns knowledge miss", () => {
    const suggestion = {
      assistantName: "护肤小助手",
      content: "",
      failReason: "knowledge_miss",
      generateStatus: 3,
      pollComplete: true,
    };

    expect(isSmartReplyKnowledgeMiss(suggestion)).toBe(true);
    expect(isSmartReplyGenerationFailed(suggestion)).toBe(false);
    expect(isSmartReplyReady(suggestion)).toBe(false);
    expect(shouldShowSmartReplyCard(suggestion)).toBe(true);
    expect(shouldShowSmartReplyTriggerIcon(
      {
        content: { text: "客户消息", type: "text" },
        uiMessageKey: "msg-1",
        role: "customer",
      } as ChatMessage,
      suggestion,
    )).toBe(false);
  });

  it("shows smart reply card when poll returns generation failure", () => {
    const suggestion = {
      assistantName: "护肤小助手",
      content: "",
      failReason: "model_error",
      generateStatus: 3,
      pollComplete: true,
    };

    expect(isSmartReplyGenerationFailed(suggestion)).toBe(true);
    expect(isSmartReplyKnowledgeMiss(suggestion)).toBe(false);
    expect(shouldShowSmartReplyCard(suggestion)).toBe(true);
    expect(shouldShowSmartReplyTriggerIcon(
      {
        content: {
          alt: "产品图",
          imageUrl: "https://example.com/image.png",
          type: "image",
        },
        uiMessageKey: "msg-1",
        role: "customer",
      } as ChatMessage,
      suggestion,
    )).toBe(false);
  });

  it("treats incomplete content skips as a visible non-failure hint", () => {
    const suggestion = {
      assistantName: "护肤小助手",
      content: "",
      failReason: SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
      generateStatus: 3,
      pollComplete: true,
    };

    expect(isSmartReplyContentIncompleteSkip(suggestion)).toBe(true);
    expect(isSmartReplyGenerationFailed(suggestion)).toBe(false);
    expect(shouldShowSmartReplyCard(suggestion)).toBe(true);
  });

  it("treats raw incomplete content skips from history as a non-failure hint", () => {
    const suggestion = {
      assistantName: "护肤小助手",
      content: "",
      failReason: "content_incomplete_skip",
      generateStatus: 3,
      pollComplete: true,
    };

    expect(isSmartReplyContentIncompleteSkip(suggestion)).toBe(true);
    expect(isSmartReplyGenerationFailed(suggestion)).toBe(false);
    expect(shouldShowSmartReplyCard(suggestion)).toBe(true);
  });

  it("shows smart reply card while poll is still active", () => {
    expect(shouldShowSmartReplyCard(undefined)).toBe(false);
    expect(
      shouldShowSmartReplyCard({
        assistantName: "护肤小助手",
        content: "",
        generateStatus: 0,
        status: "thinking",
      }),
    ).toBe(true);
    expect(
      shouldShowSmartReplyCard({
        assistantName: "护肤小助手",
        content: "",
        generateStatus: 1,
        status: "processing",
      }),
    ).toBe(true);
    expect(
      shouldShowSmartReplyCard({
        assistantName: "护肤小助手",
        content: "建议先确认是否敏感肌",
        generateStatus: 2,
        pollComplete: true,
        status: "thinking",
      }),
    ).toBe(true);
    expect(isSmartReplyPollActiveGenerateStatus(0)).toBe(true);
    expect(isSmartReplyPollActiveGenerateStatus(1)).toBe(true);
    expect(isSmartReplyPollActiveGenerateStatus(2)).toBe(false);
  });

  it("adapts suggestions into a message id map", () => {
    const map = adaptSmartReplySuggestions([
      {
        assistantName: "护肤小助手",
        content: "建议回复",
        genAnswer: '[{"msgtype":"text","text":"建议回复"}]',
        messageId: "1090",
        refAttachIds: ["101", "102"],
        status: "ready",
      },
    ]);

    expect(map["1090"]).toEqual({
      assistantName: "护肤小助手",
      content: "建议回复",
      genAnswer: '[{"msgtype":"text","text":"建议回复"}]',
      refAttachIds: ["101", "102"],
      status: "ready",
    });
  });

  it("uses raw genAnswer for send-answer when content is unchanged", () => {
    const genAnswer =
      '[{"msgtype":"text","text":"麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~"}]';

    expect(
      resolveSmartReplyRealAnswer(
        genAnswer,
        "麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~",
        "麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~",
      ),
    ).toBe(genAnswer);
  });

  it("builds genAnswer json when user edits smart reply content", () => {
    expect(
      resolveSmartReplyRealAnswer(
        '[{"msgtype":"text","text":"原始话术"}]',
        "编辑后话术",
        "原始话术",
      ),
    ).toBe(buildJavaGenAnswerFromText("编辑后话术"));
  });

  it("builds empty genAnswer json when user clears edited smart reply content", () => {
    expect(
      resolveSmartReplyRealAnswer(
        '[{"msgtype":"text","text":"原始话术"}]',
        "",
        "原始话术",
      ),
    ).toBe(buildJavaGenAnswerFromText(""));
  });

  it("adapts attachment list into recommended attachments", () => {
    expect(
      adaptSmartReplyAttachments([
        {
          coverUrl: "https://example.com/cover.png",
          fileName: "产品图.png",
          fileType: 1,
          id: 101,
        },
        {
          appInfo: { nickName: "品牌小程序" },
          fileType: 7,
          id: 102,
        },
      ]),
    ).toEqual([
      {
        content: undefined,
        coverUrl: "https://example.com/cover.png",
        defaultSelected: true,
        fileName: "产品图.png",
        fileType: "1",
        id: "101",
        localPath: undefined,
        slocalPath: undefined,
      },
      {
        content: undefined,
        coverUrl: undefined,
        defaultSelected: false,
        fileName: "品牌小程序",
        fileType: "7",
        id: "102",
        localPath: undefined,
        slocalPath: undefined,
      },
    ]);
  });

  it("uses customer message text as FAQ question source", () => {
    expect(
      getSmartReplyCustomerQuestion({
        content: { text: "  客户想了解敏感肌护理  ", type: "text" },
        uiMessageKey: "msg-1",
        role: "customer",
      } as ChatMessage),
    ).toBe("客户想了解敏感肌护理");
  });

  it("adapts text moderation response into violation result", () => {
    expect(
      adaptSmartReplyViolationResult({
        result: {
          categoryLabel: "广告法_通用禁用极限词",
          words: ["最好"],
        },
      }),
    ).toEqual({
      categoryLabel: "广告法_通用禁用极限词",
      words: ["最好"],
    });
    expect(adaptSmartReplyViolationResult({ result: null })).toBeNull();
  });

  it("builds send segments from edited text and selected attachments", () => {
    expect(
      buildSmartReplySendSegments({
        content: "您好，请查收资料",
        recommendedAttachments: [
          {
            coverUrl: "https://example.com/cover.png",
            fileName: "产品图.png",
            fileType: "1",
            id: "101",
          },
          {
            fileName: "说明.pdf",
            fileType: "5",
            id: "102",
            localPath: "/files/guide.pdf",
          },
          {
            fileName: "规格.pdf",
            fileType: "5",
            id: "103",
            localPath: "files/spec.pdf",
          },
          {
            fileName: "演示视频.mp4",
            fileType: "3",
            id: "104",
            localPath: "videos/demo.mp4",
          },
          {
            coverUrl: "https://example.com/article.png",
            fileName: "图文素材",
            fileType: "4",
            id: "105",
          },
          {
            coverUrl: "https://example.com/mini.png",
            fileName: "小程序素材",
            fileType: "7",
            id: "106",
          },
        ],
        selectedAttachmentIds: ["101", "102", "103", "104", "105", "106"],
      }),
    ).toEqual([
      {
        text: "您好，请查收资料",
        type: "text",
      },
      {
        alt: "产品图.png",
        type: "image",
        url: "https://example.com/cover.png",
      },
      {
        extension: "pdf",
        fileName: "说明.pdf",
        type: "file",
        url: "https://b1.dtminds.com/files/guide.pdf",
      },
      {
        extension: "pdf",
        fileName: "规格.pdf",
        type: "file",
        url: "https://b1.dtminds.com/files/spec.pdf",
      },
      {
        extension: "mp4",
        fileName: "演示视频.mp4",
        type: "file",
        url: "https://b1.dtminds.com/videos/demo.mp4",
      },
    ]);
  });

  it("skips selected attachments that cannot be sent", () => {
    expect(
      buildSmartReplySendSegments({
        content: "",
        recommendedAttachments: [
          {
            fileName: "缺地址图.png",
            fileType: "1",
            id: "101",
          },
        ],
        selectedAttachmentIds: ["101"],
      }),
    ).toEqual([]);
  });

  it("builds realAttachIds for send-answer requests", () => {
    expect(buildSmartReplyRealAttachIds(["101", "102"])).toEqual(["101", "102"]);
    expect(buildSmartReplyRealAttachIds([])).toEqual([]);
  });

  it("allows make shorter only for ready suggestions with content", () => {
    expect(
      canRequestSmartReplyMakeShorter({
        assistantName: "护肤小助手",
        content: "建议回复",
        generateStatus: 2,
        status: "ready",
      }),
    ).toBe(true);
    expect(
      canRequestSmartReplyMakeShorter({
        assistantName: "护肤小助手",
        content: "已发送话术",
        generateStatus: 4,
        status: "ready",
      }),
    ).toBe(true);
    expect(
      canRequestSmartReplyMakeShorter({
        assistantName: "护肤小助手",
        content: "生成中",
        status: "processing",
      }),
    ).toBe(false);
  });

  it("creates make shorter suggestions that stop polling", () => {
    expect(
      createMakeShorterSmartReplySuggestion(
        {
          assistantName: "智能助手",
          content: "原来很长的话术内容",
          generateStatus: 2,
          pollComplete: true,
          refAttachIds: ["101"],
          status: "ready",
        },
        "  更短话术  ",
      ),
    ).toEqual({
      assistantName: "智能助手",
      busyRequestId: undefined,
      content: "更短话术",
      generateStatus: 2,
      pollComplete: true,
      refAttachIds: ["101"],
      status: "ready",
    });
  });

  it("collects poll msg ids excluding terminal statuses", () => {
    expect(
      collectSmartReplyPollMsgIds(
        [
          { seq: 1 },
          { seq: 2 },
          { seq: 3 },
        ],
        {
          "2": {
            assistantName: "智能助手",
            content: "已完成",
            generateStatus: 2,
            pollComplete: true,
            status: "ready",
          },
        },
      ),
    ).toEqual([1, 3]);
  });

  it("collects poll msg ids only from pending unanswered candidates", () => {
    expect(
      collectPendingSmartReplyPollMsgIds(
        [
          {
            content: { text: "待推荐 1", type: "text" },
            uiMessageKey: "msg-1",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:01:00+08:00",
            seq: 1,
          },
          {
            content: { text: "待推荐 2", type: "text" },
            uiMessageKey: "msg-2",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:02:00+08:00",
            seq: 2,
          },
          {
            content: { text: "未加入 pending", type: "text" },
            uiMessageKey: "msg-3",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:03:00+08:00",
            seq: 3,
          },
        ] as Message[],
        {
          "2": {
            assistantName: "智能助手",
            content: "已完成",
            generateStatus: 2,
            pollComplete: true,
            status: "ready",
          },
        },
        {
          "1": true,
          "2": true,
        },
      ),
    ).toEqual([1]);
  });

  it("collects explicitly allowed pending poll msg ids even when answered", () => {
    expect(
      collectPendingSmartReplyPollMsgIds(
        [
          {
            content: { text: "已被回复的问题", type: "text" },
            uiMessageKey: "msg-1",
            rawMsgtype: "text",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:01:00+08:00",
            seq: 1,
          },
          {
            content: { text: "客服回复", type: "text" },
            uiMessageKey: "msg-2",
            role: "agent",
            sender: { id: "agent-1", name: "客服" },
            sentAt: "2026-05-25T10:02:00+08:00",
            seq: 2,
          },
        ] as Message[],
        {},
        {
          "1": true,
        },
        100,
        { allowKeys: new Set(["1"]) },
      ),
    ).toEqual([1]);
  });

  it("derives pending keys from non-terminal smart replies", () => {
    expect(
      collectSmartReplyPendingKeysFromSuggestions({
        "101": {
          assistantName: "智能助手",
          content: "",
          status: "processing",
        },
        "102": {
          assistantName: "智能助手",
          content: "已完成",
          pollComplete: true,
          status: "ready",
        },
      }),
    ).toEqual(["101"]);
  });

  it("marks terminal generate statuses", () => {
    expect(isSmartReplyPollComplete({
      assistantName: "智能助手",
      content: "",
      generateStatus: 3,
      pollComplete: true,
    })).toBe(true);
    expect(isSmartReplyPollComplete({
      assistantName: "智能助手",
      content: "生成中",
      generateStatus: 1,
      status: "processing",
    })).toBe(false);
  });

  it("marks sent suggestions as poll complete and keeps the card visible", () => {
    const sentSuggestion = createSentSmartReplySuggestion(
      {
        assistantName: "护肤小助手",
        content: "旧话术",
        generateStatus: 2,
        pollComplete: true,
        recordId: "88001",
        status: "ready",
      },
      "已发送话术",
    );

    expect(sentSuggestion).toEqual({
      assistantName: "护肤小助手",
      content: "已发送话术",
      generateStatus: 4,
      pollComplete: true,
      recordId: "88001",
      status: "ready",
    });
    expect(isSmartReplySent(sentSuggestion)).toBe(true);
    expect(isSmartReplyPollComplete(sentSuggestion)).toBe(true);
    expect(shouldShowSmartReplyCard(sentSuggestion)).toBe(true);
  });

  it("adapts poll complete fields from dto", () => {
    expect(
      adaptSmartReplySuggestions([
        {
          assistantName: "智能助手",
          content: "推荐话术",
          generateStatus: 4,
          messageId: "1001",
          pollComplete: true,
          status: "ready",
        },
      ]),
    ).toEqual({
      "1001": {
        assistantName: "智能助手",
        content: "推荐话术",
        failReason: undefined,
        generateStatus: 4,
        pollComplete: true,
        refAttachIds: undefined,
        status: "ready",
      },
    });
  });
});
