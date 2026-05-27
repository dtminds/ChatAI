import { describe, expect, it } from "vitest";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import {
  adaptSmartReplyAttachments,
  adaptSmartReplySuggestions,
  adaptSmartReplyViolationResult,
  buildSmartReplyRealAttachIds,
  buildSmartReplySendSegments,
  collectNewSmartReplyPendingKeys,
  collectQuestionImgs,
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
  isSmartReplyKnowledgeMiss,
  isSmartReplyPollActiveGenerateStatus,
  isSmartReplyPollComplete,
  isSmartReplyReady,
  isSmartReplySent,
  resolveSmartReplyProcessingLabel,
  shouldShowSmartReplyCard,
  shouldShowSmartReplyTriggerIcon,
} from "@/pages/chat/api/smart-reply-adapter";

describe("smart-reply-adapter", () => {
  it("collects the latest message seq values up to the limit", () => {
    const msgIds = collectSmartReplyMsgIds(
      Array.from({ length: 120 }, (_, index) => ({
        id: `msg-${index}`,
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
    expect(getSmartReplyLookupKey({ id: "wx-msg-001", seq: 1090 })).toBe("1090");
    expect(getSmartReplyLookupKey({ id: "wx-msg-001" })).toBe("wx-msg-001");
  });

  it("returns processing labels by message content type", () => {
    expect(getSmartReplyProcessingLabel("voice", "processing")).toBe("正在处理语音消息...");
    expect(getSmartReplyProcessingLabel("image", "processing")).toBe("正在处理图片消息...");
    expect(getSmartReplyProcessingLabel("text", "processing")).toBe("AI正在生成话术...");
  });

  it("returns generating label while smart reply is thinking", () => {
    expect(getSmartReplyProcessingLabel("voice", "thinking")).toBe("AI正在生成话术...");
    expect(getSmartReplyProcessingLabel("image", "thinking")).toBe("AI正在生成话术...");
    expect(resolveSmartReplyProcessingLabel("voice", "processing", true)).toBe(
      "AI正在生成话术...",
    );
  });

  it("collects image urls for general-answer requests", () => {
    expect(
      collectQuestionImgs({
        content: { imageUrl: "https://example.com/image.png", alt: "图片", type: "image" },
        id: "msg-image",
        role: "customer",
      } as ChatMessage),
    ).toEqual(["https://example.com/image.png"]);
    expect(
      collectQuestionImgs({
        content: { text: "文本", type: "text" },
        id: "msg-text",
        role: "customer",
      } as ChatMessage),
    ).toEqual([]);
  });

  it("creates triggered suggestions with media processing state", () => {
    expect(
      createTriggeredSmartReplySuggestion({
        content: { imageUrl: "https://example.com/image.png", alt: "图片", type: "image" },
        id: "msg-image",
        role: "customer",
      } as ChatMessage),
    ).toEqual(createPendingSmartReplySuggestion());
    expect(
      createTriggeredSmartReplySuggestion({
        content: { text: "文本", type: "text" },
        id: "msg-text",
        role: "customer",
      } as ChatMessage).status,
    ).toBe("thinking");
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
            id: "msg-1",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:00:00+08:00",
            seq: 10,
          },
        ] as Message[],
        [
          {
            content: { text: "新消息", type: "text" },
            id: "msg-2",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:01:00+08:00",
            seq: 11,
          },
        ] as Message[],
      ),
    ).toEqual(["11"]);
  });

  it("does not mark history preload messages as pending", () => {
    expect(
      collectNewSmartReplyPendingKeys(
        [],
        [
          {
            content: { text: "首屏消息", type: "text" },
            id: "msg-1",
            role: "customer",
            sender: { id: "cus-1", name: "客户" },
            sentAt: "2026-05-25T10:00:00+08:00",
            seq: 1,
          },
        ] as Message[],
      ),
    ).toEqual([]);
  });

  it("shows trigger icon only for eligible customer messages without a smart reply card", () => {
    const customerMessage = {
      content: { text: "客户消息", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    expect(
      shouldShowSmartReplyTriggerIcon(customerMessage, undefined),
    ).toBe(true);
    expect(
      shouldShowSmartReplyTriggerIcon(
        {
          ...customerMessage,
          content: {
            alt: "产品图",
            imageUrl: "https://example.com/image.png",
            type: "image",
          },
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
    ).toBe(true);
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
    expect(isSmartReplyReady(suggestion)).toBe(false);
    expect(shouldShowSmartReplyCard(suggestion)).toBe(true);
    expect(shouldShowSmartReplyTriggerIcon(
      {
        content: { text: "客户消息", type: "text" },
        id: "msg-1",
        role: "customer",
      } as ChatMessage,
      suggestion,
    )).toBe(false);
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
        messageId: "1090",
        refAttachIds: ["101", "102"],
        status: "ready",
      },
    ]);

    expect(map["1090"]).toEqual({
      assistantName: "护肤小助手",
      content: "建议回复",
      refAttachIds: ["101", "102"],
      status: "ready",
    });
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
        id: "msg-1",
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
        ],
        selectedAttachmentIds: ["101", "102"],
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
        fileSizeLabel: "",
        type: "file",
        url: "https://b1.dtminds.com/files/guide.pdf",
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
          { id: "msg-1", seq: 1 },
          { id: "msg-2", seq: 2 },
          { id: "msg-3", seq: 3 },
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
