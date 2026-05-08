import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPort, loadBackendEnv } from "../src/config/env";

const ENV_KEYS = [
  "AUTH_DEV_BYPASS",
  "AUTH_DEV_EMPLOYEE_ID",
  "DATABASE_URL",
  "JWT_DEV_SECRET",
  "NODE_ENV",
  "PORT",
] as const;

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

function createEnvDir() {
  return mkdtempSync(join(tmpdir(), "chatai-env-"));
}

describe("backend env config", () => {
  afterEach(() => {
    clearEnv();
  });

  it("loads shared root env files and backend local env files for the selected mode", () => {
    const rootDir = createEnvDir();
    const appDir = createEnvDir();
    writeFileSync(join(rootDir, ".env"), "PORT=3001\nAUTH_DEV_EMPLOYEE_ID=emp-base\n");
    writeFileSync(join(rootDir, ".env.local"), "AUTH_DEV_BYPASS=false\n");
    writeFileSync(join(rootDir, ".env.development"), "AUTH_DEV_EMPLOYEE_ID=emp-dev\n");
    writeFileSync(join(rootDir, ".env.development.local"), "AUTH_DEV_BYPASS=true\n");
    writeFileSync(join(appDir, ".env.local"), "JWT_DEV_SECRET=backend-local\n");
    writeFileSync(join(appDir, ".env.development.local"), "DATABASE_URL=mysql://local\n");

    loadBackendEnv({ appDir, rootDir, mode: "development" });

    expect(process.env.PORT).toBe("3001");
    expect(process.env.AUTH_DEV_EMPLOYEE_ID).toBe("emp-dev");
    expect(process.env.AUTH_DEV_BYPASS).toBe("true");
    expect(process.env.JWT_DEV_SECRET).toBe("backend-local");
    expect(process.env.DATABASE_URL).toBe("mysql://local");
  });

  it("does not override env values already provided by the process", () => {
    const rootDir = createEnvDir();
    writeFileSync(join(rootDir, ".env.development"), "PORT=3001\n");
    process.env.PORT = "4001";

    loadBackendEnv({ rootDir, mode: "development" });

    expect(process.env.PORT).toBe("4001");
  });

  it("does not load development env by default when NODE_ENV is absent", () => {
    const rootDir = createEnvDir();
    writeFileSync(join(rootDir, ".env.development"), "AUTH_DEV_BYPASS=true\n");

    loadBackendEnv({ rootDir });

    expect(process.env.AUTH_DEV_BYPASS).toBeUndefined();
  });

  it("returns loaded file paths for diagnostics", () => {
    const rootDir = createEnvDir();
    const appDir = createEnvDir();
    const developmentEnv = join(rootDir, ".env.development");
    const backendLocalEnv = join(appDir, ".env.local");
    writeFileSync(developmentEnv, "PORT=3001\n");
    writeFileSync(backendLocalEnv, "JWT_DEV_SECRET=backend-local\n");

    const loadedFiles = loadBackendEnv({ appDir, rootDir, mode: "development" });

    expect(loadedFiles).toEqual([developmentEnv, backendLocalEnv]);
    expect(existsSync(loadedFiles[0])).toBe(true);
  });

  it("reads backend port from loaded env files", () => {
    const rootDir = createEnvDir();
    writeFileSync(join(rootDir, ".env.test"), "PORT=3101\n");

    loadBackendEnv({ rootDir, mode: "test" });

    expect(getPort()).toBe(3101);
  });
});
