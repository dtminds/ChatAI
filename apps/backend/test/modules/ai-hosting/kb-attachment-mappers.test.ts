import { describe, expect, it } from "vitest";
import {
  deriveKbAttachmentTitle,
  mapJavaChunkToKbAttachmentListItem,
  mapMaterialItemToKbAttachmentContent,
} from "../../../src/modules/ai-hosting/kb-attachment-mappers.js";
import { mapMaterialCollectionItem } from "../../../src/modules/chat/material-collection-mappers.js";
import type { MaterialCollectionRow } from "../../../src/modules/chat/material-collection-mappers.js";

const linkMaterialRow = {
  biz_status: 1,
  biz_type: 4,
  content: JSON.stringify({
    coverUrl: "https://example.com/cover.png",
    href: "https://example.com/article",
    title: "私域操盘手专访",
  }),
  create_time: new Date("2026-06-18T23:22:22+08:00"),
  group_id: 0,
  id: 1,
  msg_info_id: 1,
  msgid: "",
  op_sub_uid: 101,
  sort: 1,
  source_type: 0,
  sub_uid: 0,
  title: "私域操盘手专访",
  uid: 9001,
  update_time: new Date("2026-06-18T23:22:22+08:00"),
} satisfies MaterialCollectionRow;

describe("kb-attachment-mappers", () => {
  it("prefers h5 attachment content title over chunk title for link list display", () => {
    const materialById = new Map<number, MaterialCollectionRow>([[1, linkMaterialRow]]);
    const item = mapJavaChunkToKbAttachmentListItem(
      {
        attachmentIds: [1],
        attachmentTypes: [4],
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
      },
      materialById,
    );

    expect(item).toMatchObject({
      attachmentType: 4,
      description: "这是用户填写的链接描述",
      materialCollectionId: "1",
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

  it("maps local kb image material with msg_info_id 0", () => {
    const localImageRow = {
      ...linkMaterialRow,
      biz_type: 6,
      content: JSON.stringify({
        fileUrl: "https://example.com/poster.png",
      }),
      id: 2,
      msg_info_id: 0,
      title: "活动海报",
    } satisfies MaterialCollectionRow;

    const content = mapMaterialItemToKbAttachmentContent(
      mapMaterialCollectionItem(localImageRow),
    );

    expect(content).toEqual({
      content: {
        fileUrl: "https://example.com/poster.png",
      },
      materialCollectionId: "2",
      msgInfoId: "0",
      type: "image",
    });

    const materialById = new Map<number, MaterialCollectionRow>([[2, localImageRow]]);
    const item = mapJavaChunkToKbAttachmentListItem(
      {
        attachmentIds: [2],
        attachmentTypes: [6],
        content: "活动海报描述",
        createTime: "2026-06-18 23:22:22",
        docId: 1005,
        id: 502,
        kbId: 1,
        source: 1,
        title: "活动海报",
        type: 1,
        uid: 9001,
        updateTime: "2026-06-18 23:22:22",
      },
      materialById,
    );

    expect(item).toMatchObject({
      attachmentType: 6,
      description: "活动海报描述",
      materialCollectionId: "2",
      attachmentContent: {
        msgInfoId: "0",
        type: "image",
      },
    });
  });
});
