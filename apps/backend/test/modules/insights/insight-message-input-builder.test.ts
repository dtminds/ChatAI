import { describe, expect, it } from "vitest";
import { buildInsightMessageInput } from "../../../src/modules/insights/insight-message-input-builder";

const baseRow = {
  chat_type: 1,
  conversation_id: 301,
  from_type: 2,
  id: 9001,
  msgtime: 1780243200000,
  msgtype: "text",
  third_from_id: "external-1",
  third_user_id: "user-1",
};

describe("buildInsightMessageInput", () => {
  it("converts text messages into AI text", () => {
    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ content: "退款什么时候到账？" }),
      }),
    ).toMatchObject({
      aiText: "退款什么时候到账？",
      contentStatus: "ready",
      includedForAi: true,
      meaningfulForBoundary: true,
      messageType: "text",
      senderRole: "customer",
      sourceMessageId: "9001",
    });
  });

  it("uses plain JSON string content as text", () => {
    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify("你们提供AI客服系统吗"),
      }),
    ).toMatchObject({
      aiText: "你们提供AI客服系统吗",
      contentStatus: "ready",
      messageType: "text",
    });
  });

  it("uses voice transcription when content.transVoiceText is ready", () => {
    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ duration: 8, transVoiceText: "我想查一下物流" }),
        msgtype: "voice",
      }),
    ).toMatchObject({
      aiText: "我想查一下物流",
      contentStatus: "ready",
      messageType: "voice",
    });
  });

  it("marks voice messages pending when transcription is empty", () => {
    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ duration: 8, transVoiceText: "" }),
        msgtype: "voice",
      }),
    ).toMatchObject({
      aiText: "[语音消息，转写中]",
      contentStatus: "pending_transcription",
      messageType: "voice",
    });
  });

  it("summarizes file, link and mini-program messages", () => {
    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ fileName: "报价单.pdf" }),
        msgtype: "file",
      }).aiText,
    ).toBe("[文件] 报价单.pdf");

    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ description: "活动说明", title: "618 优惠", url: "https://example.com/promo" }),
        msgtype: "link",
      }).aiText,
    ).toBe("[链接] 618 优惠 活动说明 https://example.com/promo");

    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ appName: "商城", title: "白色羽绒服" }),
        msgtype: "weapp",
      }).aiText,
    ).toBe("[小程序] 商城 白色羽绒服");
  });

  it("keeps images as unsupported AI text without OCR", () => {
    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ fileUrl: "image/a.jpg" }),
        msgtype: "image",
      }),
    ).toMatchObject({
      aiText: "[图片]",
      contentStatus: "unsupported",
      includedForAi: true,
      messageType: "image",
    });
  });

  it("excludes revoke and system messages from AI and boundary decisions", () => {
    expect(
      buildInsightMessageInput({
        ...baseRow,
        content: JSON.stringify({ text: "撤回了一条消息" }),
        from_type: null,
        msgtype: "revoke",
      }),
    ).toMatchObject({
      includedForAi: false,
      meaningfulForBoundary: false,
      messageType: "system",
      senderRole: "system",
    });
  });
});
