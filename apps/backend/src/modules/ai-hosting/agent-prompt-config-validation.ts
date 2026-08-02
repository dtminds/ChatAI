import {
  AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH,
  getAiHostingAgentConditionLogicCharacterCount,
  type AiHostingAgentPromptConfig,
} from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";

export function assertAiHostingAgentPromptConfigLimits(
  promptConfig: AiHostingAgentPromptConfig,
) {
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
