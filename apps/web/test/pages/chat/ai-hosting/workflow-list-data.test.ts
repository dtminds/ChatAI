import { describe, expect, it } from "vitest";
import {
  getWorkflowName,
  workflowListItems,
} from "@/pages/chat/ai-hosting/workflow/workflow-list-data";

describe("workflow list data", () => {
  it("resolves workflow names for editor routes", () => {
    expect(getWorkflowName("vip-reactivation")).toBe("会员复购唤醒");
    expect(getWorkflowName(undefined)).toBe("新人转化旅程");
    expect(getWorkflowName("missing-workflow")).toBe("新人转化旅程");
  });

  it("keeps list items addressable by id", () => {
    expect(workflowListItems.map((workflow) => workflow.id)).toEqual([
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);
  });
});
