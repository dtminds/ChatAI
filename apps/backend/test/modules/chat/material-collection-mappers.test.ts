import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMessageContentType,
} from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  getMaterialBizTypeForMessageContentType,
  getMaterialContentTypeForBizType,
  mapMaterialCollectionItem,
  type MaterialCollectionRow,
} from "../../../src/modules/chat/material-collection-mappers.js";

describe("material collection mappers", () => {
  it("maps collectible message content types to material biz types", () => {
    expect(getMaterialBizTypeForMessageContentType("emotion")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
    );
    expect(getMaterialBizTypeForMessageContentType("file")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    );
    expect(getMaterialBizTypeForMessageContentType("mini-program")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
    );
    expect(getMaterialBizTypeForMessageContentType("h5")).toBe(
      MATERIAL_COLLECTION_BIZ_TYPE.H5,
    );
    expect(
      getMaterialBizTypeForMessageContentType("text" as WorkbenchMessageContentType),
    ).toBeUndefined();
  });

  it("maps material biz types to collectible message content types", () => {
    expect(
      getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION),
    ).toBe("emotion");
    expect(getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.FILE)).toBe(
      "file",
    );
    expect(
      getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM),
    ).toBe("mini-program");
    expect(getMaterialContentTypeForBizType(MATERIAL_COLLECTION_BIZ_TYPE.H5)).toBe(
      "h5",
    );
  });

  it("maps a file material row to a normalized item dto", () => {
    expect(
      mapMaterialCollectionItem(materialRow({
        biz_type: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        content: JSON.stringify({
          fileExt: "pdf",
          fileName: "报价单.pdf",
          fileSerialNo: "serial-file-001",
          fileSize: 2048,
          fileUrl: "chat-files/quote.pdf",
        }),
        create_time: new Date("2026-06-10T08:00:00.000Z"),
        group_id: 0,
        id: 456,
        msgid: "msg-file-001",
        sort: "12",
        title: "报价单",
        update_time: "1781200000000",
      })),
    ).toEqual({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      content: {
        downloadStatus: undefined,
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSerialNo: "serial-file-001",
        fileSizeLabel: "2.00 KB",
        fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
        sourceLabel: "文件",
      },
      contentType: "file",
      createdAt: 1781078400000,
      groupId: 0,
      id: "456",
      messageId: "msg-file-001",
      sort: 12,
      title: "报价单",
      updatedAt: 1781200000000,
    });
  });

  it("normalizes link style content as h5 through the message mapper", () => {
    expect(
      mapMaterialCollectionItem(materialRow({
        biz_type: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        content: JSON.stringify({
          coverUrl: "covers/h5.png",
          desc: "活动介绍",
          href: "https://example.com/campaign",
          title: "活动页",
        }),
        group_id: 88,
        msgid: "msg-link-001",
        title: "",
      })),
    ).toMatchObject({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      content: {
        description: "活动介绍",
        previewImageUrl: "https://b5.bokr.com.cn/covers/h5.png",
        sourceLabel: "链接",
        title: "活动页",
        url: "https://example.com/campaign",
      },
      contentType: "h5",
      groupId: "88",
      messageId: "msg-link-001",
      title: "活动页",
    });
  });

  it("normalizes string default group id to numeric zero", () => {
    expect(
      mapMaterialCollectionItem(materialRow({
        group_id: "0" as never,
      })).groupId,
    ).toBe(0);
  });

  it("maps ISO timestamp strings from database rows", () => {
    expect(
      mapMaterialCollectionItem(materialRow({
        create_time: "2026-06-10T08:00:00.000Z" as never,
        update_time: "2026-06-11T08:00:00.000Z" as never,
      })),
    ).toMatchObject({
      createdAt: 1781078400000,
      updatedAt: 1781164800000,
    });
  });

  it("throws when a material row has an unsupported biz type", () => {
    expect(() =>
      mapMaterialCollectionItem(materialRow({
        biz_type: 99,
      })),
    ).toThrow("Unsupported material collection biz type");
  });

  it("normalizes weapp style content as mini-program and falls back to appName title", () => {
    expect(
      mapMaterialCollectionItem(materialRow({
        biz_type: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
        content: JSON.stringify({
          description: "",
          fileUrl: "mini-program/cover.png",
          logoUrl: "mini-program/logo.png",
          title: "企微助手",
        }),
        msgid: "msg-mini-program-001",
        title: "",
      })),
    ).toMatchObject({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
      content: {
        appName: "企微助手",
        coverImageUrl: "https://b5.bokr.com.cn/mini-program/cover.png",
        logoUrl: "https://b5.bokr.com.cn/mini-program/logo.png",
        sourceLabel: "小程序",
        title: "小程序",
      },
      contentType: "mini-program",
      messageId: "msg-mini-program-001",
      title: "企微助手",
    });
  });
});

function materialRow(overrides: Partial<MaterialCollectionRow> = {}): MaterialCollectionRow {
  return {
    biz_status: 1,
    biz_type: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    content: null,
    create_time: 1_781_000_000_000 as unknown as Date,
    group_id: 0,
    id: 1,
    msgid: "msg-001",
    op_sub_uid: 9,
    sort: 0,
    sub_uid: 0,
    title: "",
    uid: 100,
    update_time: 1_781_000_100_000 as unknown as Date,
    ...overrides,
  };
}
