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

const agentModelProviderIconRules: Array<{
  config: AgentModelIconConfig;
  match: RegExp;
}> = [
  {
    config: {
      iconUrl: "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
      label: "Doubao",
    },
    match: /\bdoubao\b/,
  },
  {
    config: {
      iconUrl: "https://b5.bokr.com.cn/dist/llm/deepseek-color.svg",
      label: "DeepSeek",
    },
    match: /\bdeepseek\b/,
  },
];

function normalizeModelKey(model: string) {
  return model.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function resolveAgentModelIcon(model: string): AgentModelIconConfig {
  const normalizedModel = normalizeModelKey(model);

  return (
    agentModelIconMap[normalizedModel] ??
    getProviderIconConfig(normalizedModel, model) ?? {
      label: model.trim() || agentModelIconFallbackLabel,
    }
  );
}

function getProviderIconConfig(normalizedModel: string, model: string) {
  const providerRule = agentModelProviderIconRules.find((rule) => rule.match.test(normalizedModel));

  if (!providerRule) {
    return undefined;
  }

  return {
    ...providerRule.config,
    label: model.trim() || providerRule.config.label,
  };
}
