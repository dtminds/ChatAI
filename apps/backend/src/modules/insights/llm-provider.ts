import { BadRequestError } from "../../shared/errors.js";

export type OpenAiCompatibleProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerCode: "volcengine_ark";
  protocol: "openai-compatible";
};

type ProviderEnv = {
  VOLCENGINE_ARK_API_KEY?: string;
  VOLCENGINE_ARK_BASE_URL?: string;
  VOLCENGINE_ARK_MODEL?: string;
};

export function createVolcengineArkProviderConfig(
  env: ProviderEnv = process.env,
): OpenAiCompatibleProviderConfig {
  const apiKey = env.VOLCENGINE_ARK_API_KEY?.trim();
  const baseUrl = env.VOLCENGINE_ARK_BASE_URL?.trim();
  const model = env.VOLCENGINE_ARK_MODEL?.trim();
  const missing = [
    ["VOLCENGINE_ARK_API_KEY", apiKey],
    ["VOLCENGINE_ARK_BASE_URL", baseUrl],
    ["VOLCENGINE_ARK_MODEL", model],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new BadRequestError(
      "LLM_PROVIDER_CONFIG_MISSING",
      `Missing LLM provider configuration: ${missing.join(", ")}`,
    );
  }

  if (!isHttpsUrl(baseUrl)) {
    throw new BadRequestError(
      "LLM_PROVIDER_BASE_URL_INVALID",
      "VOLCENGINE_ARK_BASE_URL must be an HTTPS URL",
    );
  }

  return {
    apiKey: requireString(apiKey),
    baseUrl,
    model: requireString(model),
    providerCode: "volcengine_ark",
    protocol: "openai-compatible",
  };
}

function requireString(value: string | undefined) {
  if (!value) {
    throw new BadRequestError(
      "LLM_PROVIDER_CONFIG_MISSING",
      "Missing LLM provider configuration",
    );
  }

  return value;
}

export function maskProviderConfigForLog(config: OpenAiCompatibleProviderConfig) {
  return {
    ...config,
    apiKey: "[redacted]",
  };
}

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
