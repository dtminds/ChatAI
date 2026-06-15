import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  MATERIAL_COLLECTION_GROUP_MAX_COUNT,
  MaterialCollectionBizTypeSchema,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionCreateResponse,
  type WorkbenchMaterialCollectionGroupCreateRequest,
  type WorkbenchMaterialCollectionGroupCreateResponse,
  type WorkbenchMaterialCollectionGroupDto,
  type WorkbenchMaterialCollectionGroupListRequest,
  type WorkbenchMaterialCollectionGroupListResponse,
  type WorkbenchMaterialCollectionGroupUpdateRequest,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchMaterialCollectionListRequest,
  type WorkbenchMaterialCollectionListResponse,
  type WorkbenchMaterialCollectionMoveRequest,
  type WorkbenchMaterialCollectionOkResponse,
} from "../src/index";

describe("chat material collection DTOs", () => {
  it("exposes shared material collection biz type values", () => {
    expect(MATERIAL_COLLECTION_BIZ_TYPE).toEqual({
      EXPRESSION: 1,
      FILE: 2,
      MINI_PROGRAM: 3,
      H5: 4,
      SPHFEED: 5,
    });
    expect(MATERIAL_COLLECTION_GROUP_MAX_COUNT).toBe(20);

    const compiler = TypeCompiler.Compile(MaterialCollectionBizTypeSchema);

    expect(compiler.Check(MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION)).toBe(true);
    expect(compiler.Check(MATERIAL_COLLECTION_BIZ_TYPE.FILE)).toBe(true);
    expect(compiler.Check(MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM)).toBe(true);
    expect(compiler.Check(MATERIAL_COLLECTION_BIZ_TYPE.H5)).toBe(true);
    expect(compiler.Check(MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED)).toBe(true);
    expect(compiler.Check(0)).toBe(false);
    expect(compiler.Check("1")).toBe(false);
  });

  it("accepts representative list item and group DTO assignments", () => {
    const defaultGroupItem: WorkbenchMaterialCollectionItemDto = {
      id: "collection-1",
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      groupId: 0,
      title: "表情",
      sort: 10,
      messageId: "msgid-1001",
      contentType: "emotion",
      content: {
        fileUrl: "https://example.com/emotion.gif",
        md5: "emotion-md5",
      },
      createdAt: 1_781_187_200_000,
    };

    const customGroup: WorkbenchMaterialCollectionGroupDto = {
      id: "group-1",
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      title: "常用文件",
      sort: 20,
    };

    const customGroupItem: WorkbenchMaterialCollectionItemDto = {
      id: "collection-2",
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: customGroup.id,
      title: "报价单.pdf",
      sort: 30,
      messageId: "msgid-1002",
      contentType: "file",
      content: {
        fileName: "报价单.pdf",
        fileSize: 1024,
      },
      updatedAt: 1_781_187_300_000,
    };

    const h5Item: WorkbenchMaterialCollectionItemDto = {
      id: "collection-3",
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      groupId: "group-h5",
      title: "活动页",
      sort: 40,
      messageId: "msgid-1003",
      contentType: "h5",
      content: {
        title: "活动页",
        url: "https://example.com/activity",
      },
    };

    const miniProgramItem: WorkbenchMaterialCollectionItemDto = {
      id: "collection-4",
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
      groupId: "group-mini-program",
      title: "小程序",
      sort: 50,
      messageId: "msgid-1004",
      contentType: "mini-program",
      content: {
        appid: "wx-appid",
        path: "/pages/index",
      },
    };

    expect(defaultGroupItem.groupId).toBe(0);
    expect(customGroupItem.messageId).toBe("msgid-1002");
    expect([h5Item.contentType, miniProgramItem.contentType]).toEqual([
      "h5",
      "mini-program",
    ]);
  });

  it("accepts list create group move and ok request/response contracts", () => {
    const listRequest: WorkbenchMaterialCollectionListRequest = {
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "group-1",
      page: 1,
      pageSize: 100,
    };

    const fileGroup: WorkbenchMaterialCollectionGroupDto = {
      id: "group-1",
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      title: "常用文件",
      sort: 1,
    };

    const listResponse: WorkbenchMaterialCollectionListResponse = {
      items: [
        {
          id: "collection-1",
          bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
          groupId: "group-1",
          title: "报价单.pdf",
          sort: 1,
          messageId: "msgid-1001",
          contentType: "file",
          content: {
            fileName: "报价单.pdf",
          },
        },
      ],
      pagination: {
        hasMore: false,
        page: 1,
        pageSize: 100,
        total: 1,
      },
    };

    const groupListRequest: WorkbenchMaterialCollectionGroupListRequest = {
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    };

    const groupListResponse: WorkbenchMaterialCollectionGroupListResponse = {
      groups: [fileGroup],
    };

    const createRequest: WorkbenchMaterialCollectionCreateRequest = {
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
      messageId: "msgid-1002",
      groupId: "group-2",
    };

    const createResponse: WorkbenchMaterialCollectionCreateResponse = {
      success: true,
      duplicated: true,
    };

    const groupCreateRequest: WorkbenchMaterialCollectionGroupCreateRequest = {
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      title: "活动链接",
    };
    const groupCreateResponse: WorkbenchMaterialCollectionGroupCreateResponse = {
      id: "group-h5",
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      title: "活动链接",
      sort: 2,
    };

    const groupUpdateRequest: WorkbenchMaterialCollectionGroupUpdateRequest = {
      title: "新活动链接",
    };

    const moveRequest: WorkbenchMaterialCollectionMoveRequest = {
      groupId: "group-h5",
    };

    const okResponse: WorkbenchMaterialCollectionOkResponse = {
      ok: true,
    };

    expect(listRequest.bizType).toBe(2);
    expect(listResponse.pagination.pageSize).toBe(100);
    expect(groupListRequest.bizType).toBe(2);
    expect(groupListResponse.groups).toHaveLength(1);
    expect(createRequest.messageId).toBe("msgid-1002");
    expect(createResponse.duplicated).toBe(true);
    expect(groupCreateRequest.bizType).toBe(4);
    expect(groupCreateResponse.id).toBe("group-h5");
    expect(groupUpdateRequest.title).toBe("新活动链接");
    expect(moveRequest.groupId).toBe("group-h5");
    expect(okResponse.ok).toBe(true);

    expectTypeOf(groupCreateRequest.bizType).toEqualTypeOf<2 | 3 | 4 | 5>();
  });
});
