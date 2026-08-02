import { describe, expect, it } from "vitest";
import { assertAiHostingAgentPromptConfigLimits } from "../../../src/modules/ai-hosting/agent-prompt-config-validation.js";

function createPromptConfig(conditionLogic: string) {
  return {
    availableKbIds: [],
    availableSkillIds: [],
    conditionLogic,
    handoffRules: "",
    replyStyle: {
      length: "简洁",
      styleInstruction: "亲切自然",
    },
    role: "",
  };
}

describe("agent prompt config validation", () => {
  it("allows condition logic at the character limit", () => {
    expect(() =>
      assertAiHostingAgentPromptConfigLimits(createPromptConfig("a".repeat(8000))),
    ).not.toThrow();
  });

  it("rejects condition logic above the character limit", () => {
    expect(() =>
      assertAiHostingAgentPromptConfigLimits(createPromptConfig("a".repeat(8001))),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_AGENT_CONDITION_LOGIC",
        statusCode: 400,
      }),
    );
  });
});
