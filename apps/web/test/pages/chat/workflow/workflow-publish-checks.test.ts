import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getWorkflowCapabilityProfile } from "@chatai/contracts";
import {
  buildPublishChecks as buildPublishChecksWithPolicy,
  buildPublishChecklist as buildPublishChecklistWithPolicy,
  useWorkflowPublishChecks as useWorkflowPublishChecksWithPolicy,
} from "@/pages/chat/workflow/checks/publish-checks";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import type { WorkflowEdge, WorkflowNode } from "@/pages/chat/workflow/types";
import {
  validateWorkflowDraft,
  validateWorkflowNodeConfig,
  validateWorkflowNodeGraphState,
} from "@/pages/chat/workflow/validation/workflow-validation";
import {
  buildWorkflowValidationSummaryFromResult as buildWorkflowValidationSummaryFromResultWithPolicy,
} from "@/pages/chat/workflow/validation/workflow-validation-summary";

const capabilityProfile = getWorkflowCapabilityProfile("chatai_sop");
const validationPolicy = {
  allowedEntryEventTypes: capabilityProfile.allowedEntryEventTypes,
  allowedNodeKinds: capabilityProfile.allowedNodeKinds,
  runtimeSupportedNodeKinds: ["start", "wait", "end"] as const,
};

function buildPublishChecks(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  return buildPublishChecksWithPolicy(nodes, edges, validationPolicy);
}

function buildPublishChecklist(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  return buildPublishChecklistWithPolicy(nodes, edges, validationPolicy);
}

function buildWorkflowValidationSummaryFromResult(
  nodes: WorkflowNode[],
  validation: Parameters<typeof buildWorkflowValidationSummaryFromResultWithPolicy>[1],
) {
  return buildWorkflowValidationSummaryFromResultWithPolicy(nodes, validation, validationPolicy);
}

function useWorkflowPublishChecks(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  return useWorkflowPublishChecksWithPolicy(nodes, edges, validationPolicy);
}

