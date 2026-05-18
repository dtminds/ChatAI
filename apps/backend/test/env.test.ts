import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getPort,
  loadBackendEnv,
  validateBackendEnv,
} from "../src/config/env";

const ENV_KEYS = [
  "DATABASE_URL",
  "JAVA_INTERNAL_API_BASE_URL",
  "JWT_DEV_SECRET",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
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
    writeFileSync(join(rootDir, ".env"), "PORT=3001\nJWT_ISSUER=issuer-base\n");
    writeFileSync(join(rootDir, ".env.local"), "JWT_AUDIENCE=audience-local\n");
    writeFileSync(join(rootDir, ".env.development"), "JWT_ISSUER=issuer-dev\n");
    writeFileSync(join(rootDir, ".env.development.local"), "JWT_AUDIENCE=audience-dev\n");
    writeFileSync(join(appDir, ".env.local"), "JWT_DEV_SECRET=backend-local\n");
    writeFileSync(join(appDir, ".env.development.local"), "DATABASE_URL=mysql://local\n");

    loadBackendEnv({ appDir, rootDir, mode: "development" });

    expect(process.env.PORT).toBe("3001");
    expect(process.env.JWT_ISSUER).toBe("issuer-dev");
    expect(process.env.JWT_AUDIENCE).toBe("audience-dev");
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
    writeFileSync(join(rootDir, ".env.development"), "JWT_DEV_SECRET=development-secret\n");

    loadBackendEnv({ rootDir });

    expect(process.env.JWT_DEV_SECRET).toBeUndefined();
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

  it("rejects malformed backend ports", () => {
    expect(() => getPort({ PORT: "3001abc" })).toThrow("Invalid PORT: 3001abc");
    expect(() => getPort({ PORT: "70000" })).toThrow("Invalid PORT: 70000");
    expect(() => getPort({ PORT: "0" })).toThrow("Invalid PORT: 0");
  });

  it("requires production backend secrets and java base url", () => {
    expect(() =>
      validateBackendEnv({
        NODE_ENV: "production",
      }),
    ).toThrow(
      "Missing required environment variables for production: DATABASE_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JAVA_INTERNAL_API_BASE_URL",
    );

    expect(() =>
      validateBackendEnv({
        DATABASE_URL: "mysql://prod",
        NODE_ENV: "production",
      }),
    ).toThrow(
      "Missing required environment variables for production: JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JAVA_INTERNAL_API_BASE_URL",
    );

    expect(() =>
      validateBackendEnv({
        DATABASE_URL: "mysql://prod",
        JWT_PRIVATE_KEY: "private",
        JWT_PUBLIC_KEY: "public",
        NODE_ENV: "production",
      }),
    ).toThrow(
      "Missing required environment variables for production: JAVA_INTERNAL_API_BASE_URL",
    );

    expect(() =>
      validateBackendEnv({
        DATABASE_URL: "mysql://prod",
        JAVA_INTERNAL_API_BASE_URL: "https://java.internal",
        JWT_PRIVATE_KEY: "private",
        JWT_PUBLIC_KEY: "public",
        NODE_ENV: "production",
      }),
    ).not.toThrow();
  });

  it("requires database url in test mode", () => {
    expect(() =>
      validateBackendEnv({
        NODE_ENV: "test",
      }),
    ).toThrow("Missing required environment variables for test: DATABASE_URL");
  });
});
