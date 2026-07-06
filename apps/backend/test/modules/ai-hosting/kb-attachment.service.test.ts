import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/schema.js";
import type { AgentKbJavaClient } from "../../../src/modules/ai-hosting/agent-kb-java-client.js";
import {
  KB_ATTACHMENT_DOC_NAME,
  KB_ATTACHMENT_DOC_SUFFIX,
  KB_ATTACHMENT_DOC_URL,
} from "../../../src/modules/ai-hosting/kb-attachment.constants.js";
import { KbAttachmentService } from "../../../src/modules/ai-hosting/kb-attachment.service.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

const tenant = {
  subUserId: "101",
  uid: 9001,
};

const fileMaterialRow = {
  biz_status: 1,
  biz_type: 2,
  content: JSON.stringify({
    fileName: "产品说明书.pdf",
    fileSizeLabel: "2.00 MB",
    fileUrl: "https://example.com/manual.pdf",
  }),
  create_time: new Date("2026-06-18T15:22:22+08:00"),
  group_id: 0,
  id: 1,
  msg_info_id: 1,
  msgid: "",
  op_sub_uid: 101,
  sort: 1,
  source_type: 0,
  sub_uid: 0,
  title: "产品说明书.pdf",
  uid: 9001,
  update_time: new Date("2026-06-18T15:22:22+08:00"),
};

function createService(
  agentKbJavaClient: Partial<AgentKbJavaClient> = {},
  dbOptions?: Parameters<typeof createKbReadDbMock>[0],
) {
  const client = {
    addKbChunk: vi.fn(),
    createKbDoc: vi.fn(),
    deleteKbChunk: vi.fn(),
    batchDeleteKbChunks: vi.fn(),
    deleteKbDoc: vi.fn(),
    listKbChunks: vi.fn(),
    retryKbDoc: vi.fn(),
    updateKbChunk: vi.fn(),
    ...agentKbJavaClient,
  } satisfies AgentKbJavaClient;

  return {
    client,
    service: new KbAttachmentService(
      createKbReadDbMock(dbOptions) as unknown as Kysely<Database>,
      { info: vi.fn() },
      client,
    ),
  };
}

