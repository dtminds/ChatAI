import { describe, expect, it } from "vitest";
import { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";

function createFailingDb() {
  return {
    selectFrom() {
      throw new Error("database should not be queried for invalid ids");
    },
  };
}

describe("WorkbenchRepository", () => {
  it("does not send NaN to MySQL when subUserId is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(repository.getSubUser("sub-user-001")).resolves.toBeUndefined();
    await expect(repository.listSeats("sub-user-001")).resolves.toEqual([]);
    await expect(repository.canAccessSeat("sub-user-001", "1")).resolves.toBe(false);
  });

  it("does not send NaN to MySQL when route ids are invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(repository.getSeat("not-a-seat")).resolves.toBeUndefined();
    await expect(repository.listConversations("not-a-seat")).resolves.toEqual([]);
    await expect(
      repository.getConversationLookup("not-a-conversation"),
    ).resolves.toBeUndefined();
    await expect(
      repository.listMessages("not-a-conversation", { limit: 30 }),
    ).resolves.toEqual([]);
    await expect(repository.canAccessSeat("1", "not-a-seat")).resolves.toBe(false);
  });
});
