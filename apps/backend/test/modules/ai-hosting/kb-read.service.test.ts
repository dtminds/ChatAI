import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/schema.js";
import { KbReadService } from "../../../src/modules/ai-hosting/kb-read.service.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

describe("KbReadService", () => {
  const service = new KbReadService(createKbReadDbMock() as unknown as Kysely<Database>);

  it("lists kbs for the current uid", async () => {
    const response = await service.listKbs("101");

    expect(response.kbs).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
    expect(response.kbs[0]).toMatchObject({
      kbId: "1",
      name: "华为产品知识",
    });
  });

  it("allows loading up to 200 kbs for local picker searches", async () => {
    const response = await service.listKbs("101", {
      page: 1,
      pageSize: 200,
    });

    expect(response.pagination.pageSize).toBe(200);
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

  it("lists chunks from the database with pagination", async () => {
    const response = await service.listKbDocChunks("101", "1001");

    expect(response.chunks).toHaveLength(2);
    expect(response.pagination.total).toBe(2);
    expect(response.chunks[0]).toMatchObject({
      chunkId: "501",
      source: "manual",
      title: "切片标题",
    });
  });

  it("filters chunks by title or content before pagination", async () => {
    const response = await service.listKbDocChunks("101", "1001", {
      page: 1,
      pageSize: 10,
      query: "系统",
    });

    expect(response.chunks).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
    expect(response.chunks[0]).toMatchObject({
      chunkId: "502",
      title: "系统切片",
    });
  });

  it("treats percent in query as literal text", async () => {
    const response = await service.listKbDocChunks("101", "1001", {
      page: 1,
      pageSize: 10,
      query: "%",
    });

    expect(response.chunks).toHaveLength(0);
    expect(response.pagination.total).toBe(0);
  });

  it("rejects kb outside the tenant scope", async () => {
    await expect(service.getKb("101", "999")).rejects.toMatchObject({
      code: "KB_NOT_FOUND",
    });
  });
});
