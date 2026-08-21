import { describe, expect, it, vi } from "vitest";

const createPool = vi.fn(() => ({}));

vi.mock("mysql2", () => ({
  default: {
    createPool,
  },
}));

describe("createDatabase", () => {
  it("keeps safe BIGINT values numeric while preserving oversized identifiers", async () => {
    const { createDatabase } = await import("../../src/db/mysql.js");

    createDatabase("mysql://user:password@localhost:3306/chatai");

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        bigNumberStrings: false,
        supportBigNumbers: true,
        timezone: "+08:00",
      }),
    );
  });
});
