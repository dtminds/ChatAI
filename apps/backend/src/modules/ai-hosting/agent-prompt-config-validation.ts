import {
  AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH,
  AI_HOSTING_AGENT_KB_MAX_COUNT,
  AI_HOSTING_AGENT_SKILL_MAX_COUNT,
  getAiHostingAgentConditionLogicCharacterCount,
  type AiHostingAgentPromptConfig,
} from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";

export function assertAiHostingAgentPromptConfigLimits(
  promptConfig: AiHostingAgentPromptConfig,
) {
  if (promptConfig.availableKbIds.length > AI_HOSTING_AGENT_KB_MAX_COUNT) {
    throw new BadRequestError(
      "INVALID_AGENT_KB_COUNT",
      `Agent 最多可添加${AI_HOSTING_AGENT_KB_MAX_COUNT}个知识库`,
    );
  }

  if (promptConfig.availableSkillIds.length > AI_HOSTING_AGENT_SKILL_MAX_COUNT) {
    throw new BadRequestError(
      "INVALID_AGENT_SKILL_COUNT",
      `Agent 最多可添加${AI_HOSTING_AGENT_SKILL_MAX_COUNT}个技能`,
    );
  }

  if (
    getAiHostingAgentConditionLogicCharacterCount(promptConfig.conditionLogic) >
    AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH
  ) {
    throw new BadRequestError(
      "INVALID_AGENT_CONDITION_LOGIC",
      `条件逻辑不能超过${AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH}个字`,
    );
  }
}
