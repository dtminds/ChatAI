import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowExecutionGraph,
  createWorkflowDslDocument,
  exportWorkflowDsl,
  parseWorkflowDslText,
  SUPPORTED_WORKFLOW_DSL_SCHEMA_VERSIONS,
  stringifyWorkflowDslDocument,
  WORKFLOW_DSL_KIND,
  WORKFLOW_DSL_SCHEMA_VERSION,
} from "@/pages/chat/ai-hosting/workflow/workflow-dsl";
import {
  createEdge,
  createInitialDraft,
  createNodeFromKind,
} from "@/pages/chat/ai-hosting/workflow/graph";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/ai-hosting/workflow/constants";
import type {
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
} from "@/pages/chat/ai-hosting/workflow/types";

describe("workflow DSL", () => {
  it("exports a canonical versioned workflow DSL document", () => {
    const draft = createInitialDraft();
    const dslText = exportWorkflowDsl({
      draft: {
        ...draft,
        nodes: draft.nodes.map((node) =>
          node.id === "action-message"
            ? {
                ...node,
                data: {
                  ...node.data,
                  _connectedSourceHandleIds: ["source"],
                  _runtimeStatus: "selected",
                  onDelete: vi.fn(),
                  selected: true,
                },
                selected: true,
                zIndex: 20,
              }
            : node,
        ),
      },
      exportedAt: "2026-07-08T00:00:00.000Z",
      workflowId: "newcomer-conversion",
      workflowName: "新人转化旅程",
      workflowRevision: 3,
    });
    const parsed = JSON.parse(dslText);

    expect(parsed).toEqual(expect.objectContaining({
      exportedAt: "2026-07-08T00:00:00.000Z",
      kind: WORKFLOW_DSL_KIND,
      meta: {
        producer: "ChatAI",
        supportedSchemaVersions: SUPPORTED_WORKFLOW_DSL_SCHEMA_VERSIONS,
      },
      schemaVersion: WORKFLOW_DSL_SCHEMA_VERSION,
    }));
    expect(parsed.workflow).toEqual(expect.objectContaining({
      id: "newcomer-conversion",
      name: "新人转化旅程",
      revision: 3,
    }));
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "action-message").selected)
      .toBe(false);
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "action-message").zIndex)
      .toBeUndefined();
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "action-message").data.onDelete)
      .toBeUndefined();
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "action-message").data._connectedSourceHandleIds)
      .toBeUndefined();
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "action-message").data._runtimeStatus)
      .toBeUndefined();
    const executionNode = parsed.workflow.executionGraph.nodes.find(
      (node: { id: string }) => node.id === "action-message",
    );
    expect(executionNode).toEqual(expect.objectContaining({
      id: "action-message",
      kind: "action",
    }));
    expect(executionNode.config).toEqual({
      actionType: "message",
    });
    expect(executionNode.config.kind).toBeUndefined();
    expect(executionNode.config.title).toBeUndefined();
    expect(executionNode.config.status).toBeUndefined();
    expect(executionNode.config.onDelete).toBeUndefined();
    expect(executionNode.config._connectedSourceHandleIds).toBeUndefined();
    expect(executionNode.config._runtimeStatus).toBeUndefined();
    expect(parsed.workflow.executionGraph).not.toHaveProperty("viewport");
    expect(parsed.workflow.executionGraph.nodes[0]).not.toHaveProperty("position");
  });

  it("round-trips exported workflow DSL text through the import boundary", () => {
    const document = createWorkflowDslDocument({
      draft: createInitialDraft(),
      exportedAt: "2026-07-08T00:00:00.000Z",
      workflowName: "新人转化旅程",
    });
    const parsed = parseWorkflowDslText(stringifyWorkflowDslDocument(document));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.warnings).toEqual([]);
    expect(parsed.importedSchemaVersion).toBe(WORKFLOW_DSL_SCHEMA_VERSION);
    expect(parsed.sourceFormat).toBe("draft");
    expect(parsed.document.workflow.name).toBe("新人转化旅程");
    expect(parsed.document.workflow.executionGraph).toEqual(createWorkflowExecutionGraph(createInitialDraft()));
    expect(parsed.draft.nodes.map((node) => node.id)).toEqual(createInitialDraft().nodes.map((node) => node.id));
    expect(parsed.draft.edges.map((edge) => edge.id)).toEqual(createInitialDraft().edges.map((edge) => edge.id));
  });

  it("projects editor drafts into execution graphs without editor-only state", () => {
    const draft = createInitialDraft();
    const graph = createWorkflowExecutionGraph({
      ...draft,
      nodes: draft.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          _runtimeStatus: "selected",
          onDelete: vi.fn(),
        },
        selected: true,
      })),
      viewport: { x: 320, y: 180, zoom: 1.4 },
    });

    expect(graph.nodes.find((node) => node.id === "trigger")).toEqual(expect.objectContaining({
      config: expect.objectContaining({
        audience: "近 30 天新入会且未首购客户",
        repeatEntryEnabled: true,
      }),
      id: "trigger",
      kind: "trigger",
    }));
    expect(graph.nodes.find((node) => node.id === "trigger")?.config.kind).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "trigger")?.config.title).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "trigger")?.config.status).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "trigger")?.config._runtimeStatus).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "trigger")?.config.onDelete).toBeUndefined();
    expect(graph.edges.find((edge) => edge.source === "branch-intent" && edge.sourceHandle === "branch-high"))
      .toEqual(expect.objectContaining({
        source: "branch-intent",
        sourceHandle: "branch-high",
        sourceOutlet: {
          id: "branch-high",
          kind: "branch-path",
          label: "高意向客户",
        },
        target: "action-message",
        targetHandle: null,
      }));
    expect(graph.edges.find((edge) => edge.source === "trigger" && edge.target === "wait-2d"))
      .toEqual(expect.objectContaining({
        sourceHandle: null,
        sourceOutlet: {
          id: "default",
          kind: "default",
        },
      }));
  });

  it("preserves persisted node configuration fields through export and import", () => {
    const draft = createInitialDraft();
    const aiNode = createNodeFromKind("ai", "ai-reception", draft.nodes.length);
    const configuredDraft: WorkflowDraft = {
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("action-message", "ai-reception"),
      ],
      nodes: draft.nodes.map((node) => {
        if (node.id === "trigger") {
          return {
            ...node,
            data: {
              ...node.data,
              repeatEntryEnabled: false,
            },
          };
        }

        return node;
      }).concat({
        ...aiNode,
        data: {
          ...aiNode.data,
          handoffRule: "客户要求人工",
        },
      }),
    };
    const parsed = parseWorkflowDslText(exportWorkflowDsl({
      draft: configuredDraft,
      exportedAt: "2026-07-08T00:00:00.000Z",
      workflowName: "节点配置持久化",
    }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.draft.nodes.find((node) => node.id === "trigger")?.data.repeatEntryEnabled).toBe(false);
    expect(parsed.draft.nodes.find((node) => node.id === "ai-reception")?.data.handoffRule).toBe("客户要求人工");
  });

  it("keeps execution config limited to runtime-facing node parameters", () => {
    const draft = createInitialDraft();
    const aiNode = createNodeFromKind("ai", "ai-reception", draft.nodes.length);
    const graph = createWorkflowExecutionGraph({
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("action-message", "ai-reception"),
      ],
      nodes: [
        ...draft.nodes,
        aiNode,
      ],
    });
    const configByKind = new Map(graph.nodes.map((node) => [node.kind, node.config]));

    expect(configByKind.get("trigger")).toEqual({
      audience: "近 30 天新入会且未首购客户",
      repeatEntryEnabled: true,
    });
    expect(configByKind.get("wait")).toEqual({ delayDays: 2 });
    expect(configByKind.get("branch")).toEqual({
      branchPaths: expect.any(Array),
      branchRule: "最近 7 天浏览活动页 >= 2 次，或咨询过商品功效",
    });
    expect(configByKind.get("action")).toEqual({ actionType: "message" });
    expect(configByKind.get("ai")).toEqual({
      agentName: "护肤小助理",
      handoffRule: "客户要求人工、投诉升级、识别到价格异议",
    });
    expect(configByKind.get("goal")).toEqual({ conversion: 18.4 });

    graph.nodes.forEach((node) => {
      expect(node.config).not.toHaveProperty("label");
      expect(node.config).not.toHaveProperty("metric");
      expect(node.config).not.toHaveProperty("status");
      expect(node.config).not.toHaveProperty("summary");
      expect(node.config).not.toHaveProperty("title");
    });
  });

  it("rejects invalid JSON, unknown kind, unsupported schema version, and empty drafts", () => {
    expect(parseWorkflowDslText("not-json")).toEqual({
      issues: [expect.objectContaining({ code: "invalid-json" })],
      ok: false,
    });
    expect(parseWorkflowDslText(JSON.stringify({
      kind: "other",
      schemaVersion: WORKFLOW_DSL_SCHEMA_VERSION,
      workflow: { draft: createInitialDraft() },
    }))).toEqual({
      issues: [expect.objectContaining({ code: "invalid-kind" })],
      ok: false,
    });
    expect(parseWorkflowDslText(JSON.stringify({
      kind: WORKFLOW_DSL_KIND,
      schemaVersion: 999,
      workflow: { draft: createInitialDraft() },
    }))).toEqual({
      issues: [expect.objectContaining({ code: "invalid-schema-version" })],
      ok: false,
    });
    expect(parseWorkflowDslText(JSON.stringify({
      kind: WORKFLOW_DSL_KIND,
      schemaVersion: WORKFLOW_DSL_SCHEMA_VERSION,
      workflow: { draft: { edges: [], nodes: [] } },
    }))).toEqual({
      issues: [expect.objectContaining({ code: "empty-draft" })],
      ok: false,
    });
  });

  it("hydrates legacy graph payloads and reports dropped nodes or edges as warnings", () => {
    const draft = createInitialDraft();
    const validNode = draft.nodes.find((node) => node.id === "action-message")!;
    const validEdge = draft.edges.find((edge) => edge.target === "action-message")!;
    const payload = {
      kind: WORKFLOW_DSL_KIND,
      schemaVersion: WORKFLOW_DSL_SCHEMA_VERSION,
      workflow: {
        graph: {
          edges: [
            validEdge,
            {
              id: "edge-missing-target",
              source: "action-message",
              target: "missing",
              type: WORKFLOW_EDGE_TYPE,
            } satisfies WorkflowEdge,
          ],
          nodes: [
            {
              ...validNode,
              data: {
                kind: "action",
                title: "旧动作节点",
              },
              selected: true,
              type: "legacy-node-type",
              zIndex: 99,
            } as unknown as WorkflowNode,
            {
              data: { kind: "unknown" },
              id: "unknown",
              position: { x: 0, y: 0 },
              type: WORKFLOW_NODE_TYPE,
            } as unknown as WorkflowNode,
          ],
          viewport: {
            x: Number.NaN,
            y: 0,
            zoom: 1,
          },
        } satisfies Partial<WorkflowDraft>,
        name: "",
      },
    };
    const parsed = parseWorkflowDslText(JSON.stringify(payload));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.document.workflow.name).toBe("导入的 Workflow");
    expect(parsed.importedSchemaVersion).toBe(WORKFLOW_DSL_SCHEMA_VERSION);
    expect(parsed.sourceFormat).toBe("graph");
    expect(parsed.draft.nodes).toHaveLength(1);
    expect(parsed.draft.nodes[0]).toEqual(expect.objectContaining({
      selected: false,
      type: WORKFLOW_NODE_TYPE,
      zIndex: undefined,
    }));
    expect(parsed.draft.nodes[0].data).toEqual(expect.objectContaining({
      kind: "action",
      metric: expect.any(String),
      title: "旧动作节点",
    }));
    expect(parsed.draft.edges).toHaveLength(0);
    expect(parsed.warnings).toEqual([
      expect.objectContaining({
        code: "legacy-graph-format",
        message: "已从旧版 graph 格式兼容导入",
      }),
      expect.objectContaining({
        code: "dropped-nodes",
        message: "部分节点不受支持，已在导入时忽略",
      }),
      expect.objectContaining({
        code: "dropped-edges",
        message: "部分连线无效，已在导入时忽略",
      }),
      expect.objectContaining({
        code: "normalized-viewport",
        message: "画布视角包含无效数值，已恢复为默认视角",
      }),
    ]);
  });

  it("reports duplicate node ids as dropped nodes during import", () => {
    const draft = createInitialDraft();
    const duplicatedDraft: WorkflowDraft = {
      ...draft,
      nodes: [
        ...draft.nodes,
        {
          ...draft.nodes[0],
          data: {
            ...draft.nodes[0].data,
            title: "重复触发节点",
          },
        },
      ],
    };
    const parsed = parseWorkflowDslText(JSON.stringify({
      kind: WORKFLOW_DSL_KIND,
      schemaVersion: WORKFLOW_DSL_SCHEMA_VERSION,
      workflow: {
        draft: duplicatedDraft,
        name: "重复节点导入",
      },
    }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.draft.nodes).toHaveLength(draft.nodes.length);
    expect(parsed.warnings).toEqual([
      expect.objectContaining({ code: "dropped-nodes" }),
    ]);
  });
});
