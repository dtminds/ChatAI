import { Type, type Static } from "@sinclair/typebox";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const EnvSchema = Type.Object({
  AUTH_COOKIE_SECURE: Type.Optional(Type.String()),
  JAVA_INTERNAL_API_BASE_URL: Type.Optional(Type.String()),
  JAVA_INTERNAL_API_TOKEN: Type.Optional(Type.String()),
  DATABASE_URL: Type.Optional(Type.String()),
  INSIGHTS_WORKER_BATCH_SIZE: Type.Optional(Type.String()),
  INSIGHTS_WORKER_ENABLED: Type.Optional(Type.String()),
  INSIGHTS_WORKER_INTERVAL_MS: Type.Optional(Type.String()),
  INSIGHTS_WORKER_MODEL_ENABLED: Type.Optional(Type.String()),
  INSIGHTS_WORKER_START_LOOKBACK_DAYS: Type.Optional(Type.String()),
  INSIGHTS_WORKER_UID_ALLOWLIST: Type.Optional(Type.String()),
  JWT_AUDIENCE: Type.Optional(Type.String()),
  JWT_DEV_SECRET: Type.Optional(Type.String()),
  JWT_ISSUER: Type.Optional(Type.String()),
  JWT_PRIVATE_KEY: Type.Optional(Type.String()),
  JWT_PUBLIC_KEY: Type.Optional(Type.String()),
  LOG_LEVEL: Type.Optional(Type.String()),
  NODE_ENV: Type.Optional(Type.String()),
  PORT: Type.Optional(Type.String()),
  REDIS_ENABLED: Type.Optional(Type.String()),
  VOLCENGINE_ARK_API_KEY: Type.Optional(Type.String()),
  VOLCENGINE_ARK_BASE_URL: Type.Optional(Type.String()),
  VOLCENGINE_ARK_MODEL: Type.Optional(Type.String()),
});

export type Env = Static<typeof EnvSchema>;

type LoadBackendEnvOptions = {
  appDir?: string;
  mode?: string;
  rootDir?: string;
};

export function getBackendAppDir() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export function getRepoRoot() {
  return resolve(getBackendAppDir(), "../..");
}

function getEnvFiles(mode?: string) {
  const normalizedMode = mode?.trim();

  return [
    ".env",
    ".env.local",
    normalizedMode ? `.env.${normalizedMode}` : undefined,
    normalizedMode ? `.env.${normalizedMode}.local` : undefined,
  ].filter((file): file is string => Boolean(file));
}

export function loadBackendEnv(options: LoadBackendEnvOptions = {}) {
  const rootDir = options.rootDir ?? getRepoRoot();
  const appDir = options.appDir ?? getBackendAppDir();
  const mode = options.mode ?? process.env.NODE_ENV;
  const loadedFiles: string[] = [];
  const initialKeys = new Set(Object.keys(process.env));
  const fileValues: Record<string, string> = {};

  for (const envFile of [
    ...getEnvFiles(mode).map((file) => resolve(rootDir, file)),
    resolve(appDir, ".env.local"),
    mode ? resolve(appDir, `.env.${mode}.local`) : undefined,
  ]) {
    if (!envFile) {
      continue;
    }

    if (!existsSync(envFile)) {
      continue;
    }

    const values = parseEnv(readFileSync(envFile, "utf8"));
    Object.assign(fileValues, values);

    loadedFiles.push(envFile);
  }

  for (const [key, value] of Object.entries(fileValues)) {
    if (!initialKeys.has(key)) {
      process.env[key] = value;
    }
  }

  return loadedFiles;
}

export function getPort(env: NodeJS.ProcessEnv = process.env) {
  const rawPort = env.PORT ?? "3001";
  const port = Number(rawPort);

  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  return port;
}

export function validateBackendEnv(env: NodeJS.ProcessEnv = process.env) {
  const requiredVariables = ["DATABASE_URL"];

  if (env.NODE_ENV === "production") {
    requiredVariables.push(
      "JWT_PRIVATE_KEY",
      "JWT_PUBLIC_KEY",
      "JAVA_INTERNAL_API_BASE_URL",
    );
  }

  const missingVariables = requiredVariables.filter((name) => !env[name]);

  if (missingVariables.length > 0) {
    const environmentLabel = env.NODE_ENV ? ` for ${env.NODE_ENV}` : "";

    throw new Error(
      `Missing required environment variables${environmentLabel}: ${missingVariables.join(", ")}`,
    );
  }
}
