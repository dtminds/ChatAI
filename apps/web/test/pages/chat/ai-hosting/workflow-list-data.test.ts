import { describe, expect, it } from "vitest";
import {
  getWorkflowName,
  workflowListItems,
} from "@/pages/chat/ai-hosting/workflow/workflow-list-data";

describe("workflow list data", () => {
  it("resolves workflow names for editor routes", () => {
    expect(getWorkflowName("vip-reactivation")).toBe("会员复购唤醒");
    expect(getWorkflowName(undefined)).toBe("未命名 Workflow");
    expect(() => getWorkflowName("missing-workflow")).toThrow("Unknown workflow document");
  });

  it("keeps list items addressable by id", () => {
    expect(workflowListItems.map((workflow) => workflow.id)).toEqual([
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);
  });
});
