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

const tenant = {
  subUserId: "101",
  uid: 9001,
};

const kbListColumns = ["id", "name", "remark", "create_time", "update_time"];
const kbDocListColumns = [
  "brief_summary",
  "id",
  "kb_id",
  "name",
  "remark",
  "doc_size",
  "doc_suffix",
  "doc_type",
  "point_num",
  "sync_error_msg",
  "sync_status",
  "create_time",
  "update_time",
  "has_doc_summary",
];
const kbDocDetailColumns = [
  "brief_summary",
  "id",
  "kb_id",
  "name",
  "remark",
  "doc_size",
  "doc_suffix",
  "doc_type",
  "point_num",
  "sync_error_msg",
  "sync_status",
  "create_time",
  "update_time",
  "doc_summary",
  "doc_url",
  "volc_doc_id",
];

function createService(
  listKbChunks = vi.fn(),
  dbOptions?: Parameters<typeof createKbReadDbMock>[0],
) {
  const agentKbJavaClient = {
    addKbChunk: vi.fn(),
    createKbDoc: vi.fn(),
    deleteKbChunk: vi.fn(),
    deleteKbDoc: vi.fn(),
    retryKbDoc: vi.fn(),
    listKbChunks,
    updateKbChunk: vi.fn(),
  } satisfies AgentKbJavaClient;

  return {
    agentKbJavaClient,
    service: new KbReadService(
      createKbReadDbMock(dbOptions) as unknown as Kysely<Database>,
      agentKbJavaClient,
    ),
  };
}

function createBlockedListProbe(table: string) {
  const queryStarts: Array<{ isCountQuery: boolean; table: string }> = [];
  let releaseRowsQuery: (() => void) | undefined;
  const rowsQueryGate = new Promise<void>((resolve) => {
    releaseRowsQuery = resolve;
  });

  return {
    dbOptions: {
      async beforeExecute(event) {
        if (event.table !== table) {
          return;
        }

        queryStarts.push({
          isCountQuery: event.isCountQuery,
          table: event.table,
        });

        if (event.type === "execute" && !event.isCountQuery) {
          await rowsQueryGate;
        }
      },
    },
    queryStarts,
    releaseRowsQuery: () => releaseRowsQuery?.(),
  } satisfies {
    dbOptions: Parameters<typeof createKbReadDbMock>[0];
    queryStarts: Array<{ isCountQuery: boolean; table: string }>;
    releaseRowsQuery: () => void;
  };
}

