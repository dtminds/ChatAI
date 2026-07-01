import { describe, expect, it } from "vitest";
import {
  mapDocType,
  mapKbChunkListItem,
  mapKbDocDetail,
  mapKbDocListItem,
  mapKbListItem,
  mapSyncStatus,
} from "../../../src/modules/ai-hosting/kb-read-mappers.js";

describe("kb-read-mappers", () => {
  it("maps kb list item fields", () => {
    expect(
      mapKbListItem({
        create_time: new Date("2026-06-19T14:02:22.000Z"),
        id: 88,
        last_operator_id: 1,
        name: "售后问题解答",
        operator_id: 1,
        remark: "退换货、维修、保修流程与话术",
        status: 1,
        uid: 9001,
        update_time: new Date("2026-06-20T14:02:22.000Z"),
      }),
    ).toEqual({
      createdAt: "2026-06-19T14:02:22.000Z",
      description: "退换货、维修、保修流程与话术",
      kbId: "88",
      name: "售后问题解答",
      updatedAt: "2026-06-20T14:02:22.000Z",
    });
  });

  it("maps doc type and sync status", () => {
    expect(mapDocType(1)).toBe("qa");
    expect(mapDocType(2)).toBe("document");
    expect(mapDocType(3)).toBe("image");
    expect(mapSyncStatus(0)).toBe("completed");
    expect(mapSyncStatus(1)).toBe("failed");
    expect(mapSyncStatus(3)).toBe("parsing");
    expect(mapSyncStatus(-1)).toBe("queued");
  });

  it("maps doc list item with failed status message", () => {
    expect(
      mapKbDocListItem({
        brief_summary: "覆盖产品规格和售后政策",
        create_time: new Date("2026-06-18T15:22:22.000Z"),
        doc_process_time: null,
        doc_size: 4096,
        doc_suffix: "doc",
        doc_type: 2,
        doc_update_time: null,
        doc_url: "kb-docs/example.doc",
        id: 1001,
        kb_id: 88,
        last_operator_id: 1,
        last_sync_time: null,
        name: "产品说明大全",
        operator_id: 1,
        point_num: 20,
        remark: null,
        status: 1,
        sync_error_msg: "解析失败",
        sync_status: 1,
        has_doc_summary: 1,
        tokens: null,
        uid: 9001,
        update_time: new Date("2026-06-20T15:22:22.000Z"),
        volc_doc_id: "volc-doc-1",
        volc_resource_id: null,
        volc_strategy_resource_id: null,
      }),
    ).toMatchObject({
      briefSummary: "覆盖产品规格和售后政策",
      docId: "1001",
      docSize: 4096,
      hasDocSummary: true,
      docType: "document",
      kbId: "88",
      status: "failed",
      statusMessage: "解析失败",
    });
  });

  it("maps doc detail summary content", () => {
    expect(
      mapKbDocDetail({
        brief_summary: "覆盖产品规格和售后政策",
        create_time: new Date("2026-06-18T15:22:22.000Z"),
        doc_process_time: null,
        doc_size: 4096,
        doc_summary: "## 文档概览\n\n- 产品规格",
        doc_suffix: "doc",
        doc_type: 2,
        doc_update_time: null,
        has_doc_summary: 1,
        id: 1001,
        kb_id: 88,
        last_operator_id: 1,
        last_sync_time: null,
        name: "产品说明大全",
        operator_id: 1,
        point_num: 20,
        remark: null,
        status: 1,
        sync_error_msg: null,
        sync_status: 0,
        tokens: null,
        uid: 9001,
        update_time: new Date("2026-06-20T15:22:22.000Z"),
        volc_doc_id: "volc-doc-1",
        volc_resource_id: null,
        volc_strategy_resource_id: null,
      }),
    ).toMatchObject({
      docSummary: "## 文档概览\n\n- 产品规格",
      hasDocSummary: true,
      previewImageUrl: undefined,
      volcDocId: "volc-doc-1",
    });
  });

  it("maps image doc detail preview url", () => {
    expect(
      mapKbDocDetail({
        brief_summary: null,
        create_time: new Date("2026-06-18T15:22:22.000Z"),
        doc_process_time: null,
        doc_size: 2048,
        doc_summary: null,
        doc_suffix: "png",
        doc_type: 3,
        doc_update_time: null,
        doc_url: "kb-images/example.png",
        has_doc_summary: 0,
        id: 1002,
        kb_id: 88,
        last_operator_id: 1,
        last_sync_time: null,
        name: "产品宣传图",
        operator_id: 1,
        point_num: 1,
        remark: null,
        status: 1,
        sync_error_msg: null,
        sync_status: 0,
        tokens: null,
        uid: 9001,
        update_time: new Date("2026-06-20T15:22:22.000Z"),
        volc_doc_id: null,
        volc_resource_id: null,
        volc_strategy_resource_id: null,
      }),
    ).toMatchObject({
      docType: "image",
      previewImageUrl: "https://b5.bokr.com.cn/kb-images/example.png",
    });
  });

  it("maps chunk source from database row", () => {
    const manualText = mapKbChunkListItem(
      {
        content: "正文",
        create_time: new Date("2026-06-18T15:22:22.000Z"),
        description: null,
        doc_id: 1001,
        html_content: null,
        id: 501,
        kb_id: 88,
        last_sync_time: null,
        md_content: null,
        point_process_time: null,
        point_update_time: null,
        source: 1,
        status: 1,
        sync_status: 0,
        title: "标题",
        tokens: null,
        type: "text",
        uid: 9001,
        update_time: new Date("2026-06-18T15:22:22.000Z"),
        volc_chunk_id: null,
        volc_doc_id: null,
        volc_resource_id: null,
      },
      "document",
    );
    const systemChunk = mapKbChunkListItem(
      {
        content: "正文",
        create_time: new Date("2026-06-18T15:22:22.000Z"),
        description: null,
        doc_id: 1001,
        html_content: null,
        id: 502,
        kb_id: 88,
        last_sync_time: null,
        md_content: null,
        point_process_time: null,
        point_update_time: null,
        source: 2,
        status: 1,
        sync_status: 0,
        title: "标题",
        tokens: null,
        type: "text",
        uid: 9001,
        update_time: new Date("2026-06-18T15:22:22.000Z"),
        volc_chunk_id: null,
        volc_doc_id: null,
        volc_resource_id: null,
      },
      "document",
    );

    expect(manualText.source).toBe("manual");
    expect(systemChunk.source).toBe("system");
  });

  it("parses JSON content stored in database rows", () => {
    expect(
      mapKbChunkListItem(
        {
          content: JSON.stringify({
            chunkAttachment: [
              {
                link: "https://knowledgebase-image.tos-cn-beijing.volces.com/demo.png",
                type: "image",
              },
            ],
            chunkTitle: "结构化标题",
            chunkType: "image",
            content: "解析文字",
          }),
          create_time: new Date("2026-06-18T15:22:22.000Z"),
          description: null,
          doc_id: 1001,
          html_content: null,
          id: 504,
          kb_id: 1,
          last_sync_time: null,
          md_content: null,
          point_process_time: null,
          point_update_time: null,
          source: 2,
          status: 1,
          sync_status: 0,
          title: "切片标题",
          tokens: null,
          type: "text",
          uid: 9001,
          update_time: new Date("2026-06-18T15:22:22.000Z"),
          volc_chunk_id: null,
          volc_doc_id: null,
          volc_resource_id: null,
        },
        "document",
      ),
    ).toMatchObject({
      chunkId: "504",
      chunkType: "image",
      content: "解析文字",
      imageUrls: ["https://knowledgebase-image.tos-cn-beijing.volces.com/demo.png"],
      source: "system",
      title: "切片标题",
    });
  });

  it("maps image doc chunks with JSON chunkAttachment like document chunks", () => {
    expect(
      mapKbChunkListItem(
        {
          content: JSON.stringify({
            chunkAttachment: [
              {
                link: "kb-images/demo.png",
                type: "image",
              },
            ],
            chunkType: "image",
            content: "图片描述文字",
          }),
          create_time: new Date("2026-06-18T15:22:22.000Z"),
          description: "兜底描述",
          doc_id: 1002,
          html_content: null,
          id: 505,
          kb_id: 1,
          last_sync_time: null,
          md_content: null,
          point_process_time: null,
          point_update_time: null,
          source: 2,
          status: 1,
          sync_status: 0,
          title: "产品宣传图",
          tokens: null,
          type: "text",
          uid: 9001,
          update_time: new Date("2026-06-18T15:22:22.000Z"),
          volc_chunk_id: null,
          volc_doc_id: null,
          volc_resource_id: null,
        },
        "image",
      ),
    ).toMatchObject({
      chunkId: "505",
      chunkType: "image",
      content: "图片描述文字",
      imageUrls: ["https://b5.bokr.com.cn/kb-images/demo.png"],
      title: "产品宣传图",
    });
  });

  it("does not treat JSON content as a raw image path", () => {
    expect(
      mapKbChunkListItem(
        {
          content: JSON.stringify({
            chunkType: "image",
            content: "仅描述文字",
          }),
          create_time: new Date("2026-06-18T15:22:22.000Z"),
          description: null,
          doc_id: 1002,
          html_content: null,
          id: 506,
          kb_id: 1,
          last_sync_time: null,
          md_content: null,
          point_process_time: null,
          point_update_time: null,
          source: 2,
          status: 1,
          sync_status: 0,
          title: "产品宣传图",
          tokens: null,
          type: "image",
          uid: 9001,
          update_time: new Date("2026-06-18T15:22:22.000Z"),
          volc_chunk_id: null,
          volc_doc_id: null,
          volc_resource_id: null,
        },
        "image",
      ),
    ).toMatchObject({
      chunkType: "image",
      content: "仅描述文字",
      imageUrls: undefined,
    });
  });

  it("maps image chunk url and analysis text", () => {
    expect(
      mapKbChunkListItem(
        {
          content: "kb-images/example.png",
          create_time: new Date("2026-06-18T15:22:22.000Z"),
          description: "对该图片的解析文字",
          doc_id: 1002,
          html_content: null,
          id: 503,
          kb_id: 1,
          last_sync_time: null,
          md_content: null,
          point_process_time: null,
          point_update_time: null,
          source: 2,
          status: 1,
          sync_status: 0,
          title: "产品宣传图",
          tokens: null,
          type: "image",
          uid: 9001,
          update_time: new Date("2026-06-18T15:22:22.000Z"),
          volc_chunk_id: null,
          volc_doc_id: null,
          volc_resource_id: null,
        },
        "image",
      ),
    ).toEqual({
      chunkId: "503",
      chunkType: "image",
      content: "对该图片的解析文字",
      createdAt: "2026-06-18T15:22:22.000Z",
      description: "对该图片的解析文字",
      docId: "1002",
      imageUrls: ["https://b5.bokr.com.cn/kb-images/example.png"],
      kbId: "1",
      source: "system",
      title: "产品宣传图",
      updatedAt: "2026-06-18T15:22:22.000Z",
    });
  });

  it("does not reinterpret Date values as Shanghai wall clock", () => {
    expect(
      mapKbListItem({
        create_time: new Date("2026-06-19T14:02:22.000Z"),
        id: 88,
        last_operator_id: 1,
        name: "售后问题解答",
        operator_id: 1,
        remark: "退换货、维修、保修流程与话术",
        status: 1,
        uid: 9001,
        update_time: new Date("2026-06-20T14:02:22.000Z"),
      }),
    ).toMatchObject({
      createdAt: "2026-06-19T14:02:22.000Z",
      updatedAt: "2026-06-20T14:02:22.000Z",
    });
  });

  it("treats mysql datetime strings as Asia/Shanghai wall clock", () => {
    expect(
      mapKbListItem({
        create_time: "2026-06-19 14:02:22",
        id: 88,
        last_operator_id: 1,
        name: "售后问题解答",
        operator_id: 1,
        remark: "退换货、维修、保修流程与话术",
        status: 1,
        uid: 9001,
        update_time: "2026-06-20 14:02:22",
      }),
    ).toEqual({
      createdAt: "2026-06-19T06:02:22.000Z",
      description: "退换货、维修、保修流程与话术",
      kbId: "88",
      name: "售后问题解答",
      updatedAt: "2026-06-20T06:02:22.000Z",
    });
  });
});
