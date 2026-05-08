import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @vitest-environment node

import {
  buildDevProxyConfig,
  getRepoRoot,
  getViteDevServerConfig,
} from "../vite.config";

function createEnvDir() {
  return mkdtempSync(join(tmpdir(), "chatai-web-env-"));
}

describe("vite config env", () => {
  it("uses configured host, port, and API proxy target in development", () => {
    const config = getViteDevServerConfig({
      VITE_DEV_API_PROXY_TARGET: "https://chat-test.bork.com.cn",
      VITE_DEV_SERVER_HOST: "chat-dev.bork.com.cn",
      VITE_DEV_SERVER_PORT: "8086",
    });

    expect(config.host).toBe("chat-dev.bork.com.cn");
    expect(config.port).toBe(8086);
    expect(config.proxy?.["/api"]).toMatchObject({
      changeOrigin: true,
      secure: true,
      target: "https://chat-test.bork.com.cn",
    });
  });

  it("defaults to local backend proxy for development", () => {
    const config = getViteDevServerConfig({}, "development", createEnvDir());

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8086);
    expect(config.proxy?.["/api"]).toMatchObject({
      target: "http://127.0.0.1:3001",
    });
  });

  it("can disable TLS verification for self-signed API targets", () => {
    const proxy = buildDevProxyConfig({
      VITE_DEV_API_PROXY_SECURE: "false",
      VITE_DEV_API_PROXY_TARGET: "https://chat-test.bork.com.cn",
    });

    expect(proxy?.["/api"]).toMatchObject({
      secure: false,
    });
  });

  it("loads mode-specific env files through Vite", async () => {
    const envDir = createEnvDir();
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(
        join(envDir, ".env.dev-test-api"),
        [
          "VITE_DEV_API_PROXY_TARGET=https://chat-test.bork.com.cn",
          "VITE_DEV_SERVER_HOST=chat-dev.bork.com.cn",
          "VITE_DEV_SERVER_PORT=8086",
        ].join("\n"),
      ),
    );

    const config = getViteDevServerConfig({}, "dev-test-api", envDir);

    expect(config.host).toBe("chat-dev.bork.com.cn");
    expect(config.proxy?.["/api"]).toMatchObject({
      target: "https://chat-test.bork.com.cn",
    });
  });

  it("uses the repository root as the default env directory", () => {
    expect(getRepoRoot()).toBe(resolve(__dirname, "../../.."));
  });

  it("rejects malformed dev server ports", () => {
    expect(() =>
      getViteDevServerConfig({ VITE_DEV_SERVER_PORT: "8086abc" }),
    ).toThrow("Invalid VITE_DEV_SERVER_PORT: 8086abc");
    expect(() => getViteDevServerConfig({ VITE_DEV_SERVER_PORT: "70000" })).toThrow(
      "Invalid VITE_DEV_SERVER_PORT: 70000",
    );
    expect(() => getViteDevServerConfig({ VITE_DEV_SERVER_PORT: "0" })).toThrow(
      "Invalid VITE_DEV_SERVER_PORT: 0",
    );
  });
});