describe("KbReadService", () => {
  it("lists kbs for the current uid", async () => {
    const { service } = createService();

    const response = await service.listKbs(tenant);

    expect(response.kbs).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
    expect(response).not.toHaveProperty("quota");
    expect(response.kbs[0]).toMatchObject({
      kbId: "1",
      name: "华为产品知识",
    });
  });

  it("excludes deleted kbs from list totals", async () => {
    const { service } = createService(vi.fn(), {
      deletedKbCount: 3,
      totalKbCount: 20,
    });

    const response = await service.listKbs(tenant);

    expect(response.pagination.total).toBe(20);
    expect(response).not.toHaveProperty("quota");
  });

  it("allows loading up to 200 kbs for local picker searches", async () => {
    const { service } = createService();

    const response = await service.listKbs(tenant, {
      page: 1,
      pageSize: 200,
    });

    expect(response.pagination.pageSize).toBe(200);
  });

  it("filters kb searches by name only", async () => {
    const { service } = createService();

    const response = await service.listKbs(tenant, {
      query: "常见问题",
    });

    expect(response.kbs).toHaveLength(0);
    expect(response.pagination.total).toBe(0);
  });

  it("rejects kb list search queries longer than 32 characters", async () => {
    const { service } = createService();

    await expect(
      service.listKbs(tenant, {
        query: "a".repeat(33),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_KB_QUERY",
      statusCode: 400,
    });
  });

  it("does not run an extra kb quota count when the kb list is unfiltered", async () => {
    const probe = createBlockedListProbe("xy_wap_embed_agent_kb");
    const { service } = createService(vi.fn(), probe.dbOptions);

    const responsePromise = service.listKbs(tenant);
    await vi.waitFor(() => {
      expect(probe.queryStarts).toEqual([
        { isCountQuery: false, table: "xy_wap_embed_agent_kb" },
        { isCountQuery: true, table: "xy_wap_embed_agent_kb" },
      ]);
    });
    probe.releaseRowsQuery();

    await expect(responsePromise).resolves.toMatchObject({
      pagination: {
        total: 1,
      },
    });
  });

  it("does not run an unfiltered kb quota count when searching kbs", async () => {
    const probe = createBlockedListProbe("xy_wap_embed_agent_kb");
    const { service } = createService(vi.fn(), probe.dbOptions);

    const responsePromise = service.listKbs(tenant, { query: "不存在" });
    await vi.waitFor(() => {
      expect(probe.queryStarts).toEqual([
        { isCountQuery: false, table: "xy_wap_embed_agent_kb" },
        { isCountQuery: true, table: "xy_wap_embed_agent_kb" },
      ]);
    });
    probe.releaseRowsQuery();

    await expect(responsePromise).resolves.toMatchObject({
      pagination: {
        total: 0,
      },
    });
  });

  it("selects only kb list fields for kb list rows", async () => {
    const selectedListQueries: Array<{ selectedAll: boolean; selectedColumns: string[] }> = [];
    const { service } = createService(vi.fn(), {
      beforeExecute(event) {
        if (
          event.table === "xy_wap_embed_agent_kb"
          && event.type === "execute"
          && !event.isCountQuery
        ) {
          selectedListQueries.push({
            selectedAll: event.selectedAll,
            selectedColumns: event.selectedColumns,
          });
        }
      },
    });

    await service.listKbs(tenant);

    expect(selectedListQueries).toEqual([
      {
        selectedAll: false,
        selectedColumns: kbListColumns,
      },
    ]);
  });

  it("orders kb lists by id desc", async () => {
    const orderByCalls: Array<[string, string | undefined]> = [];
    const { service } = createService(vi.fn(), {
      beforeExecute(event) {
        if (
          event.table === "xy_wap_embed_agent_kb"
          && event.type === "execute"
          && !event.isCountQuery
        ) {
          orderByCalls.push(...event.orderByCalls);
        }
      },
    });

    await service.listKbs(tenant);

    expect(orderByCalls).toEqual([["id", "desc"]]);
  });

  it("filters docs by kb and maps sync status", async () => {
    const { service } = createService();

    const response = await service.listKbDocs(tenant, "1");

    expect(response.docs.length).toBeGreaterThanOrEqual(1);
    expect(response.docs[0]).toMatchObject({
      docId: "1001",
      docType: "document",
      status: "completed",
    });
  });

  it("rejects kb doc list search queries longer than 32 characters", async () => {
    const { service } = createService();

    await expect(
      service.listKbDocs(tenant, "1", {
        query: "a".repeat(33),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_KB_QUERY",
      statusCode: 400,
    });
  });

  it("lists kb docs without checking kb existence", async () => {
    const queriedTables: string[] = [];
    const { service } = createService(vi.fn(), {
      beforeExecute(event) {
        queriedTables.push(event.table);
      },
    });

    await service.listKbDocs(tenant, "1");

    expect(queriedTables).toEqual([
      "xy_wap_embed_agent_kb_doc",
      "xy_wap_embed_agent_kb_doc",
    ]);
  });

  it("does not run an extra kb doc quota count when the doc list is unfiltered", async () => {
    const probe = createBlockedListProbe("xy_wap_embed_agent_kb_doc");
    const { service } = createService(vi.fn(), probe.dbOptions);

    const responsePromise = service.listKbDocs(tenant, "1");
    await vi.waitFor(() => {
      expect(probe.queryStarts).toEqual([
        { isCountQuery: false, table: "xy_wap_embed_agent_kb_doc" },
        { isCountQuery: true, table: "xy_wap_embed_agent_kb_doc" },
      ]);
    });
    probe.releaseRowsQuery();

    await expect(responsePromise).resolves.toMatchObject({
      pagination: {
        total: 3,
      },
    });
  });

  it("excludes deleted kb docs from list totals", async () => {
    const { service } = createService(vi.fn(), {
      deletedDocCount: 5,
      totalDocCount: 100,
    });

    const response = await service.listKbDocs(tenant, "1");

    expect(response.pagination.total).toBe(100);
    expect(response).not.toHaveProperty("quota");
  });

  it("does not run an unfiltered kb doc quota count when filtering docs", async () => {
    const probe = createBlockedListProbe("xy_wap_embed_agent_kb_doc");
    const { service } = createService(vi.fn(), probe.dbOptions);

    const responsePromise = service.listKbDocs(tenant, "1", { docType: "document" });
    await vi.waitFor(() => {
      expect(probe.queryStarts).toEqual([
        { isCountQuery: false, table: "xy_wap_embed_agent_kb_doc" },
        { isCountQuery: true, table: "xy_wap_embed_agent_kb_doc" },
      ]);
    });
    probe.releaseRowsQuery();

    await expect(responsePromise).resolves.toMatchObject({
      pagination: {
        total: 2,
      },
    });
  });

  it("selects only kb doc list fields for kb doc list rows", async () => {
    const selectedListQueries: Array<{ selectedAll: boolean; selectedColumns: string[] }> = [];
    const { service } = createService(vi.fn(), {
      beforeExecute(event) {
        if (
          event.table === "xy_wap_embed_agent_kb_doc"
          && event.type === "execute"
          && !event.isCountQuery
        ) {
          selectedListQueries.push({
            selectedAll: event.selectedAll,
            selectedColumns: event.selectedColumns,
          });
        }
      },
    });

    await service.listKbDocs(tenant, "1");

    expect(selectedListQueries).toEqual([
      {
        selectedAll: false,
        selectedColumns: kbDocListColumns,
      },
    ]);
  });

  it("orders kb doc lists by id desc", async () => {
    const orderByCalls: Array<[string, string | undefined]> = [];
    const { service } = createService(vi.fn(), {
      beforeExecute(event) {
        if (
          event.table === "xy_wap_embed_agent_kb_doc"
          && event.type === "execute"
          && !event.isCountQuery
        ) {
          orderByCalls.push(...event.orderByCalls);
        }
      },
    });

    await service.listKbDocs(tenant, "1");

    expect(orderByCalls).toEqual([["id", "desc"]]);
  });

  it("lists chunks via Java with pagination", async () => {
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 2,
      list: javaChunkPageItems,
      page: 1,
      pageSize: 10,
    });
    const { agentKbJavaClient, service } = createService(listKbChunks);

    const response = await service.listKbDocChunks(tenant, "1001", {
      docType: "document",
    });

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

  it("forwards chunk content filter to Java", async () => {
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 1,
      list: [javaChunkPageItems[1]],
      page: 1,
      pageSize: 10,
    });
    const { service } = createService(listKbChunks);

    const response = await service.listKbDocChunks(tenant, "1001", {
      content: "系统",
      docType: "document",
      page: 1,
      pageSize: 10,
    });

    expect(listKbChunks).toHaveBeenCalledWith({
      content: "系统",
      docId: 1001,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });
    expect(response.chunks).toHaveLength(1);
    expect(response.pagination.total).toBe(1);
    expect(response.chunks[0]).toMatchObject({
      chunkId: "502",
      title: "系统切片",
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

    const response = await service.listKbDocChunks(tenant, "1004", {
      docType: "qa",
      page: 1,
      pageSize: 10,
      title: "系统",
    });

    expect(listKbChunks).toHaveBeenCalledWith({
      docId: 1004,
      page: 1,
      pageSize: 10,
      title: "系统",
      uid: 9001,
    });
    expect(response.chunks).toHaveLength(1);
  });

  it("does not query the doc table when listing chunks", async () => {
    const queriedTables: string[] = [];
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 0,
      list: [],
      page: 1,
      pageSize: 10,
    });
    const { service } = createService(listKbChunks, {
      beforeExecute(event) {
        queriedTables.push(event.table);
      },
    });

    await service.listKbDocChunks(tenant, "1001", {
      content: "系统",
      docType: "document",
      page: 1,
      pageSize: 10,
    });

    expect(queriedTables).toEqual([]);
  });

  it("selects only kb doc detail fields for kb doc detail rows", async () => {
    const selectedDetailQueries: Array<{ selectedAll: boolean; selectedColumns: string[] }> = [];
    const { service } = createService(vi.fn(), {
      beforeExecute(event) {
        if (
          event.table === "xy_wap_embed_agent_kb_doc"
          && event.type === "executeTakeFirst"
          && !event.isCountQuery
        ) {
          selectedDetailQueries.push({
            selectedAll: event.selectedAll,
            selectedColumns: event.selectedColumns,
          });
        }
      },
    });

    await service.getKbDoc(tenant, "1001");

    expect(selectedDetailQueries).toEqual([
      {
        selectedAll: false,
        selectedColumns: kbDocDetailColumns,
      },
    ]);
  });

  it("rejects kb outside the tenant scope", async () => {
    const { service } = createService();

    await expect(service.getKb(tenant, "999")).rejects.toMatchObject({
      code: "KB_NOT_FOUND",
    });
  });
});