describe("KbAttachmentService", () => {
  it("returns attachment status without Java list call when doc exists", async () => {
    const listKbChunks = vi.fn();
    const { service } = createService({ listKbChunks }, { includeAttachmentDoc: true });

    const response = await service.getAttachmentStatus(tenant, "1");

    expect(response).toEqual({
      docId: "1005",
      initialized: true,
      syncStatus: 0,
    });
    expect(listKbChunks).not.toHaveBeenCalled();
  });

  it("returns uninitialized attachment status when doc is missing", async () => {
    const { service } = createService();

    await expect(service.getAttachmentStatus(tenant, "1")).resolves.toEqual({
      initialized: false,
    });
  });

  it("returns existing attachment doc on init without creating again", async () => {
    const createKbDoc = vi.fn();
    const { client, service } = createService({ createKbDoc }, { includeAttachmentDoc: true });

    const response = await service.initAttachments(tenant, "1");

    expect(response).toEqual({
      docId: "1005",
      initialized: true,
      status: "completed",
    });
    expect(client.createKbDoc).not.toHaveBeenCalled();
  });

  it("creates attachment doc via Java when missing", async () => {
    const createKbDoc = vi.fn().mockResolvedValue("1005");
    const { client, service } = createService({ createKbDoc });

    await expect(service.initAttachments(tenant, "1")).resolves.toEqual({
      docId: "1005",
      initialized: true,
      status: "queued",
    });
    expect(client.createKbDoc).toHaveBeenCalledWith({
      docSize: 0,
      docSuffix: KB_ATTACHMENT_DOC_SUFFIX,
      docType: 4,
      docUrl: KB_ATTACHMENT_DOC_URL,
      kbId: 1,
      name: KB_ATTACHMENT_DOC_NAME,
      operatorId: "101",
      uid: 9001,
      volcStrategyResourceId: "kb-strategy-def92e30c1456c07",
    });
  });

  it("lists attachments even when attachment doc sync is still in progress", async () => {
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 0,
      list: [],
      page: 1,
      pageSize: 10,
    });
    const { service } = createService({ listKbChunks }, {
      attachmentDocSyncStatus: 2,
      includeAttachmentDoc: true,
    });

    const response = await service.listAttachments(tenant, "1", {
      attachmentType: 2,
      docId: "1005",
    });

    expect(response.attachments).toEqual([]);
    expect(listKbChunks).toHaveBeenCalled();
  });

  it("lists attachments via Java with attachmentType filter", async () => {
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 1,
      list: [
        {
          attachmentIds: [1],
          attachmentTypes: [2],
          content: "附件描述",
          createTime: "2026-06-18 15:22:22",
          docId: 1005,
          id: 503,
          kbId: 1,
          source: 1,
          title: "产品说明书.pdf",
          type: 2,
          uid: 9001,
          updateTime: "2026-06-18 15:22:22",
        },
      ],
      page: 1,
      pageSize: 10,
    });
    const { client, service } = createService({ listKbChunks }, {
      includeAttachmentDoc: true,
      materialCollections: [fileMaterialRow],
    });

    const response = await service.listAttachments(tenant, "1", {
      attachmentType: 2,
      docId: "1005",
      query: "产品",
    });

    expect(client.listKbChunks).toHaveBeenCalledWith({
      attachmentType: 2,
      content: "产品",
      docId: 1005,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });
    expect(response.attachments).toHaveLength(1);
    expect(response.attachments[0]).toMatchObject({
      attachmentType: 2,
      chunkId: "503",
      description: "附件描述",
      materialCollectionId: "1",
      title: "产品说明书.pdf",
    });
  });

  it("validates attachment doc ownership before listing attachments", async () => {
    const listKbChunks = vi.fn().mockResolvedValue({
      count: 0,
      list: [],
      page: 1,
      pageSize: 10,
    });
    const queries: Array<{
      selectedColumns: string[];
      table: string;
      type: string;
    }> = [];
    const { client, service } = createService({ listKbChunks }, {
      includeAttachmentDoc: true,
      beforeExecute: (event) => {
        queries.push({
          selectedColumns: event.selectedColumns,
          table: event.table,
          type: event.type,
        });
      },
    });

    const response = await service.listAttachments(tenant, "1", {
      attachmentType: 2,
      docId: "1005",
    });

    expect(response.attachments).toEqual([]);
    expect(client.listKbChunks).toHaveBeenCalledWith({
      attachmentType: 2,
      content: undefined,
      docId: 1005,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });
    expect(
      queries.some(
        (event) =>
          event.table === "xy_wap_embed_agent_kb_doc"
          && event.type === "executeTakeFirst"
          && event.selectedColumns.includes("doc_type")
          && event.selectedColumns.includes("id")
          && event.selectedColumns.includes("sync_status")
      ),
    ).toBe(true);
  });

  it("rejects attachment doc from another kb when listing attachments", async () => {
    const listKbChunks = vi.fn();
    const { service } = createService({ listKbChunks }, {
      includeAttachmentDoc: true,
      includeSecondKbWithoutDocs: true,
    });

    await expect(
      service.listAttachments(tenant, "2", {
        attachmentType: 2,
        docId: "1005",
      }),
    ).rejects.toMatchObject({
      code: "KB_ATTACHMENT_DOC_NOT_FOUND",
      statusCode: 404,
    });
    expect(listKbChunks).not.toHaveBeenCalled();
  });

  it("creates attachment chunk via Java", async () => {
    const addKbChunk = vi.fn().mockResolvedValue("503");
    const { client, service } = createService({ addKbChunk }, {
      includeAttachmentDoc: true,
      materialCollections: [fileMaterialRow],
    });

    const response = await service.createAttachment(tenant, "1", {
      attachmentType: 2,
      description: "附件描述",
      materialCollectionId: "1",
    });

    expect(response).toEqual({ chunkId: "503" });
    expect(client.addKbChunk).toHaveBeenCalledWith({
      attachmentIds: [1],
      attachmentTypes: [2],
      chunkType: "text",
      content: "附件描述",
      docId: 1005,
      operatorId: "101",
      title: "产品说明书.pdf",
      uid: 9001,
    });
  });

  it("rejects invalid material id", async () => {
    const { service } = createService(undefined, { includeAttachmentDoc: true });

    await expect(
      service.createAttachment(tenant, "1", {
        attachmentType: 2,
        description: "附件描述",
        materialCollectionId: "999",
      }),
    ).rejects.toMatchObject({
      code: "KB_ATTACHMENT_INVALID",
      statusCode: 400,
    });
  });

  it("updates attachment description only without materialCollectionId", async () => {
    const updateKbChunk = vi.fn().mockResolvedValue(undefined);
    const { client, service } = createService({ updateKbChunk }, { includeAttachmentDoc: true });

    const response = await service.updateAttachment(tenant, "503", {
      description: "更新后的描述",
    });

    expect(response).toEqual({ updated: true });
    expect(client.updateKbChunk).toHaveBeenCalledWith({
      chunkId: 503,
      content: "更新后的描述",
      operatorId: "101",
      title: undefined,
      uid: 9001,
    });
  });

  it("updates attachment material without scanning Java chunk pages", async () => {
    const listKbChunks = vi.fn();
    const updateKbChunk = vi.fn().mockResolvedValue(undefined);
    const { client, service } = createService({ listKbChunks, updateKbChunk }, {
      includeAttachmentDoc: true,
      materialCollections: [fileMaterialRow],
    });

    const response = await service.updateAttachment(tenant, "503", {
      description: "更新后的描述",
      materialCollectionId: "1",
    });

    expect(response).toEqual({ updated: true });
    expect(client.listKbChunks).not.toHaveBeenCalled();
    expect(client.updateKbChunk).toHaveBeenCalledWith({
      attachmentIds: [1],
      attachmentTypes: [2],
      chunkId: 503,
      content: "更新后的描述",
      operatorId: "101",
      title: undefined,
      uid: 9001,
    });
  });

  it("rejects editing system attachment chunks", async () => {
    const { service } = createService(undefined, { includeAttachmentDoc: true });

    await expect(
      service.updateAttachment(tenant, "504", {
        description: "尝试编辑",
      }),
    ).rejects.toMatchObject({
      code: "KB_CHUNK_NOT_EDITABLE",
      statusCode: 403,
    });
  });

  it("deletes manual attachment chunk via Java", async () => {
    const deleteKbChunk = vi.fn().mockResolvedValue(undefined);
    const { client, service } = createService({ deleteKbChunk }, { includeAttachmentDoc: true });

    const response = await service.deleteAttachment(tenant, "503");

    expect(response).toEqual({ deleted: true });
    expect(client.deleteKbChunk).toHaveBeenCalledWith({
      chunkId: 503,
      operatorId: "101",
      uid: 9001,
    });
  });

  it("batch deletes manual attachment chunks via Java", async () => {
    const batchDeleteKbChunks = vi.fn().mockResolvedValue({
      failCount: 0,
      successCount: 1,
    });
    const { client, service } = createService({ batchDeleteKbChunks }, { includeAttachmentDoc: true });

    const response = await service.batchDeleteAttachments(tenant, ["503", "503"]);

    expect(response).toEqual({
      failCount: 0,
      successCount: 1,
    });
    expect(client.batchDeleteKbChunks).toHaveBeenCalledWith({
      chunkIds: [503],
      operatorId: "101",
      uid: 9001,
    });
  });

  it("rejects batch delete when any chunk is not editable", async () => {
    const batchDeleteKbChunks = vi.fn();
    const { client, service } = createService({ batchDeleteKbChunks }, { includeAttachmentDoc: true });

    await expect(
      service.batchDeleteAttachments(tenant, ["504"]),
    ).rejects.toMatchObject({
      code: "KB_CHUNK_NOT_EDITABLE",
      statusCode: 403,
    });
    expect(client.batchDeleteKbChunks).not.toHaveBeenCalled();
  });
});
