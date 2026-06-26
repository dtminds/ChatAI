import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/schema.js";
import type { AgentKbJavaClient } from "../../../src/modules/ai-hosting/agent-kb-java-client.js";
import { KbReadService } from "../../../src/modules/ai-hosting/kb-read.service.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

const javaChunkPageItems = [
  {
    content: "切片正文",
    createTime: "2026-06-18T15:22:22.000Z",
    docId: 1001,
    id: 501,
    kbId: 1,
    source: 1,
    title: "切片标题",
    type: 2,
    uid: 9001,
    updateTime: "2026-06-18T15:22:22.000Z",
  },
  {
    content: "系统切片正文",
    createTime: "2026-06-18T15:22:22.000Z",
    docId: 1001,
    id: 502,
    kbId: 1,
    source: 2,
    title: "系统切片",
    type: 2,
    uid: 9001,
    updateTime: "2026-06-18T15:22:22.000Z",
  },
];

function createService(listKbChunks = vi.fn()) {
  const agentKbJavaClient = {
    addKbChunk: vi.fn(),
    createKbDoc: vi.fn(),
    deleteKbChunk: vi.fn(),
    deleteKbDoc: vi.fn(),
    listKbChunks,
    updateKbChunk: vi.fn(),
  } satisfies AgentKbJavaClient;

  return {
    agentKbJavaClient,
    service: new KbReadService(
      createKbReadDbMock() as unknown as Kysely<Database>,
      agentKbJavaClient,
    ),
  };
}

describe("KbReadService", () => {
  it("lists kbs for the current uid", async () => {
    const { service } = createService();

    const response = await service.listKbs("101");

    expect(response.kbs).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
    expect(response.kbs[0]).toMatchObject({
      kbId: "1",
      name: "华为产品知识",
    });
  });

  it("allows loading up to 200 kbs for local picker searches", async () => {
    const { service } = createService();

    const response = await service.listKbs("101", {
      page: 1,
      pageSize: 200,
    });

    expect(response.pagination.pageSize).toBe(200);
  });

  it("filters docs by kb and maps sync status", async () => {
    const { service } = createService();

    const response = await service.listKbDocs("101", "1");

    expect(response.docs.length).toBeGreaterThanOrEqual(1);
    expect(response.docs[0]).toMatchObject({
      docId: "1001",
      docType: "document",
      status: "completed",
    });
  });

  it("lists chunks via Java with pagination", async () => {
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 2,
      list: javaChunkPageItems,
      page: 1,
      pageSize: 10,
    });
    const { agentKbJavaClient, service } = createService(listKbChunks);

    const response = await service.listKbDocChunks("101", "1001");

    expect(agentKbJavaClient.listKbChunks).toHaveBeenCalledWith({
      docId: 1001,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });
    expect(response.chunks).toHaveLength(2);
    expect(response.pagination.total).toBe(2);
    expect(response.chunks[0]).toMatchObject({
      chunkId: "501",
      source: "manual",
      title: "切片标题",
    });
  });

  it("forwards chunk title filter to Java", async () => {
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 1,
      list: [javaChunkPageItems[1]],
      page: 1,
      pageSize: 10,
    });
    const { service } = createService(listKbChunks);

    const response = await service.listKbDocChunks("101", "1001", {
      page: 1,
      pageSize: 10,
      title: "系统",
    });

    expect(listKbChunks).toHaveBeenCalledWith({
      docId: 1001,
      page: 1,
      pageSize: 10,
      title: "系统",
      uid: 9001,
    });
    expect(response.chunks).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
    expect(response.chunks[0]).toMatchObject({
      chunkId: "502",
      title: "系统切片",
    });
  });

  it("rejects kb outside the tenant scope", async () => {
    const { service } = createService();

    await expect(service.getKb("101", "999")).rejects.toMatchObject({
      code: "KB_NOT_FOUND",
    });
  });
});
