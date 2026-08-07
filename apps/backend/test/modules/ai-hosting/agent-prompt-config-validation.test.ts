import { describe, expect, it } from "vitest";
import {
  AI_HOSTING_AGENT_KB_MAX_COUNT,
  AI_HOSTING_AGENT_SKILL_MAX_COUNT,
} from "@chatai/contracts";
import { assertAiHostingAgentPromptConfigLimits } from "../../../src/modules/ai-hosting/agent-prompt-config-validation.js";

function createPromptConfig(
  conditionLogic: string,
  resources: { availableKbIds?: number[]; availableSkillIds?: number[] } = {},
) {
  return {
    availableKbIds: resources.availableKbIds ?? [],
    availableSkillIds: resources.availableSkillIds ?? [],
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

  it("allows agent resources at their limits", () => {
    expect(() =>
      assertAiHostingAgentPromptConfigLimits(
        createPromptConfig("", {
          availableKbIds: Array.from(
            { length: AI_HOSTING_AGENT_KB_MAX_COUNT },
            (_, index) => index + 1,
          ),
          availableSkillIds: Array.from(
            { length: AI_HOSTING_AGENT_SKILL_MAX_COUNT },
            (_, index) => index + 1,
          ),
        }),
      ),
    ).not.toThrow();
  });

  it("rejects knowledge bases above the agent limit", () => {
    expect(() =>
      assertAiHostingAgentPromptConfigLimits(
        createPromptConfig("", {
          availableKbIds: Array.from(
            { length: AI_HOSTING_AGENT_KB_MAX_COUNT + 1 },
            (_, index) => index + 1,
          ),
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_AGENT_KB_COUNT",
        message: "最多添加 10 个知识库",
        statusCode: 400,
      }),
    );
  });

  it("rejects skills above the agent limit", () => {
    expect(() =>
      assertAiHostingAgentPromptConfigLimits(
        createPromptConfig("", {
          availableSkillIds: Array.from(
            { length: AI_HOSTING_AGENT_SKILL_MAX_COUNT + 1 },
            (_, index) => index + 1,
          ),
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_AGENT_SKILL_COUNT",
        message: "最多添加 10 个技能",
        statusCode: 400,
      }),
    );
  });
});
