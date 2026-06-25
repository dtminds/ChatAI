import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/schema.js";
import { createKbWriteService } from "../../../src/modules/ai-hosting/kb-write.service.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

describe("KbWriteService", () => {
  it("creates a kb for the current tenant", async () => {
    const db = createKbReadDbMock() as unknown as Kysely<Database>;
    const service = createKbWriteService(db);

    const created = await service.createKb("101", {
      description: "用于新品上市培训",
      name: "新品培训知识",
    });

    expect(created).toMatchObject({
      description: "用于新品上市培训",
      kbId: "2",
      name: "新品培训知识",
    });
  });
});
