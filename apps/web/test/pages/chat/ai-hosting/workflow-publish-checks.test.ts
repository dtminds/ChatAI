import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildPublishChecks,
  useWorkflowPublishChecks,
} from "@/pages/chat/ai-hosting/workflow/checks/publish-checks";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";

describe("buildPublishChecks", () => {
  it("reports ready checks for the seeded workflow", () => {
    const checks = buildPublishChecks(createInitialNodes(), createInitialEdges());

    expect(checks.map((check) => [check.id, check.status])).toEqual([
      ["trigger", "ready"],
      ["connectivity", "ready"],
      ["config", "ready"],
      ["ai", "warning"],
      ["goal", "ready"],
    ]);
  });

  it("flags disconnected and misconfigured nodes", () => {
    const nodes = createInitialNodes().map((node) =>
      node.id === "action-message"
        ? {
            ...node,
            data: {
              ...node.data,
              status: "warning" as const,
            },
          }
        : node,
    );
    const edges = createInitialEdges().filter((edge) => edge.target !== "action-message");
    const checks = buildPublishChecks(nodes, edges);

    expect(checks.find((check) => check.id === "connectivity")?.status).toBe("warning");
    expect(checks.find((check) => check.id === "config")?.description).toBe("1 个节点仍需补全配置");
  });

  it("marks AI strategy ready only when an AI node is configured", () => {
    const nodes = [
      ...createInitialNodes(),
      {
        data: {
          actionType: "ai" as const,
          agentName: "护肤小助理",
          kind: "ai" as const,
          label: "AI 接待",
          metric: "知识库：护肤知识库",
          status: "ready" as const,
          summary: "护肤小助理",
          title: "AI 接待",
        },
        id: "ai-node",
        position: { x: 1200, y: 120 },
        type: "marketing" as const,
      },
    ];
    const edges = [
      ...createInitialEdges(),
      createEdge("action-message", "ai-node"),
    ];
    const checks = buildPublishChecks(nodes, edges);

    expect(checks.find((check) => check.id === "ai")?.status).toBe("ready");
  });
});

describe("useWorkflowPublishChecks", () => {
  it("returns publish readiness summary with the checklist", () => {
    const { result } = renderHook(() =>
      useWorkflowPublishChecks(createInitialNodes(), createInitialEdges()),
    );

    expect(result.current.checks).toHaveLength(5);
    expect(result.current.readyChecks).toBe(4);
    expect(result.current.totalChecks).toBe(5);
    expect(result.current.publishReady).toBe(false);
    expect(result.current.hasWarnings).toBe(true);
  });
});
