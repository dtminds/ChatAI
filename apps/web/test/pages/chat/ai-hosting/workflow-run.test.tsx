import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWorkflowRun } from "@/pages/chat/ai-hosting/workflow/run/use-workflow-run";
import type { MarketingWorkflowNode } from "@/pages/chat/ai-hosting/workflow/types";

function createWorkflowNode(overrides: Partial<MarketingWorkflowNode> = {}): MarketingWorkflowNode {
  return {
    data: {
      actionType: "ai",
      agentName: "护肤小助理",
      kind: "ai",
      label: "AI 接待",
      metric: "知识库：护肤知识库",
      status: "ready",
      summary: "护肤小助理",
      title: "AI 接待",
    },
    id: "ai-node",
    position: { x: 0, y: 0 },
    type: "marketing",
    ...overrides,
  };
}

describe("useWorkflowRun", () => {
  it("stores a node run record keyed by node id", () => {
    const { result } = renderHook(() => useWorkflowRun());
    const node = createWorkflowNode();

    expect(result.current.getNodeRun(node.id)).toBeUndefined();

    act(() => {
      result.current.runNode(node);
    });

    const runRecord = result.current.getNodeRun(node.id);

    expect(runRecord?.status).toBe("succeeded");
    expect(runRecord?.durationMs).toBeGreaterThan(0);
    expect(runRecord?.input).toContain("\"nodeId\": \"ai-node\"");
    expect(runRecord?.output).toContain("\"title\": \"AI 接待\"");
    expect(runRecord?.logs).toContain("匹配 Agent 与知识库策略");
  });
});
