export type BackendWorkerConfig = {
  databaseUrl: string;
  logLevel: string;
  volcengineArkApiKey?: string;
};

export function parseBackendWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): BackendWorkerConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  const volcengineArkApiKey = env.VOLCENGINE_ARK_API_KEY?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be configured");
  }

  return {
    databaseUrl,
    logLevel: env.LOG_LEVEL?.trim() || "info",
    ...(volcengineArkApiKey ? { volcengineArkApiKey } : {}),
  };
}
