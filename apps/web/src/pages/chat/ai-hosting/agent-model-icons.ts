export type AgentModelIconConfig = {
  iconUrl?: string;
  label: string;
};

export const agentModelIconFallbackLabel = "通用模型";

const agentModelIconMap: Record<string, AgentModelIconConfig> = {
  "default-model": {
    label: "默认模型",
  },
  "doubao-2.0-lite": {
    iconUrl: "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    label: "Doubao-2.0-lite",
  },
};

function normalizeModelKey(model: string) {
  return model.trim().toLowerCase();
}

export function resolveAgentModelIcon(model: string): AgentModelIconConfig {
  const normalizedModel = normalizeModelKey(model);

  return (
    agentModelIconMap[normalizedModel] ?? {
      label: model.trim() || agentModelIconFallbackLabel,
    }
  );
}
