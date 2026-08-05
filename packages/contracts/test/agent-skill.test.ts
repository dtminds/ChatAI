import { describe, expect, it } from "vitest";
import { getAgentSkillContentCharacterCount } from "../src/ai-hosting/agent-skill.js";

describe("getAgentSkillContentCharacterCount", () => {
  it("counts resource clips by their visible names", () => {
    expect(
      getAgentSkillContentCharacterCount(
        '开始<resource type="tool" toolId="search_order" name="订单&amp;物流" />结束',
      ),
    ).toBe("开始订单&物流结束".length);
  });
});
