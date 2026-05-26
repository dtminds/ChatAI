import type { WorkbenchKnowledgeConfigResponse } from "@chatai/contracts";

export function mapJavaKnowledgeConfig(data: unknown): WorkbenchKnowledgeConfigResponse {
  if (!isRecord(data)) {
    return { config: { automaticCheckIllegalWords: 0 } };
  }

  const rawValue = data.automaticCheckIllegalWords;
  const numericValue =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number.parseInt(rawValue, 10)
        : Number.NaN;

  return {
    config: {
      automaticCheckIllegalWords:
        Number.isFinite(numericValue) && numericValue > 0 ? 1 : 0,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
