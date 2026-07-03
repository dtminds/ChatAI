import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/schema.js";
import type { AgentKbJavaClient } from "../../../src/modules/ai-hosting/agent-kb-java-client.js";
import { KbWriteService } from "../../../src/modules/ai-hosting/kb-write.service.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

const tenant = {
  subUserId: "101",
  uid: 9001,
};

function createService(
  db: Kysely<Database>,
  agentKbJavaClient: Pick<AgentKbJavaClient, "createKb" | "deleteKb" | "updateKb">,
) {
  return new KbWriteService(db, agentKbJavaClient as AgentKbJavaClient, {
    info: vi.fn(),
  });
}

describe("KbWriteService", () => {
  it("creates a kb through the Java internal API", async () => {
    const createKb = vi.fn().mockResolvedValue("88");
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createService(db, { createKb, deleteKb: vi.fn(), updateKb: vi.fn() });

    const created = await service.createKb(tenant, {
      description: "用于新品上市培训",
      name: "新品培训知识",
    });

    expect(created).toEqual({
      kbId: "88",
    });
    expect(createKb).toHaveBeenCalledWith({
      name: "新品培训知识",
      operatorId: "101",
      remark: "用于新品上市培训",
      uid: 9001,
    });
  });

  it("updates a kb through the Java internal API", async () => {
    const updateKb = vi.fn().mockResolvedValue(undefined);
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createService(db, { createKb: vi.fn(), deleteKb: vi.fn(), updateKb });

    const updated = await service.updateKb(tenant, "1", {
      description: "更新后的描述",
      name: "更新后的知识库",
    });

    expect(updated).toEqual({
      updated: true,
    });
    expect(updateKb).toHaveBeenCalledWith({
      kbId: 1,
      lastOperatorId: "101",
      name: "更新后的知识库",
      remark: "更新后的描述",
      uid: 9001,
    });
  });

  it("rejects whitespace-only kb names", async () => {
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createService(db, { createKb: vi.fn(), deleteKb: vi.fn(), updateKb: vi.fn() });

    await expect(service.createKb(tenant, { name: "   " })).rejects.toMatchObject({
      code: "INVALID_KB_NAME",
    });
  });

  it("rejects creating kbs when the tenant has reached the fixed quota", async () => {
    const db = createKbReadDbMock({
      deletedKbCount: 3,
      totalKbCount: 20,
    }) as unknown as Kysely<Database>;
    const service = createService(db, { createKb: vi.fn(), deleteKb: vi.fn(), updateKb: vi.fn() });

    await expect(
      service.createKb(tenant, {
        description: "用于新品上市培训",
        name: "超额知识库",
      }),
    ).rejects.toMatchObject({
      code: "KB_QUOTA_EXCEEDED",
      message: "知识库数量已达上限",
    });
  });

  it("rejects updating a kb that does not belong to the tenant", async () => {
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createService(db, { createKb: vi.fn(), deleteKb: vi.fn(), updateKb: vi.fn() });

    await expect(
      service.updateKb(tenant, "999", {
        name: "不存在",
      }),
    ).rejects.toMatchObject({
      code: "KB_NOT_FOUND",
    });
  });

  it("reports when a kb still has documents", async () => {
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createService(db, { createKb: vi.fn(), deleteKb: vi.fn(), updateKb: vi.fn() });

    await expect(service.checkKbDelete(tenant, "1")).resolves.toEqual({
      hasDocuments: true,
    });
  });

  it("rejects deleting a kb that still has documents", async () => {
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createService(db, { createKb: vi.fn(), deleteKb: vi.fn(), updateKb: vi.fn() });

    await expect(service.deleteKb(tenant, "1")).rejects.toMatchObject({
      code: "KB_DELETE_HAS_DOCUMENTS",
      message: "请先删除所有文档后，再删除知识库",
    });
  });

  it("deletes an empty kb through the Java internal API", async () => {
    const deleteKb = vi.fn().mockResolvedValue(undefined);
    const db = createKbReadDbMock({ includeSecondKbWithoutDocs: true }) as unknown as Kysely<Database>;
    const service = createService(db, { createKb: vi.fn(), deleteKb, updateKb: vi.fn() });

    await expect(service.checkKbDelete(tenant, "2")).resolves.toEqual({
      hasDocuments: false,
    });

    const deleted = await service.deleteKb(tenant, "2");

    expect(deleted).toEqual({ deleted: true });
    expect(deleteKb).toHaveBeenCalledWith({
      kbId: 2,
      uid: 9001,
    });
  });
});
