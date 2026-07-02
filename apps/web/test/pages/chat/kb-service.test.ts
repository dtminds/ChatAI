import { describe, expect, it } from "vitest";
import {
  toKbDocChunkViewItem,
  toKbDocViewItem,
  toKbListViewItem,
} from "@/pages/chat/ai-hosting/api/kb-service";

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

  it("keeps Java chunk naive timestamps as display wall clock", () => {
    expect(
      toKbDocChunkViewItem(
        {
          chunkId: "501",
          chunkType: "text",
          content: "切片正文",
          createdAt: "2026-06-24 18:54:30",
          docId: "1001",
          kbId: "1",
          source: "manual",
          title: "切片标题",
          updatedAt: "2026-06-24 19:02:34",
        },
        "document",
      ),
    ).toMatchObject({
      createdAt: "2026-06-24 18:54:30",
      updatedAt: "2026-06-24 19:02:34",
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

describe("kb-service doc display mapping", () => {
  it("appends doc suffix once and formats document size", () => {
    expect(
      toKbDocViewItem({
        briefSummary: "文档摘要",
        createdAt: "2026-06-19T14:02:22.000Z",
        docId: "1001",
        docSize: 1536,
        docSuffix: "pdf",
        hasDocSummary: true,
        docType: "document",
        kbId: "1",
        name: "产品手册",
        sliceCount: 3,
        status: "completed",
        updatedAt: "2026-06-20T14:02:22.000Z",
      }),
    ).toMatchObject({
      fileSize: "1.50KB",
      nameWithExtension: "产品手册.pdf",
    });

    expect(
      toKbDocViewItem({
        createdAt: "2026-06-19T14:02:22.000Z",
        docId: "1002",
        docSize: 1024,
        docSuffix: "faq.xlsx",
        hasDocSummary: false,
        docType: "qa",
        kbId: "1",
        name: "导入问答.faq",
        sliceCount: 3,
        status: "completed",
        updatedAt: "2026-06-20T14:02:22.000Z",
      }),
    ).toMatchObject({
      fileSize: "1KB",
      nameWithExtension: "导入问答.faq.xlsx",
    });

    expect(
      toKbDocViewItem({
        createdAt: "2026-06-19T14:02:22.000Z",
        docId: "1003",
        docSize: 0,
        docSuffix: "docx",
        hasDocSummary: false,
        docType: "document",
        kbId: "1",
        name: "空文档",
        sliceCount: 0,
        status: "completed",
        updatedAt: "2026-06-20T14:02:22.000Z",
      }),
    ).toMatchObject({
      fileSize: "-",
      nameWithExtension: "空文档.docx",
    });
  });
});