describe("buildPublishChecks", () => {
  it("groups every issue for an AI intent node into one display item", () => {
    const start = createInitialNodes().find((node) => node.id === "start")!;
    const end = createInitialNodes().find((node) => node.id === "end")!;
    const intent: WorkflowNode<"ai-intent"> = {
      data: {
        ...createDefaultNodeData("ai-intent"),
        intents: [{ description: "", id: "intent-1" }],
      },
      id: "intent",
      position: { x: 360, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const checklist = buildPublishChecklist([start, intent, end], [
      createEdge("start", "intent"),
      createEdge("intent", "end", "其他意图", { sourceHandle: "fallback" }),
    ]);

    const intentChecks = checklist.checks.filter((check) => check.nodeId === "intent");
    const intentDisplayChecks = checklist.displayChecks.filter((check) => check.nodeId === "intent");
    expect(intentChecks.length).toBeGreaterThan(1);
    expect(intentDisplayChecks).toHaveLength(1);
    expect(intentDisplayChecks[0]).toEqual(expect.objectContaining({
      id: "node-intent",
      nodeKind: "ai-intent",
      nodeId: "intent",
    }));
    const intentMessages = intentDisplayChecks[0]?.messages ?? [];
    const uniqueIntentMessages = new Set(intentChecks.flatMap(check => check.messages));
    expect(intentMessages).toHaveLength(uniqueIntentMessages.size);
    expect(new Set(intentMessages).size).toBe(intentMessages.length);
  });

  it("groups checks without a concrete node under workflow structure", () => {
    const nodes = createInitialNodes().filter((node) =>
      node.data.kind !== "start" && node.data.kind !== "end",
    );
    const checklist = buildPublishChecklist(nodes, []);

    expect(checklist.checks.map(check => check.id)).toEqual(expect.arrayContaining(["start", "end"]));
    expect(checklist.displayChecks.filter(check => check.id === "workflow-structure")).toHaveLength(1);
  });

  it("returns only unresolved checklist items while keeping a readiness summary", () => {
    const checklist = buildPublishChecklist(createInitialNodes(), createInitialEdges());

    expect(checklist.summary.map((check) => [check.id, check.status])).toEqual([
      ["start", "ready"],
      ["connectivity", "warning"],
      ["config", "warning"],
      ["end", "ready"],
    ]);
    expect(checklist.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "connectivity", category: "connectivity" }),
      expect.objectContaining({
        id: "graph-branch-path-unconnected-branch-intent",
        category: "connectivity",
      }),
      expect.objectContaining({
        id: "node-config-message-welcome",
        category: "config",
        nodeId: "message-welcome",
      }),
    ]));
    expect(checklist.canPublish).toBe(false);
    expect(checklist.publishBlockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "graph-branch-path-unconnected-branch-intent",
        nodeId: "branch-intent",
      }),
    ]));
  });

  it("blocks node kinds that the runtime cannot execute", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const checklist = buildPublishChecklist(nodes, edges);

    expect(checklist.canPublish).toBe(false);
    expect(checklist.publishBlockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "node-config-branch-intent",
        nodeId: "branch-intent",
      }),
      expect.objectContaining({
        id: "node-config-message-welcome",
        nodeId: "message-welcome",
      }),
    ]));
  });

  it("does not treat node display status as a publish config issue", () => {
    const originalNodes = createInitialNodes();
    const nodes = originalNodes.map((node) =>
      node.id === "message-welcome"
        ? {
            ...node,
            data: {
              ...node.data,
              status: "warning" as const,
            },
          }
        : node,
    );
    const edges = createInitialEdges().filter((edge) => edge.target !== "message-welcome");
    const checks = buildPublishChecks(nodes, edges);
    const originalChecks = buildPublishChecks(originalNodes, edges);

    expect(checks).toEqual(originalChecks);
    expect(checks.find((check) => check.id === "connectivity")?.category).toBe("connectivity");
    expect(checks.find((check) => check.id === "config")).toEqual(expect.objectContaining({
      category: "config",
      status: "warning",
    }));
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocksPublish: true,
          id: "node-connectivity-message-welcome",
          nodeId: "message-welcome",
          status: "warning",
        }),
      ]),
    );
  });

  it("ignores render and runtime-only fields when building publish checks", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const cleanChecklist = buildPublishChecklist(nodes, edges);
    const runtimeNodes = nodes.map((node) =>
      node.id === "branch-intent"
        ? {
            ...node,
            data: {
              ...node.data,
              _runtimeStatus: "hovered",
              insertMenuOpen: true,
              onDelete: () => undefined,
              selected: true,
            },
            selected: true,
            zIndex: 20,
          }
        : node,
    );
    const runtimeEdges = edges.map((edge) =>
      edge.id === "edge-branch-intent-branch-high-message-welcome"
        ? {
            ...edge,
            data: {
              ...edge.data,
              _runtimeEdgeState: "selected",
              highlightState: "connected" as const,
              insertMenuOpen: true,
              onInsertBetween: () => undefined,
            },
            selected: true,
          }
        : edge,
    );
    const runtimeChecklist = buildPublishChecklist(runtimeNodes, runtimeEdges);

    expect(runtimeChecklist.canPublish).toBe(cleanChecklist.canPublish);
    expect(runtimeChecklist.summary).toEqual(cleanChecklist.summary);
    expect(runtimeChecklist.checks).toEqual(cleanChecklist.checks);
  });

  it("keeps validation issues structured for publish checklist routing", () => {
    const nodes = createInitialNodes().map((node) =>
      node.id === "branch-intent"
        ? {
            ...node,
            data: {
              ...node.data,
              branchPaths: node.data.kind === "branch"
                ? node.data.branchPaths.map((path) => path.isDefault
                    ? path
                    : {
                        ...path,
                        conditions: path.conditions.map((condition) => ({
                          ...condition,
                          selector: undefined,
                        })),
                      })
                : [],
            },
          }
        : node,
    );
    const edges = createInitialEdges().filter((edge) => edge.target !== "message-welcome");
    const validation = validateWorkflowDraft(nodes, edges);

    expect(validation.nodeIssues.find((item) => item.node.id === "branch-intent")?.issues).toEqual([
      expect.objectContaining({ code: "branch-condition-invalid", source: "catalog" }),
    ]);
    expect(validation.nodeIssues.find((item) => item.node.id === "message-welcome")?.issues).toEqual([
      expect.objectContaining({ code: "node-disconnected", source: "graph" }),
    ]);
  });

  it("uses catalog validation rules instead of only node status", () => {
    const nodes = createInitialNodes().map((node) =>
      node.id === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              seatIds: [],
              status: "running" as const,
            },
          }
        : node,
    );
    const checks = buildPublishChecks(nodes, createInitialEdges());
    const validation = validateWorkflowDraft(nodes, createInitialEdges());

    expect(checks.find((check) => check.id === "start")?.status).toBe("warning");
    expect(checks.find((check) => check.id === "start")?.blocksPublish).toBe(true);
    expect(validation.nodeIssues.find(item => item.node.id === "start")?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "start-source-required" })]),
    );
  });

  it("blocks publishing when a friend-added trigger has no source", () => {
    const nodes = createInitialNodes();
    const startNode = nodes.find(
      (node): node is WorkflowNode<"start"> => node.data.kind === "start",
    )!;
    const invalidStartNode: WorkflowNode<"start"> = {
      ...startNode,
      data: {
        ...startNode.data,
        seatIds: [101],
        triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      },
    };
    const issues = validateWorkflowNodeConfig(
      invalidStartNode,
      nodes.map(node => node.id === invalidStartNode.id ? invalidStartNode : node),
      createInitialEdges(),
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: "start-friend-source-required",
    }));
  });

  it("blocks publishing when a message trigger has no keywords", () => {
    const nodes = createInitialNodes();
    const startNode = nodes.find(
      (node): node is WorkflowNode<"start"> => node.data.kind === "start",
    )!;
    const invalidStartNode: WorkflowNode<"start"> = {
      ...startNode,
      data: {
        ...startNode.data,
        seatIds: [101],
        triggers: [{ keywords: [], type: "message.received" }],
      },
    };
    const checklist = buildPublishChecklist(
      nodes.map(node => node.id === invalidStartNode.id ? invalidStartNode : node),
      createInitialEdges(),
    );
    const issues = validateWorkflowNodeConfig(
      invalidStartNode,
      nodes.map(node => node.id === invalidStartNode.id ? invalidStartNode : node),
      createInitialEdges(),
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: "start-message-keywords-required",
    }));
    expect(checklist.canPublish).toBe(false);
    expect(checklist.displayChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: invalidStartNode.id,
      }),
    ]));
  });

  it("blocks publishing when the message sending window is not increasing", () => {
    const nodes = createInitialNodes();
    const startNode = nodes.find(
      (node): node is WorkflowNode<"start"> => node.data.kind === "start",
    )!;
    const invalidStartNode: WorkflowNode<"start"> = {
      ...startNode,
      data: {
        ...startNode.data,
        messageSendingWindow: { endTime: "09:00", startTime: "20:00" },
        seatIds: [101],
        triggers: [{ sourceIds: [], type: "contact.friend_added" }],
      },
    };
    const workflowNodes = nodes.map(node =>
      node.id === invalidStartNode.id ? invalidStartNode : node);
    const checklist = buildPublishChecklist(workflowNodes, createInitialEdges());
    const issues = validateWorkflowNodeConfig(
      invalidStartNode,
      workflowNodes,
      createInitialEdges(),
    );

    expect(issues).toContainEqual(expect.objectContaining({
      code: "start-message-sending-window-invalid",
    }));
    expect(checklist.canPublish).toBe(false);
  });

  it("validates only fields that are part of the current node contract", () => {
    const nodes = createInitialNodes();
    const waitNode = nodes.find((node) => node.id === "wait-2d") as WorkflowNode<"wait">;

    expect(validateWorkflowNodeConfig({
      ...waitNode,
      data: {
        ...waitNode.data,
        duration: -1,
      },
    }, nodes, createInitialEdges())).toEqual([
      expect.objectContaining({ code: "wait-delay-required", source: "catalog" }),
    ]);

    expect(validateWorkflowNodeConfig({
      ...waitNode,
      data: {
        ...waitNode.data,
        dayOffset: 46,
        mode: "fixed-time",
        time: "09:00",
      },
    }, nodes, createInitialEdges())).toContainEqual(expect.objectContaining({
      code: "wait-day-offset-invalid",
      source: "catalog",
    }));

    for (const kind of ["coupon", "end"] as const) {
      const node = kind === "end"
        ? nodes.find((item) => item.data.kind === "end")!
        : createNodeFromKind(kind, `${kind}-contract`, nodes.length);
      expect(validateWorkflowNodeConfig(node, [...nodes, node], createInitialEdges())).toEqual([]);
    }

    const tagNode = createNodeFromKind("tag", "tag-contract", nodes.length);
    expect(validateWorkflowNodeConfig(tagNode, [...nodes, tagNode], createInitialEdges()))
      .toContainEqual(expect.objectContaining({
        code: "tag-selection-required",
        source: "config",
      }));
    const configuredTagNode = {
      ...tagNode,
      data: { ...tagNode.data, tagIds: [101] },
    };
    expect(validateWorkflowNodeConfig(
      configuredTagNode,
      [...nodes, configuredTagNode],
      createInitialEdges(),
    )).toEqual([]);

    const messageNode = createNodeFromKind("message", "message-contract", nodes.length);
    const configuredMessageNode = {
      ...messageNode,
      data: {
        ...messageNode.data,
        content: [{ type: "text" as const, value: "已配置消息" }],
      },
    };
    expect(validateWorkflowNodeConfig(
      configuredMessageNode,
      [...nodes, configuredMessageNode],
      createInitialEdges(),
    )).toEqual([]);

    const handoffNode = createNodeFromKind("handoff", "handoff-contract", nodes.length);
    expect(validateWorkflowNodeConfig(handoffNode, [...nodes, handoffNode], createInitialEdges())).toContainEqual(expect.objectContaining({
      code: "handoff-operator-message-required",
      source: "config",
    }));
    expect(validateWorkflowNodeConfig({
      ...handoffNode,
      data: {
        ...handoffNode.data,
        operatorMessage: [{ type: "text", value: "   " }],
      },
    }, [...nodes, handoffNode], createInitialEdges())).toContainEqual(expect.objectContaining({
      code: "handoff-operator-message-required",
    }));
  });

  it("validates handoff message variables and length", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const handoffNode: WorkflowNode<"handoff"> = {
      ...createNodeFromKind("handoff", "handoff-contract", nodes.length),
      data: {
        ...createDefaultNodeData("handoff"),
        customerMessage: [{ type: "text", value: "正".repeat(101) }],
        operatorMessage: [{ selector: ["node", "deleted-node", "result"], type: "variable" }],
      },
    };

    expect(validateWorkflowNodeConfig(handoffNode, [...nodes, handoffNode], edges)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "handoff-operator-message-variable-invalid" }),
      expect.objectContaining({ code: "handoff-customer-message-too-long" }),
    ]));
  });

  it("validates structured branch conditions against available variables", () => {
    const nodes = createInitialNodes();
    const branchNode = nodes.find((node) => node.id === "branch-intent")!;

    expect(validateWorkflowNodeConfig({
      ...branchNode,
      data: {
        ...branchNode.data,
        branchPaths: [
          {
            conditions: [{
              id: "condition-invalid",
              operator: "greater-than",
              selector: ["subject", "id"],
              value: "10",
            }],
            id: "branch-high",
            label: "如果",
            logic: "all",
          },
          {
            conditions: [],
            id: "branch-default",
            isDefault: true,
            label: "否则",
            logic: "all",
          },
        ],
      },
    }, nodes, createInitialEdges())).toEqual([
      expect.objectContaining({ code: "branch-condition-invalid", source: "catalog" }),
    ]);
  });

  it("keeps node definition validation separate from graph state validation", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const branchNode = nodes.find((node) => node.id === "branch-intent")!;
    const disconnectedNode = nodes.find((node) => node.id === "message-welcome")!;

    expect(validateWorkflowNodeConfig({
      ...branchNode,
      data: {
        ...branchNode.data,
        branchPaths: branchNode.data.kind === "branch"
          ? branchNode.data.branchPaths.map((path) => path.isDefault
              ? path
              : {
                  ...path,
                  conditions: path.conditions.map((condition) => ({
                    ...condition,
                    value: "",
                  })),
                })
          : [],
      },
    }, nodes, edges)).toEqual([
      expect.objectContaining({ code: "branch-condition-invalid", source: "catalog" }),
    ]);
    expect(validateWorkflowNodeConfig(disconnectedNode, nodes, [])).toEqual([]);
    expect(validateWorkflowNodeGraphState(disconnectedNode, [disconnectedNode], "start")).toEqual([
      expect.objectContaining({ code: "node-disconnected", source: "graph" }),
    ]);
  });

  it("routes graph-source node validation issues to connectivity checks", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const messageNode = nodes.find((node) => node.id === "message-welcome")!;
    const validation = validateWorkflowDraft(nodes, edges);
    const summary = buildWorkflowValidationSummaryFromResult(nodes, {
      ...validation,
      graphIssues: [],
      nodeIssues: [
        {
          issues: [
            {
              code: "node-multiple-incoming",
              message: "fixture graph issue",
              severity: "warning",
              source: "graph",
            },
          ],
          node: messageNode,
        },
      ],
    });

    expect(summary.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "connectivity",
        id: "node-connectivity-message-welcome",
        nodeId: "message-welcome",
      }),
    ]));
    expect(summary.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "node-config-message-welcome",
      }),
    ]));
    expect(summary.summary.find((check) => check.id === "config")?.status).toBe("warning");
    expect(summary.summary.find((check) => check.id === "connectivity")?.status).toBe("warning");
  });

  it("blocks message content that references an unavailable variable", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const messageNode = nodes.find(
      (node): node is WorkflowNode<"message"> =>
        node.id === "message-welcome" && node.data.kind === "message",
    )!;
    const invalidMessageNode: WorkflowNode<"message"> = {
      ...messageNode,
      data: {
        ...messageNode.data,
        content: [{ selector: ["node", "deleted-node", "result"], type: "variable" }],
      },
    };

    expect(validateWorkflowNodeConfig(
      invalidMessageNode,
      nodes.map((node) => node.id === invalidMessageNode.id ? invalidMessageNode : node),
      edges,
    )).toContainEqual(expect.objectContaining({
      code: "message-variable-invalid",
      source: "config",
    }));
  });

  it("requires message text or attachments and accepts either source", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const messageNode = nodes.find(
      (node): node is WorkflowNode<"message"> =>
        node.id === "message-welcome" && node.data.kind === "message",
    )!;
    const validate = (data: WorkflowNode<"message">["data"]) =>
      validateWorkflowNodeConfig(
        { ...messageNode, data },
        nodes.map((node) => node.id === messageNode.id ? { ...messageNode, data } : node),
        edges,
      );

    expect(validate({ ...messageNode.data, attachments: [], content: [] })).toContainEqual(expect.objectContaining({
      code: "message-content-required",
      source: "config",
    }));
    expect(validate({
      ...messageNode.data,
      attachments: [{
        content: { alt: "商品图", fileUrl: "https://cdn.example.com/product.png" },
        materialCollectionId: "material-image-1",
        msgInfoId: "9001",
        type: "image",
      }],
      content: [],
    })).toEqual([]);
    expect(validate({
      ...messageNode.data,
      attachments: [],
      content: [{ type: "text", value: "欢迎加入" }],
    })).toEqual([]);
  });

  it("requires a valid guaranteed upstream output in node-output mode", () => {
    const llmNode = createNodeFromKind("llm", "llm-copy", 0);
    const llmOutputId = llmNode.data.output.format === "json"
      ? llmNode.data.output.fields[0]!.id
      : llmNode.data.output.field.id;
    const initialNodes = createInitialNodes();
    const messageNode = initialNodes.find(
      (node): node is WorkflowNode<"message"> =>
        node.id === "message-welcome" && node.data.kind === "message",
    )!;
    const nodes = [
      ...initialNodes,
      {
        ...llmNode,
        data: { ...llmNode.data, title: "生成营销文案" },
      },
    ];
    const edges = [
      ...createInitialEdges().filter((edge) => edge.target !== messageNode.id),
      createEdge("branch-intent", llmNode.id, undefined, { sourceHandle: "branch-high" }),
      createEdge(llmNode.id, messageNode.id),
    ];
    const validate = (data: WorkflowNode<"message">["data"]) =>
      validateWorkflowNodeConfig(
        { ...messageNode, data },
        nodes.map((node) => node.id === messageNode.id ? { ...messageNode, data } : node),
        edges,
      );

    expect(validate({
      ...messageNode.data,
      attachments: [],
      contentMode: "node-output",
      outputSelector: undefined,
    })).toContainEqual(expect.objectContaining({ code: "message-output-required" }));
    expect(validate({
      ...messageNode.data,
      contentMode: "node-output",
      outputSelector: ["node", "branch-intent", "matchedPathLabel"],
    })).toContainEqual(expect.objectContaining({ code: "message-output-invalid" }));
    expect(validate({
      ...messageNode.data,
      contentMode: "node-output",
      outputSelector: ["node", llmNode.id, llmOutputId],
    })).toEqual([]);
  });

  it("validates message length, attachment count and attachment payloads", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const messageNode = nodes.find(
      (node): node is WorkflowNode<"message"> =>
        node.id === "message-welcome" && node.data.kind === "message",
    )!;
    const validate = (data: WorkflowNode<"message">["data"]) =>
      validateWorkflowNodeConfig(
        { ...messageNode, data },
        nodes.map((node) => node.id === messageNode.id ? { ...messageNode, data } : node),
        edges,
      );
    const attachment = {
      content: { alt: "商品图", fileUrl: "https://cdn.example.com/product.png" },
      materialCollectionId: "material-image-1",
      msgInfoId: "9001",
      type: "image" as const,
    };

    expect(validate({
      ...messageNode.data,
      content: [{ type: "text", value: "a".repeat(1001) }],
    })).toContainEqual(expect.objectContaining({ code: "message-content-too-long" }));
    expect(validate({
      ...messageNode.data,
      attachments: Array.from({ length: 6 }, (_, index) => ({
        ...attachment,
        materialCollectionId: `material-image-${index}`,
      })),
      content: [],
    })).toContainEqual(expect.objectContaining({ code: "message-attachments-too-many" }));
    expect(validate({
      ...messageNode.data,
      attachments: [{ ...attachment, content: {} }],
      content: [],
    })).toContainEqual(expect.objectContaining({ code: "message-attachment-invalid" }));
  });

  it("keeps start summary scoped to start configuration issues", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges();
    const startNode = nodes.find((node) => node.id === "start")!;
    const validation = validateWorkflowDraft(nodes, edges);
    const summary = buildWorkflowValidationSummaryFromResult(nodes, {
      ...validation,
      graphIssues: [],
      nodeIssues: [
        {
          issues: [
            {
              code: "node-disconnected",
              message: "fixture start graph issue",
              severity: "warning",
              source: "graph",
            },
          ],
          node: startNode,
        },
      ],
    });

    expect(summary.summary.find((check) => check.id === "start")).toEqual(expect.objectContaining({
      status: "ready",
    }));
    expect(summary.summary.find((check) => check.id === "connectivity")?.status).toBe("warning");
    expect(summary.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "connectivity",
        id: "node-connectivity-start",
        nodeId: "start",
      }),
    ]));
  });

  it("keeps handoff nodes out of the publish summary when none is present", () => {
    const checklist = buildPublishChecklist(createInitialNodes(), createInitialEdges());

    expect(checklist.summary.map((check) => check.id)).toEqual(["start", "connectivity", "config", "end"]);
    expect(checklist.checks.some((check) => check.category === "config" && check.id.includes("handoff"))).toBe(false);
  });

  it("does not duplicate global start and end blockers as graph checks", () => {
    const nodes = createInitialNodes().filter((node) =>
      node.data.kind !== "start" && node.data.kind !== "end",
    );
    const checklist = buildPublishChecklist(nodes, []);

    expect(checklist.summary.find((check) => check.id === "start")?.status).toBe("warning");
    expect(checklist.summary.find((check) => check.id === "end")?.status).toBe("warning");
    expect(checklist.checks.map((check) => check.id)).toEqual(expect.arrayContaining([
      "start",
      "end",
    ]));
    expect(checklist.checks.some((check) => check.id.startsWith("graph-missing-start"))).toBe(false);
    expect(checklist.checks.some((check) => check.id.startsWith("graph-missing-end"))).toBe(false);
  });

  it("does not create a special publish summary item for configured handoff nodes", () => {
    const handoffNode: WorkflowNode<"handoff"> = {
      data: {
        ...createDefaultNodeData("handoff"),
        metric: "知识库：护肤知识库",
      },
      id: "handoff-node",
      position: { x: 1200, y: 120 },
      type: WORKFLOW_NODE_TYPE,
    };
    const nodes = [
      ...createInitialNodes(),
      handoffNode,
    ];
    const edges = [
      ...createInitialEdges(),
      createEdge("message-welcome", "handoff-node"),
    ];
    const checklist = buildPublishChecklist(nodes, edges);

    expect(checklist.summary.map((check) => check.id)).toEqual(["start", "connectivity", "config", "end"]);
    expect(checklist.checks.find((check) => check.id === "handoff")).toBeUndefined();
  });

  it("treats nodes behind a detached chain as disconnected", () => {
    const nodes = createInitialNodes();
    const edges = createInitialEdges().map((edge) =>
      edge.source === "start"
        ? {
            ...edge,
            source: "detached-node",
          }
        : edge,
    );
    const checks = buildPublishChecks(nodes, edges);

    expect(checks.find((check) => check.id === "connectivity")?.status).toBe("warning");
  });

  it("surfaces graph structure issues in publish checks", () => {
    const checks = buildPublishChecks(createInitialNodes(), [
      ...createInitialEdges(),
      createEdge("message-welcome", "wait-2d"),
    ]);

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "connectivity",
        id: "graph-edge-cycle",
      }),
    ]));
    expect(checks.some((check) => check.id === "graph-node-multiple-incoming-wait-2d")).toBe(false);
  });

  it("keeps publish checks aligned with source handle connection policy", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("message", "message-high-extra", 10),
    ];
    const checklist = buildPublishChecklist(nodes, [
      ...createInitialEdges(),
      createEdge("branch-intent", "message-high-extra", "高意向客户", { sourceHandle: "branch-high" }),
    ]);
    const sourceHandleCheck = checklist.checks.find(
      (check) => check.id === "graph-source-handle-multiple-outgoing-branch-intent",
    );

    expect(checklist.canPublish).toBe(false);
    expect(sourceHandleCheck).toEqual(expect.objectContaining({
      blocksPublish: true,
      category: "connectivity",
      nodeId: "branch-intent",
    }));
  });

  it("does not reject multiple upstream paths at the target handle", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("message", "message-second", 10),
    ];
    const checklist = buildPublishChecklist(nodes, [
      ...createInitialEdges(),
      createEdge("message-second", "end"),
    ]);
    const targetHandleCheck = checklist.checks.find(
      (check) => check.id === "graph-target-handle-multiple-incoming-end",
    );

    expect(targetHandleCheck).toBeUndefined();
  });

  it("blocks publish when a branch path has no downstream node", () => {
    const checklist = buildPublishChecklist(createInitialNodes(), createInitialEdges());

    expect(checklist.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        blocksPublish: true,
        category: "connectivity",
        id: "graph-branch-path-unconnected-branch-intent",
        nodeId: "branch-intent",
      }),
    ]));
  });

  it("marks connectivity ready when every branch path is connected", () => {
    const nodes = [
      ...createInitialNodes(),
      createNodeFromKind("message", "message-default", 11),
    ];
    const edges = [
      ...createInitialEdges(),
      createEdge("branch-intent", "message-default", "否则", { sourceHandle: "branch-default" }),
      createEdge("message-default", "end"),
    ];
    const checklist = buildPublishChecklist(nodes, edges);

    expect(checklist.summary.find((check) => check.id === "connectivity")?.status).toBe("ready");
    expect(checklist.checks.some((check) => check.id === "graph-branch-path-unconnected-branch-intent"))
      .toBe(false);
  });
});

describe("useWorkflowPublishChecks", () => {
  it("returns publish readiness summary with the checklist", () => {
    const { result } = renderHook(() =>
      useWorkflowPublishChecks(createInitialNodes(), createInitialEdges()),
    );

    expect(result.current.checks).toHaveLength(5);
    expect(result.current.displayChecks).toHaveLength(2);
    expect(result.current.summary).toHaveLength(4);
    expect(result.current.readyChecks).toBe(2);
    expect(result.current.totalChecks).toBe(4);
    expect(result.current.publishReady).toBe(false);
    expect(result.current.hasWarnings).toBe(true);
  });
});
