import { describe, expect, it, vi } from "vitest";
import {
  hydrateAgentTestAttachmentReplies,
  parseAttachmentIds,
} from "../../../src/modules/ai-hosting/agent-test-attachment-resolver.js";

vi.mock("../../../src/modules/ai-hosting/kb-attachment-material.repository.js", () => ({
  findKbAttachmentMaterialsByIds: vi.fn(),
}));

vi.mock("../../../src/modules/chat/material-collection-mappers.js", () => ({
  mapMaterialCollectionItem: vi.fn((row: {
    biz_type: number;
    content: string | null;
    id: number;
    title: string | null;
  }) => ({
    bizType: row.biz_type,
    content: row.content ? JSON.parse(row.content) : {},
    contentType: "image",
    id: String(row.id),
    msgInfoId: "0",
    sort: 0,
    title: row.title?.trim() || "",
  })),
}));

import { findKbAttachmentMaterialsByIds } from "../../../src/modules/ai-hosting/kb-attachment-material.repository.js";

describe("parseAttachmentIds", () => {
  it("parses comma-separated material ids", () => {
    expect(parseAttachmentIds("113,114")).toEqual([113, 114]);
  });

  it("parses json array strings", () => {
    expect(parseAttachmentIds("[113, 114]")).toEqual([113, 114]);
  });

  it("ignores invalid values", () => {
    expect(parseAttachmentIds("")).toEqual([]);
    expect(parseAttachmentIds("0,abc,12")).toEqual([12]);
  });
});

describe("hydrateAgentTestAttachmentReplies", () => {
  it("hydrates attachment replies from chunk materials in one reply item", async () => {
    const execute = vi.fn().mockResolvedValue([
      { id: 1234, attachment_ids: "10,11" },
    ]);
    const db = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          execute,
        }),
      }),
    };

    vi.mocked(findKbAttachmentMaterialsByIds).mockResolvedValue(
      new Map([
        [
          10,
          {
            id: 10,
            title: "产品海报.jpg",
            biz_type: 6,
            content: JSON.stringify({ fileUrl: "https://example.com/a.jpg" }),
          } as never,
        ],
        [
          11,
          {
            id: 11,
            title: "大西瓜生椰冷萃",
            biz_type: 3,
            content: JSON.stringify({ title: "大西瓜生椰冷萃", appName: "示例" }),
          } as never,
        ],
      ]),
    );

    const reply = await hydrateAgentTestAttachmentReplies(db as never, 1001, [
      { type: "text", content: "发送给客户的文本消息" },
      { type: "attachment", chunkId: "1234", attachments: [] },
    ]);

    expect(reply).toEqual([
      { type: "text", content: "发送给客户的文本消息" },
      {
        type: "attachment",
        chunkId: "1234",
        attachments: [
          {
            type: "image",
            title: "产品海报.jpg",
            content: { fileUrl: "https://example.com/a.jpg" },
          },
          {
            type: "mini-program",
            title: "大西瓜生椰冷萃",
            content: { title: "大西瓜生椰冷萃", appName: "示例" },
          },
        ],
      },
    ]);
  });

  it("drops attachment replies when materials are missing or unsupported", async () => {
    const execute = vi.fn().mockResolvedValue([
      { id: 88, attachment_ids: "7" },
    ]);
    const db = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          execute,
        }),
      }),
    };

    vi.mocked(findKbAttachmentMaterialsByIds).mockResolvedValue(
      new Map([[7, { id: 7, title: "视频素材", biz_type: 7, content: "{}" } as never]]),
    );

    const reply = await hydrateAgentTestAttachmentReplies(db as never, 1001, [
      { type: "attachment", chunkId: "88", attachments: [] },
      { type: "text", content: "仍然保留" },
    ]);

    expect(reply).toEqual([{ type: "text", content: "仍然保留" }]);
  });
});
