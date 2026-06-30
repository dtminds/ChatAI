import { describe, expect, it } from "vitest";
import { toKbDocChunkViewItem, toKbListViewItem } from "@/pages/chat/ai-hosting/api/kb-service";

describe("kb-service time formatting", () => {
  it("formats kb list timestamps in Asia/Shanghai wall clock", () => {
    expect(
      toKbListViewItem({
        createdAt: "2026-06-19T14:02:22.000Z",
        description: "",
        kbId: "1",
        name: "测试知识库",
        updatedAt: "2026-06-20T14:02:22.000Z",
      }),
    ).toMatchObject({
      createdAt: "2026-06-19 22:02:22",
      lastUpdatedAt: "2026-06-20 22:02:22",
    });
  });
});

describe("kb-service chunk display mapping", () => {
  it("displays volc chunk indexes as one-based labels", () => {
    expect(
      toKbDocChunkViewItem(
        {
          chunkId: "501",
          chunkType: "text",
          content: "切片正文",
          createdAt: "2026-06-19T14:02:22.000Z",
          docId: "1001",
          kbId: "1",
          source: "manual",
          title: "切片标题",
          updatedAt: "2026-06-20T14:02:22.000Z",
          volcChunkId: "kb_doc_volc-chunk-doc-0",
        },
        "document",
      ),
    ).toMatchObject({
      displayChunkId: "volc-chunk-doc",
      displayChunkIndex: "1",
    });
  });

  it("does not increment non-decimal volc chunk indexes", () => {
    expect(
      toKbDocChunkViewItem(
        {
          chunkId: "501",
          chunkType: "text",
          content: "切片正文",
          createdAt: "2026-06-19T14:02:22.000Z",
          docId: "1001",
          kbId: "1",
          source: "manual",
          title: "切片标题",
          updatedAt: "2026-06-20T14:02:22.000Z",
          volcChunkId: "kb_doc_volc-chunk-doc-1e2",
        },
        "document",
      ),
    ).toMatchObject({
      displayChunkId: "volc-chunk-doc",
      displayChunkIndex: "1e2",
    });
  });
});
