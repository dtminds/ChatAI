import { describe, expect, it } from "vitest";
import {
  createVolcengineArkProviderConfig,
  maskProviderConfigForLog,
} from "../../../src/modules/insights/llm-provider";

describe("LLM provider config", () => {
  it("resolves Volcengine Ark as an OpenAI-compatible provider", () => {
    const config = createVolcengineArkProviderConfig({
      VOLCENGINE_ARK_API_KEY: "secret",
      VOLCENGINE_ARK_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
      VOLCENGINE_ARK_MODEL: "ep-20260601000000-test",
    });

    expect(config).toEqual({
      apiKey: "secret",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "ep-20260601000000-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
    });
  });

  it("validates required Volcengine Ark env values", () => {
    expect(() => createVolcengineArkProviderConfig({})).toThrow(
      "VOLCENGINE_ARK_API_KEY, VOLCENGINE_ARK_BASE_URL, VOLCENGINE_ARK_MODEL",
    );
    expect(() =>
      createVolcengineArkProviderConfig({
        VOLCENGINE_ARK_API_KEY: "secret",
        VOLCENGINE_ARK_BASE_URL: "not-a-url",
        VOLCENGINE_ARK_MODEL: "ep-test",
      }),
    ).toThrow("VOLCENGINE_ARK_BASE_URL must be an HTTPS URL");
  });

  it("masks provider secrets for diagnostics", () => {
    expect(
      maskProviderConfigForLog({
        apiKey: "secret",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        model: "ep-test",
        providerCode: "volcengine_ark",
        protocol: "openai-compatible",
      }),
    ).toEqual({
      apiKey: "[redacted]",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "ep-test",
      providerCode: "volcengine_ark",
      protocol: "openai-compatible",
    });
  });
});
