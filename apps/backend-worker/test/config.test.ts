import { describe, expect, it } from "vitest";
import { parseBackendWorkerConfig } from "../src/config.js";

describe("parseBackendWorkerConfig", () => {
  it("requires a database URL and defaults the log level", () => {
    expect(() => parseBackendWorkerConfig({})).toThrow(
      "DATABASE_URL must be configured",
    );
    expect(parseBackendWorkerConfig({
      DATABASE_URL: " mysql://db/chatai ",
      VOLCENGINE_ARK_API_KEY: " secret ",
    }))
      .toEqual({
        databaseUrl: "mysql://db/chatai",
        logLevel: "info",
        volcengineArkApiKey: "secret",
      });
  });
});
