import { describe, expect, it } from "vitest";
import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  QUICK_REPLY_IMPORT_MAX_ROWS,
  QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT,
  QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT,
  QUICK_REPLY_LABEL_COLOR_VALUES,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
  isQuickReplyLabelColor,
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
  type WorkbenchQuickReplyCategoryEnsureResponse,
  type WorkbenchQuickReplyAttachment,
} from "../src/index.js";

describe("quick reply contracts", () => {
  it("accepts empty text when at least one valid attachment exists", () => {
    const attachments: WorkbenchQuickReplyAttachment[] = [
      {
        type: "h5",
        materialCollectionId: "12",
        msgInfoId: "9001",
        content: {
          href: "https://example.com",
          title: "活动链接",
        },
      },
    ];

    expect(validateQuickReplyPayload({ attachments, contentText: "" })).toEqual({
      ok: true,
    });
  });

  it("rejects empty quick replies", () => {
    expect(validateQuickReplyPayload({ attachments: [], contentText: "   " })).toEqual({
      errorMsg: "请填写话术内容或添加附件",
      ok: false,
    });
  });

  it("rejects content text longer than one thousand chars", () => {
    expect(
      validateQuickReplyPayload({
        attachments: [],
        contentText: "a".repeat(1001),
      }),
    ).toEqual({
      errorMsg: "话术内容不能超过1000字",
      ok: false,
    });
  });

  it("rejects more than five attachments", () => {
    const attachments = Array.from({ length: QUICK_REPLY_ATTACHMENT_MAX_COUNT + 1 }, () => ({
      content: { fileUrl: "https://example.com/image.png" },
      type: "image" as const,
    }));

    expect(validateQuickReplyPayload({ attachments, contentText: "" })).toEqual({
      errorMsg: "附件最多添加5个",
      ok: false,
    });
  });

  it("rejects unsupported attachment types instead of dropping them", () => {
    expect(
      validateQuickReplyPayload({
        attachments: [
          {
            content: {
              fileUrl: "https://example.com/video.mp4",
            },
            type: "video",
          },
        ],
        contentText: "请查看附件",
      }),
    ).toEqual({
      errorMsg: "附件类型不支持",
      ok: false,
    });
  });

  it("rejects sphfeed attachments while quick reply does not support video channels", () => {
    expect(
      validateQuickReplyPayload({
        attachments: [
          {
            content: {
              title: "都市快报",
            },
            materialCollectionId: "12",
            msgInfoId: "9001",
            type: "sphfeed",
          },
        ],
        contentText: "",
      }),
    ).toEqual({
      errorMsg: "附件类型不支持",
      ok: false,
    });
  });

  it("normalizes H5 attachment fields without adding bizType and keeps source ids", () => {
    const attachments = normalizeQuickReplyAttachments([
      {
        bizType: 4,
        content: {
          coverUrl: "",
          desc: "描述",
          href: "https://example.com",
          title: "标题",
        },
        materialCollectionId: "12",
        msgInfoId: "9001",
        msgid: "1025657",
        type: "h5",
      },
    ]);

    expect(attachments).toEqual([
      {
        content: {
          desc: "描述",
          href: "https://example.com",
          title: "标题",
        },
        materialCollectionId: "12",
        msgInfoId: "9001",
        msgid: "1025657",
        type: "h5",
      },
    ]);
  });

  it("accepts legacy H5 attachment linkUrl snapshots", () => {
    expect(
      validateQuickReplyPayload({
        attachments: [
          {
            content: {
              linkUrl: "https://example.com/legacy-page",
              title: "历史链接",
            },
            materialCollectionId: "12",
            msgInfoId: "9001",
            type: "h5",
          },
        ],
        contentText: "",
      }),
    ).toEqual({
      ok: true,
    });
  });

  it("rejects non-image material attachments without msgInfoId", () => {
    expect(
      validateQuickReplyPayload({
        attachments: [
          {
            content: {
              fileName: "报价单.pdf",
              fileUrl: "https://example.com/file.pdf",
            },
            materialCollectionId: "12",
            type: "file",
          },
        ],
        contentText: "",
      }),
    ).toEqual({
      errorMsg: "文件附件数据异常",
      ok: false,
    });
  });

  it("exports quick reply import limits and label color values", () => {
    expect(QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH).toBe(10);
    expect(QUICK_REPLY_LABEL_TEXT_MAX_LENGTH).toBe(10);
    expect(QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH).toBe(1000);
    expect(QUICK_REPLY_IMPORT_MAX_ROWS).toBe(1000);
    expect(QUICK_REPLY_BATCH_CREATE_LIMIT).toBe(100);
    expect(QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT).toBe(100);
    expect(QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT).toBe(500);
    expect(QUICK_REPLY_LABEL_COLOR_VALUES).toEqual([
      "",
      "orange",
      "green",
      "blue",
      "pink",
      "purple",
      "rose",
      "teal",
      "brown",
      "slate",
    ]);
    expect(isQuickReplyLabelColor("teal")).toBe(true);
    expect(isQuickReplyLabelColor("cyan")).toBe(false);
  });

  it("uses ok true for quick reply category ensure success responses", () => {
    const response: WorkbenchQuickReplyCategoryEnsureResponse = {
      categories: [
        {
          children: [{ id: "secondary-1", title: "二级分类" }],
          id: "primary-1",
          title: "一级分类",
        },
      ],
      ok: true,
      summary: {
        createdPrimaryCategoryCount: 1,
        createdSecondaryCategoryCount: 1,
      },
    };

    expect(response.ok).toBe(true);
  });
});
