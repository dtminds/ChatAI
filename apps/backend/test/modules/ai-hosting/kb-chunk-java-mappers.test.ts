import { describe, expect, it } from "vitest";
import {
  mapJavaChunkPageItem,
  parseJavaChunkContent,
} from "../../../src/modules/ai-hosting/kb-chunk-java-mappers.js";

describe("kb-chunk-java-mappers", () => {
  it("parses chunk attachments and inner content from Java payload", () => {
    const parsed = parseJavaChunkContent(
      JSON.stringify({
        chunkAttachment: [
          {
            caption: "1.新增切片\n3/3",
            link: "https://knowledgebase-image.tos-cn-beijing.volces.com/92c7b387-c6c9-4c86-99ba-624ff4eea702",
            type: "image",
            uuid: "92c7b387-c6c9-4c86-99ba-624ff4eea702",
          },
          {
            link: "https://knowledgebase-image.tos-cn-beijing.volces.com/another-image",
            type: "image",
            uuid: "another-image",
          },
        ],
        chunkTitle: "结构化文档标题",
        chunkType: "image",
        content: "123",
      }),
    );

    expect(parsed.content).toBe("123");
    expect(parsed.title).toBe("结构化文档标题");
    expect(parsed.imageUrls).toEqual([
      "https://knowledgebase-image.tos-cn-beijing.volces.com/92c7b387-c6c9-4c86-99ba-624ff4eea702",
      "https://knowledgebase-image.tos-cn-beijing.volces.com/another-image",
    ]);
  });

  it("falls back to plain text content when payload is not JSON", () => {
    expect(parseJavaChunkContent("切片正文")).toEqual({
      content: "切片正文",
      imageUrls: [],
    });
  });

  it("returns empty content when JSON payload lacks content field", () => {
    expect(
      parseJavaChunkContent(
        JSON.stringify({
          chunkAttachment: [
            {
              link: "https://knowledgebase-image.tos-cn-beijing.volces.com/demo.png",
              type: "image",
            },
          ],
          chunkType: "image",
        }),
      ),
    ).toMatchObject({
      chunkType: "image",
      content: "",
      imageUrls: ["https://knowledgebase-image.tos-cn-beijing.volces.com/demo.png"],
    });
  });

  it("maps Java page item into chunk list item", () => {
    expect(
      mapJavaChunkPageItem(
        {
          content: JSON.stringify({
            chunkAttachment: [
              {
                link: "https://knowledgebase-image.tos-cn-beijing.volces.com/demo.png",
                type: "image",
              },
            ],
            chunkType: "image",
            content: "解析文字",
          }),
          createTime: "2026-06-24T18:54:30",
          docId: 30,
          id: 62,
          kbId: 3,
          source: 2,
          title: "切片标题",
          type: 3,
          uid: 272,
          updateTime: "2026-06-24T19:02:34",
          volcChunkId: "volc-chunk-62",
        },
        "document",
      ),
    ).toMatchObject({
      chunkId: "62",
      chunkType: "image",
      content: "解析文字",
      createdAt: "2026-06-24 18:54:30",
      docId: "30",
      imageUrls: ["https://knowledgebase-image.tos-cn-beijing.volces.com/demo.png"],
      kbId: "3",
      source: "system",
      title: "切片标题",
      updatedAt: "2026-06-24 19:02:34",
      volcChunkId: "volc-chunk-62",
    });
  });

  it("normalizes Java chunk display time edge cases", () => {
    expect(
      mapJavaChunkPageItem(
        {
          content: "正文",
          createTime: "",
          docId: 30,
          id: 62,
          kbId: 3,
          source: 2,
          title: "切片标题",
          type: 2,
          uid: 272,
          updateTime: "2026-06-24 18:54:30",
        },
        "document",
      ),
    ).toMatchObject({
      createdAt: "",
      updatedAt: "2026-06-24 18:54:30",
    });

    expect(
      mapJavaChunkPageItem(
        {
          content: "正文",
          createTime: "  2026/06/24 18:54:30  ",
          docId: 30,
          id: 62,
          kbId: 3,
          source: 2,
          title: "切片标题",
          type: 2,
          uid: 272,
          updateTime: "invalid time",
        },
        "document",
      ),
    ).toMatchObject({
      createdAt: "2026/06/24 18:54:30",
      updatedAt: "invalid time",
    });
  });

  it("maps FAQ chunks with an explicit parent doc type", () => {
    expect(
      mapJavaChunkPageItem(
        {
          content: "答案",
          createTime: "2026-06-24T18:54:30",
          docId: 32,
          id: 64,
          kbId: 3,
          source: 1,
          title: "问题",
          type: 1,
          uid: 272,
          updateTime: "2026-06-24T19:02:34",
        },
        "qa",
      ),
    ).toMatchObject({
      chunkId: "64",
      chunkType: "faq",
      content: "答案",
      title: "问题",
    });
  });

  it("maps image doc Java page item with JSON chunkAttachment", () => {
    expect(
      mapJavaChunkPageItem(
        {
          content: JSON.stringify({
            chunkAttachment: [
              {
                link: "kb-images/demo.png",
                type: "image",
              },
            ],
            chunkType: "image",
            content: "图片描述",
          }),
          createTime: "2026-06-24T18:54:30",
          docId: 31,
          id: 63,
          kbId: 3,
          source: 2,
          title: "产品宣传图",
          type: 2,
          uid: 272,
          updateTime: "2026-06-24T19:02:34",
        },
        "image",
      ),
    ).toMatchObject({
      chunkId: "63",
      chunkType: "image",
      content: "图片描述",
      imageUrls: ["https://b5.bokr.com.cn/kb-images/demo.png"],
      title: "产品宣传图",
    });
  });
});
