import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/schema.js";
import type { AgentKbJavaClient } from "../../../src/modules/ai-hosting/agent-kb-java-client.js";
import { KbReadService } from "../../../src/modules/ai-hosting/kb-read.service.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

function createMockJavaClient(
  overrides: Partial<AgentKbJavaClient> = {},
): AgentKbJavaClient {
  return {
    addKbChunk: vi.fn(),
    createKbDoc: vi.fn(),
    deleteKbChunk: vi.fn(),
    deleteKbDoc: vi.fn(),
    listKbChunks: vi.fn().mockResolvedValue({
      count: 0,
      list: [],
      page: 1,
      pageSize: 10,
    }),
    updateKbChunk: vi.fn(),
    ...overrides,
  };
}

describe("KbReadService", () => {
  const service = new KbReadService(
    createKbReadDbMock() as unknown as Kysely<Database>,
    createMockJavaClient(),
  );

  it("lists kbs for the current uid", async () => {
    const response = await service.listKbs("101");

    expect(response.kbs).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
    expect(response.kbs[0]).toMatchObject({
      kbId: "1",
      name: "华为产品知识",
    });
  });

  it("filters docs by kb and maps sync status", async () => {
    const response = await service.listKbDocs("101", "1");

    expect(response.docs.length).toBeGreaterThanOrEqual(1);
    expect(response.docs[0]).toMatchObject({
      docId: "1001",
      docType: "document",
      status: "completed",
    });
  });

  it("rejects kb outside the tenant scope", async () => {
    await expect(service.getKb("101", "999")).rejects.toMatchObject({
      code: "KB_NOT_FOUND",
    });
  });
});
