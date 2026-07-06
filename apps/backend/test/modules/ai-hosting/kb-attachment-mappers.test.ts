import { describe, expect, it } from "vitest";
import {
  deriveKbAttachmentTitle,
  mapJavaChunkToKbAttachmentListItem,
} from "../../../src/modules/ai-hosting/kb-attachment-mappers.js";

describe("kb-attachment-mappers", () => {
  it("prefers h5 attachment content title over chunk title for link list display", () => {
    const item = mapJavaChunkToKbAttachmentListItem({
      attachmentContent: {
        content: {
          coverUrl: "https://example.com/cover.png",
          href: "https://example.com/article",
          title: "私域操盘手专访",
        },
        materialCollectionId: "mc-1",
        msgInfoId: "msg-1",
        type: "h5",
      },
      attachmentType: 4,
      content: "这是用户填写的链接描述",
      createTime: "2026-06-18 23:22:22",
      docId: 1005,
      id: 501,
      kbId: 1,
      source: 1,
      title: "这是用户填写的链接描述",
      type: 1,
      uid: 9001,
      updateTime: "2026-06-18 23:22:22",
    });

    expect(item).toMatchObject({
      attachmentType: 4,
      description: "这是用户填写的链接描述",
      title: "私域操盘手专访",
    });
  });

  it("keeps chunk title for file attachments", () => {
    expect(
      deriveKbAttachmentTitle("产品说明书.pdf", {
        content: {
          fileName: "manual.pdf",
          fileUrl: "https://example.com/manual.pdf",
        },
        type: "file",
      }),
    ).toBe("产品说明书.pdf");
  });
});
