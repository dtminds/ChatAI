import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/schema.js";
import { createKbWriteService } from "../../../src/modules/ai-hosting/kb-write.service.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

const tenant = {
  subUserId: "101",
  uid: 9001,
};

describe("KbWriteService", () => {
  it("creates a kb for the current tenant", async () => {
    const kbReadEvents: string[] = [];
    const db = createKbReadDbMock({
      beforeExecute: ({ table, type }) => {
        if (table === "xy_wap_embed_agent_kb" && type === "executeTakeFirst") {
          kbReadEvents.push(table);
        }
      },
    }) as unknown as Kysely<Database>;
    const service = createKbWriteService(db);

    const created = await service.createKb(tenant, {
      description: "用于新品上市培训",
      name: "新品培训知识",
    });

    expect(created).toEqual({
      kbId: "2",
    });
    expect(kbReadEvents).toEqual([]);
  });

  it("rejects whitespace-only kb names", async () => {
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createKbWriteService(db);

    await expect(service.createKb(tenant, { name: "   " })).rejects.toMatchObject({
      code: "INVALID_KB_NAME",
    });
  });
});
