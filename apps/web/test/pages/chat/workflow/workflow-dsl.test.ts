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
} from "@/pages/chat/workflow/workflow-dsl";
import {
  createEdge,
  createInitialDraft,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/workflow/constants";
import type {
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
} from "@/pages/chat/workflow/types";

describe("workflow DSL", () => {
  it("exports a canonical versioned workflow DSL document", () => {
    const draft = createInitialDraft();
    const dslText = exportWorkflowDsl({
      draft: {
        ...draft,
        nodes: draft.nodes.map((node) =>
          node.id === "message-welcome"
            ? {
                ...node,
                data: {
                  ...node.data,
                  content: [
                    { type: "text", value: "你好，" },
                    { selector: ["customer", "name"], type: "variable" },
                  ],
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
    expect(parsed.kind).toBe("chatai-workflow");
    expect(parsed.workflow).toEqual(expect.objectContaining({
      id: "newcomer-conversion",
      name: "新人转化旅程",
      revision: 3,
    }));
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "message-welcome").selected)
      .toBe(false);
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "message-welcome").zIndex)
      .toBeUndefined();
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "message-welcome").data.onDelete)
      .toBeUndefined();
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "message-welcome").data._connectedSourceHandleIds)
      .toBeUndefined();
    expect(parsed.workflow.draft.nodes.find((node: WorkflowNode) => node.id === "message-welcome").data._runtimeStatus)
      .toBeUndefined();
    const executionNode = parsed.workflow.executionGraph.nodes.find(
      (node: { id: string }) => node.id === "message-welcome",
    );
    expect(executionNode).toEqual(expect.objectContaining({
      id: "message-welcome",
      incomingMode: "any",
      kind: "message",
    }));
    expect(executionNode.config).toEqual({
      content: [
        { type: "text", value: "你好，" },
        { selector: ["customer", "name"], type: "variable" },
      ],
    });
    expect(executionNode.config.kind).toBeUndefined();
    expect(executionNode.config.title).toBeUndefined();
    expect(executionNode.config.status).toBeUndefined();
    expect(executionNode.config.onDelete).toBeUndefined();
    expect(executionNode.config._connectedSourceHandleIds).toBeUndefined();
    expect(executionNode.config._runtimeStatus).toBeUndefined();
    expect(parsed.workflow.executionGraph).not.toHaveProperty("viewport");
    expect(parsed.workflow.executionGraph.nodes[0]).not.toHaveProperty("position");
    expect(parsed.workflow.executionGraph.entryNodeId).toBe("start");
    expect(parsed.workflow.executionGraph.terminalNodeIds).toEqual(["end"]);
    expect(parsed.workflow.executionGraph.outgoing.start).toEqual(["edge-start-wait-2d"]);
    expect(parsed.workflow.executionGraph.incoming["wait-2d"]).toEqual(["edge-start-wait-2d"]);
    expect(parsed.workflow.executionGraph.topologicalNodeIds).toEqual([
      "start",
      "wait-2d",
      "branch-intent",
      "message-welcome",
      "end",
    ]);
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
    expect(parsed.document.workflow.name).toBe("新人转化旅程");
    expect(parsed.document.workflow.executionGraph).toEqual(createWorkflowExecutionGraph(createInitialDraft()));
    expect(parsed.draft.nodes.map((node) => node.id)).toEqual(createInitialDraft().nodes.map((node) => node.id));
    expect(parsed.draft.edges.map((edge) => edge.id)).toEqual(createInitialDraft().edges.map((edge) => edge.id));
  });

  it("rebuilds execution data from the current draft during import", () => {
    const draft = createInitialDraft();
    const parsed = parseWorkflowDslText(JSON.stringify({
      exportedAt: "2026-07-08T00:00:00.000Z",
      kind: WORKFLOW_DSL_KIND,
      schemaVersion: 1,
      workflow: {
        draft,
        executionGraph: {
          edges: [],
          nodes: [],
        },
        name: "导入 Workflow",
      },
    }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.document.schemaVersion).toBe(WORKFLOW_DSL_SCHEMA_VERSION);
    expect(parsed.document.workflow.executionGraph).toEqual(createWorkflowExecutionGraph(draft));
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

    expect(graph.nodes.find((node) => node.id === "start")).toEqual(expect.objectContaining({
      config: expect.objectContaining({
        accountIds: ["managed-account-sales-1", "managed-account-sales-2"],
        entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
        triggers: expect.arrayContaining([{ type: "contact.friend_added" }]),
      }),
      id: "start",
      kind: "start",
    }));
    expect(graph.nodes.find((node) => node.id === "start")?.config.kind).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "start")?.config.title).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "start")?.config.status).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "start")?.config._runtimeStatus).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === "start")?.config.onDelete).toBeUndefined();
    expect(graph.edges.find((edge) => edge.source === "branch-intent" && edge.sourceHandle === "branch-high"))
      .toEqual(expect.objectContaining({
        source: "branch-intent",
        sourceHandle: "branch-high",
        sourceOutlet: {
          id: "branch-high",
          kind: "branch-path",
          label: "高意向客户",
        },
        target: "message-welcome",
        targetHandle: null,
      }));
    expect(graph.edges.find((edge) => edge.source === "start" && edge.target === "wait-2d"))
      .toEqual(expect.objectContaining({
        sourceHandle: null,
        sourceOutlet: {
          id: "default",
          kind: "default",
        },
      }));
    expect(graph.entryNodeId).toBe("start");
    expect(graph.terminalNodeIds).toEqual(["end"]);
    expect(graph.outgoing.start).toEqual(["edge-start-wait-2d"]);
    expect(graph.incoming["wait-2d"]).toEqual(["edge-start-wait-2d"]);
    expect(graph.outgoing.end).toEqual([]);
    expect(graph.incoming.start).toEqual([]);
    expect(graph.topologicalNodeIds).toEqual([
      "start",
      "wait-2d",
      "branch-intent",
      "message-welcome",
      "end",
    ]);
  });

  it("keeps execution node order stable when the graph has disconnected or cyclic nodes", () => {
    const draft = createInitialDraft();
    const detachedNode = createNodeFromKind("message", "detached-message", draft.nodes.length);
    const cycleEdge = createEdge("message-welcome", "wait-2d");
    const graph = createWorkflowExecutionGraph({
      ...draft,
      edges: [
        ...draft.edges,
        cycleEdge,
      ],
      nodes: [
        ...draft.nodes,
        detachedNode,
      ],
    });

    expect(graph.topologicalNodeIds).toEqual([
      "start",
      "wait-2d",
      "branch-intent",
      "message-welcome",
      "end",
      "detached-message",
    ]);
    expect(graph.edges).toContainEqual(expect.objectContaining({ id: cycleEdge.id }));
    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      code: "edge-cycle",
      edgeIds: expect.arrayContaining([cycleEdge.id]),
    }));
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: detachedNode.id }));
    expect(new Set(graph.topologicalNodeIds)).toEqual(new Set(graph.nodes.map((node) => node.id)));

    const document = createWorkflowDslDocument({
      draft: {
        ...draft,
        edges: [...draft.edges, cycleEdge],
        nodes: [...draft.nodes, detachedNode],
      },
      workflowName: "非法拓扑诊断",
    });
    const serialized = JSON.parse(stringifyWorkflowDslDocument(document));

    expect(document.workflow.draft.edges).toContainEqual(expect.objectContaining({ id: cycleEdge.id }));
    expect(serialized.workflow.executionGraph.edges).toContainEqual(expect.objectContaining({
      id: cycleEdge.id,
    }));
    expect(serialized.workflow.executionGraph.diagnostics).toContainEqual(expect.objectContaining({
      code: "edge-cycle",
    }));
  });

  it("preserves persisted node configuration fields through export and import", () => {
    const draft = createInitialDraft();
    const handoffNode = createNodeFromKind("handoff", "handoff-reception", draft.nodes.length);
    const configuredDraft: WorkflowDraft = {
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("message-welcome", "handoff-reception"),
      ],
      nodes: draft.nodes.map((node) => {
        if (node.id === "start") {
          return {
            ...node,
            data: {
              ...node.data,
              entryPolicy: { mode: "never" as const },
            },
          };
        }

        return node;
      }).concat({
        ...handoffNode,
        data: {
          ...handoffNode.data,
          title: "会员运营接管",
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

    expect(parsed.draft.nodes.find((node) => node.id === "start")?.data.entryPolicy).toEqual({ mode: "never" });
    expect(parsed.draft.nodes.find((node) => node.id === "handoff-reception")?.data.title).toBe("会员运营接管");
  });

  it("keeps execution config limited to runtime-facing node parameters", () => {
    const draft = createInitialDraft();
    const handoffNode = createNodeFromKind("handoff", "handoff-reception", draft.nodes.length);
    const graph = createWorkflowExecutionGraph({
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("message-welcome", "handoff-reception"),
      ],
      nodes: [
        ...draft.nodes,
        handoffNode,
      ],
    });
    const configByKind = new Map(graph.nodes.map((node) => [node.kind, node.config]));

    expect(configByKind.get("start")).toEqual({
      accountIds: ["managed-account-sales-1", "managed-account-sales-2"],
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [
        { type: "contact.friend_added" },
        { tagIds: ["tag-new-customer"], type: "customer.tag_added" },
      ],
    });
    expect(configByKind.get("wait")).toEqual({ duration: 2, unit: "day" });
    expect(configByKind.get("branch")).toEqual({
      branchPaths: expect.any(Array),
      branchRule: "最近 7 天浏览活动页 >= 2 次，或咨询过商品功效",
    });
    expect(configByKind.get("message")).toEqual({ content: [] });
    expect(configByKind.get("handoff")).toEqual({});
    expect(configByKind.get("end")).toEqual({});

    graph.nodes.forEach((node) => {
      expect(node.config).not.toHaveProperty("label");
      expect(node.config).not.toHaveProperty("metric");
      expect(node.config).not.toHaveProperty("status");
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

  it("hydrates untrusted draft payloads and reports dropped nodes or edges as warnings", () => {
    const draft = createInitialDraft();
    const validNode = draft.nodes.find((node) => node.id === "message-welcome")!;
    const validEdge = draft.edges.find((edge) => edge.target === "message-welcome")!;
    const payload = {
      kind: WORKFLOW_DSL_KIND,
      schemaVersion: WORKFLOW_DSL_SCHEMA_VERSION,
      workflow: {
        draft: {
          edges: [
            validEdge,
            {
              id: "edge-missing-target",
              source: "message-welcome",
              target: "missing",
              type: WORKFLOW_EDGE_TYPE,
            } satisfies WorkflowEdge,
          ],
          nodes: [
            {
              ...validNode,
              data: {
                kind: "message",
                title: "外部消息节点",
              },
              selected: true,
              type: "external-node-type",
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
    expect(parsed.draft.nodes).toHaveLength(1);
    expect(parsed.draft.nodes[0]).toEqual(expect.objectContaining({
      selected: false,
      type: WORKFLOW_NODE_TYPE,
      zIndex: undefined,
    }));
    expect(parsed.draft.nodes[0].data).toEqual(expect.objectContaining({
      kind: "message",
      metric: expect.any(String),
      title: "外部消息节点",
    }));
    expect(parsed.draft.edges).toHaveLength(0);
    expect(parsed.warnings).toEqual([
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
