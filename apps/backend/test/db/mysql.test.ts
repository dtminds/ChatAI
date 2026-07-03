import { describe, expect, it, vi } from "vitest";

const createPool = vi.fn(() => ({}));

vi.mock("mysql2", () => ({
  default: {
    createPool,
  },
}));

describe("createDatabase", () => {
  it("configures mysql DATETIME parsing and serialization as Asia/Shanghai", async () => {
    const { createDatabase } = await import("../../src/db/mysql.js");

    createDatabase("mysql://user:password@localhost:3306/chatai");

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: "+08:00",
      }),
    );

  });
});
