import { describe, expect, it } from "vitest";
import { assertDatabaseUtc8Timezone } from "../src/index.js";

describe("assertDatabaseUtc8Timezone", () => {
  it("accepts a database session whose effective offset is UTC+8", async () => {
    await expect(assertDatabaseUtc8Timezone(createDatabaseMock(28_800))).resolves.toBeUndefined();
  });

  it("rejects a database session whose effective offset is not UTC+8", async () => {
    await expect(assertDatabaseUtc8Timezone(createDatabaseMock(0))).rejects.toThrow(
      "MySQL session timezone must be UTC+8",
    );
  });
});

function createDatabaseMock(offsetSeconds: number) {
  return {
    selectNoFrom(selection: () => unknown) {
      selection();
      return {
        executeTakeFirstOrThrow: async () => ({ timezone_offset_seconds: offsetSeconds }),
      };
    },
  } as never;
}
