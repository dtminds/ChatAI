import { describe, expect, it } from "vitest";
import type { WorkbenchQuickReplyDto } from "@chatai/contracts";
import { buildQuickReplyComposerSegments } from "@/pages/chat/lib/quick-reply-segments";

describe("quick reply segments", () => {
  it("builds initial composer segments with text first and attachments in configured order", () => {
    const quickReply: WorkbenchQuickReplyDto = {
      attachments: [
        {
          content: {
          fileName: "报价单.pdf",
          fileSizeLabel: "2 KB",
          fileUrl: "https://cdn.example.com/quote.pdf",
        },
        materialCollectionId: "material-file-1",
        msgInfoId: "9101",
        type: "file",
      },
        {
          content: {
            desc: "活动说明",
            href: "https://example.com/activity",
            title: "活动链接",
        },
        materialCollectionId: "material-h5-1",
        msgInfoId: "9102",
        type: "h5",
      },
        {
          content: {
            appName: "客户助手",
            title: "跟进小程序",
        },
        materialCollectionId: "material-weapp-1",
        msgInfoId: "9103",
        type: "weapp",
      },
      ],
      categoryId: "11",
      contentText: "您好，这是报价信息",
      id: "reply-1",
      labelColor: "orange",
      labelText: "报价",
      scopeType: 1,
      sort: 100,
    };

    expect(buildQuickReplyComposerSegments(quickReply)).toEqual({
      invalidAttachmentCount: 0,
      segments: [
        {
          text: "您好，这是报价信息",
          type: "text",
        },
        {
          extension: "pdf",
          fileName: "报价单.pdf",
          fileSizeLabel: "2 KB",
          msgInfoId: "9101",
          type: "file",
          url: "https://cdn.example.com/quote.pdf",
        },
        {
          desc: "活动说明",
          href: "https://example.com/activity",
          msgInfoId: "9102",
          title: "活动链接",
          type: "h5",
        },
        {
          appName: "客户助手",
          msgInfoId: "9103",
          title: "跟进小程序",
          type: "weapp",
        },
      ],
    });
  });

  it("keeps image and non-image attachments in their configured order", () => {
    const quickReply: WorkbenchQuickReplyDto = {
      attachments: [
        {
          content: {
            fileUrl: "https://cdn.example.com/a.png",
          },
          type: "image",
        },
        {
          content: {
            fileName: "报价单.pdf",
            fileUrl: "https://cdn.example.com/quote.pdf",
          },
          materialCollectionId: "material-file-1",
          msgInfoId: "9101",
          type: "file",
        },
      ],
      categoryId: 0,
      contentText: "",
      id: "reply-2",
      labelColor: "",
      labelText: "",
      scopeType: 2,
      sort: 90,
    };

    expect(buildQuickReplyComposerSegments(quickReply)).toEqual({
      invalidAttachmentCount: 0,
      segments: [
        {
          alt: "图片",
          type: "image",
          url: "https://cdn.example.com/a.png",
        },
        {
          extension: "pdf",
          fileName: "报价单.pdf",
          msgInfoId: "9101",
          type: "file",
          url: "https://cdn.example.com/quote.pdf",
        },
      ],
    });
  });

  it("reports invalid attachments instead of dropping them silently", () => {
    const quickReply: WorkbenchQuickReplyDto = {
      attachments: [
        {
          content: {},
          type: "image",
        },
      ],
      categoryId: "11",
      contentText: "只有文本",
      id: "reply-invalid",
      labelColor: "",
      labelText: "",
      scopeType: 1,
      sort: 80,
    };

    expect(buildQuickReplyComposerSegments(quickReply)).toEqual({
      invalidAttachmentCount: 1,
      segments: [
        {
          text: "只有文本",
          type: "text",
        },
      ],
    });
  });
});
