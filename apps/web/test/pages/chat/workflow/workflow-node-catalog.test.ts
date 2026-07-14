import { describe, expect, it } from "vitest";
import {
  findWorkflowEntryNode,
  findWorkflowTerminalNode,
  getAvailableNextNodeKinds,
  getAvailablePrevNodeKinds,
  getInsertableNodeKindsBetween,
  getInsertableNodeKindsForSource,
  getWorkflowNodeRole,
  getWorkflowPaletteItemGroups,
  getWorkflowNodeCatalogEntry,
  insertableNodeKinds,
  isWorkflowNodeKind,
  orderedWorkflowNodeCatalog,
  paletteItems,
  workflowNodePaletteGroups,
  workflowNodeCatalog,
} from "@/pages/chat/workflow/node-catalog";
import {
  canDeleteNodeKind,
  canDuplicateNodeKind,
  canInsertAfterNodeKind,
  canRenameNodeKind,
  canInsertNodeKind,
  createDefaultNodeData,
  getNodeDefinition,
  getNodeDefinitionCore,
  nodeDefinitionCore,
  nodeDefinitions,
  orderedNodeDefinitionCore,
  orderedNodeDefinitions,
} from "@/pages/chat/workflow/node-definitions";
import {
  getNodeConfigSections,
  getWorkflowNodeConfigSchema,
} from "@/pages/chat/workflow/node-config-schema";
import {
  getDefaultSourceHandleId,
  getNodeSourceHandleIndex,
  getNodeSourceHandleDefinitions,
  getNodeSourceHandleLabel,
  getNodeSourceHandleLaneOffset,
  getNodeSourceHandleTop,
  getNodeTargetHandleCapacity,
  getNodeTargetHandleDefinitions,
  getNodeUnconnectedSourceHandles,
  getWorkflowHandleKey,
  isWorkflowHandleIdEqual,
} from "@/pages/chat/workflow/node-handle-definitions";
import { workflowNodeUiBindings } from "@/pages/chat/workflow/node-ui-bindings";
import {
  orderedWorkflowNodeDefinitions,
  workflowNodeDefinitions,
} from "@/pages/chat/workflow/nodes/registry";
import { workflowNodeUiRegistry } from "@/pages/chat/workflow/nodes/ui-registry";
import { BranchNodeBody } from "@/pages/chat/workflow/nodes/branch/body";
import { StartConfig } from "@/pages/chat/workflow/nodes/start/panel";
import { createInitialEdges } from "@/pages/chat/workflow/graph";
import {
  getWorkflowNodeEstimatedHeight,
  getWorkflowNodeWidth,
} from "@/pages/chat/workflow/layout";
import { hydrateWorkflowDraft } from "@/pages/chat/workflow/workflow-draft-normalizer";
import {
  hydrateWorkflowClipboardData,
  isClipboardNodeStructurallyValid,
} from "@/pages/chat/workflow/workflow-clipboard";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/workflow/constants";
import type { WorkflowNode, WorkflowNodeKind } from "@/pages/chat/workflow/types";

function assertDefinitionSourcesStayInSync<TKind extends WorkflowNodeKind>(kind: TKind) {
  const catalogEntry = getWorkflowNodeCatalogEntry(kind);
  const definition = getNodeDefinition(kind);
  const defaultData = createDefaultNodeData(kind);

  expect(definition.kind).toBe(catalogEntry.kind);
  expect(getNodeDefinitionCore(kind)).toBe(nodeDefinitionCore[kind]);
  expect(getNodeDefinition(kind)).toBe(definition);
  expect(nodeDefinitionCore[kind].visual).toBe(catalogEntry.visual);
  expect(definition.visual).toBe(catalogEntry.visual);
  expect(definition.layout).toBe(catalogEntry.layout);
  expect(definition.role).toBe(catalogEntry.role);
  expect(definition.cardClassName).toBe(catalogEntry.cardClassName);
  expect(definition.createDefaultData).toBe(catalogEntry.createDefaultData);
  expect(definition.createExecutionConfig).toBe(catalogEntry.createExecutionConfig);
  expect(definition.sanitizeData).toBe(catalogEntry.sanitizeData);
  expect(definition.body).toBe(workflowNodeUiBindings[kind].body);
  expect(definition.settings).toBe(workflowNodeUiBindings[kind].settings);
  expect(definition.getOutputVariables).toBe(catalogEntry.getOutputVariables);
  expect(getNodeConfigSections(kind)).toBe(catalogEntry.configSections);
  expect(getWorkflowNodeConfigSchema(kind).nodeSections).toBe(catalogEntry.configSections);
  expect(definition.getSourceHandles).toBe(catalogEntry.getSourceHandles);
  expect(definition.getTargetHandles).toBe(catalogEntry.getTargetHandles);
  expect(getNodeSourceHandleDefinitions(defaultData)).toEqual(expect.any(Array));
  expect(definition.getSourceHandles(defaultData)).toEqual(getNodeSourceHandleDefinitions(defaultData));
  expect(definition.getTargetHandles(defaultData)).toEqual(getNodeTargetHandleDefinitions(defaultData));
  expect(defaultData.kind).toBe(kind);
  expect(defaultData.schemaVersion).toBe(definition.schemaVersion);
  expect(defaultData.title).toBeTruthy();
  expect(defaultData.summary).toBeTruthy();
  expect(defaultData.metric).toBeTruthy();
  expect(catalogEntry.layout.width).toBeGreaterThan(0);
  expect(catalogEntry.layout.estimatedHeight).toBeGreaterThan(0);
  expect(getWorkflowNodeWidth({
    data: defaultData,
    id: `node-${kind}`,
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  })).toBe(catalogEntry.layout.width);
  expect(getWorkflowNodeEstimatedHeight({
    data: defaultData,
    id: `node-${kind}`,
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  })).toBe(catalogEntry.layout.estimatedHeight);
  expect(catalogEntry.createExecutionConfig(defaultData)).not.toHaveProperty("title");
  expect(catalogEntry.createExecutionConfig(defaultData)).not.toHaveProperty("status");
}

function assertDefinitionExtensionContract<TKind extends WorkflowNodeKind>(kind: TKind) {
  const definition = getWorkflowNodeCatalogEntry(kind);
  const defaultData = definition.createDefaultData();

  expect(defaultData.kind).toBe(kind);
  expect(definition.visual.accentClassName).toBeTruthy();
  expect(definition.visual.accentRgb).toMatch(/^\d+ \d+ \d+$/);
  expect(definition.visual.icon).toBeTruthy();
  expect(definition.getSourceHandles(defaultData)).toEqual(expect.any(Array));
  expect(definition.getTargetHandles(defaultData)).toEqual(expect.any(Array));
  expect(definition.createExecutionConfig(defaultData)).toEqual(expect.any(Object));

  if (definition.insertable) {
    expect(definition.paletteGroup).toBeTruthy();
    expect(definition.paletteLabel).toBeTruthy();
    expect(insertableNodeKinds).toContain(kind);
  }
  else {
    expect(insertableNodeKinds).not.toContain(kind);
  }
}

function assertDefinitionRuntimeContract<TKind extends WorkflowNodeKind>(
  kind: TKind,
  index: number,
  nodes: WorkflowNode[],
) {
  const node: WorkflowNode<TKind> = {
    data: createDefaultNodeData(kind),
    id: `node-${kind}`,
    position: { x: index * 100, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
  const definition = getNodeDefinition(kind);

  expect(definition.body.kind).toMatch(/custom|fields|none/);
  if (kind === "end") {
    expect(definition.settings).toBeNull();
  }
  else {
    expect(definition.settings).toBeTypeOf("function");
  }
  expect(definition.configSections).toEqual(getNodeConfigSections(kind));
  expect(definition.getOutputVariables?.(node) ?? []).toEqual(expect.any(Array));
  expect(definition.validate?.(node, { edges: createInitialEdges(), nodes }) ?? []).toEqual(
    expect.any(Array),
  );
}

describe("workflow node catalog", () => {
  it("uses per-node registry modules as the catalog and UI source of truth", () => {
    const nodeKinds = Object.keys(workflowNodeDefinitions) as WorkflowNodeKind[];

    expect(nodeKinds).toEqual([
      "agent",
      "ai-collect",
      "ai-intent",
      "branch",
      "coupon",
      "customer-update",
      "end",
      "handoff",
      "llm",
      "message",
      "order-query",
      "start",
      "tag",
      "tag-query",
      "wait",
    ]);
    expect(workflowNodeCatalog).toBe(workflowNodeDefinitions);
    expect(orderedWorkflowNodeCatalog).toBe(orderedWorkflowNodeDefinitions);
    expect(Object.keys(workflowNodeUiRegistry)).toEqual(nodeKinds);

    for (const kind of nodeKinds) {
      expect(workflowNodeDefinitions[kind].kind).toBe(kind);
      expect(workflowNodeUiRegistry[kind].body.kind).toMatch(/custom|fields|none/);
      expect(workflowNodeUiRegistry[kind].settings.kind).toMatch(/custom|none|schema/);
    }
  });

  it("keeps pure node metadata, UI bindings and config schema in sync", () => {
    const nodeKinds = Object.keys(workflowNodeCatalog) as WorkflowNodeKind[];

    expect(nodeKinds).toEqual(Object.keys(workflowNodeDefinitions));

    nodeKinds.forEach(assertDefinitionSourcesStayInSync);
  });

  it("keeps node definitions as the single extension contract", () => {
    const nodeKinds = Object.keys(workflowNodeCatalog) as WorkflowNodeKind[];
    const schemaNodeKinds: WorkflowNodeKind[] = [
      "agent",
      "ai-collect",
      "ai-intent",
      "coupon",
      "customer-update",
      "handoff",
      "llm",
      "order-query",
      "tag",
      "tag-query",
      "wait",
    ];
    const customNodeKinds: WorkflowNodeKind[] = ["branch", "message", "start"];

    expect(Object.keys(nodeDefinitions)).toEqual(nodeKinds);
    expect(Object.keys(nodeDefinitionCore)).toEqual(nodeKinds);
    expect(Object.keys(workflowNodeUiRegistry)).toEqual(nodeKinds);

    nodeKinds.forEach(assertDefinitionExtensionContract);

    for (const kind of schemaNodeKinds) {
      expect(workflowNodeUiRegistry[kind].settings).toEqual(expect.objectContaining({
        kind: "schema",
        nodeKind: kind,
      }));
    }

    for (const kind of customNodeKinds) {
      expect(workflowNodeUiRegistry[kind].settings.kind).toBe("custom");
    }

    expect(workflowNodeUiRegistry.end.settings).toEqual({ kind: "none" });
    expect(workflowNodeUiBindings.end.settings).toBeNull();

    expect(workflowNodeCatalog.branch.cardClassName).toBe("workflow-node-card-branch");
    expect(workflowNodeCatalog.message.cardClassName).toBeUndefined();
  });

  it("uses registered node kinds at import and clipboard boundaries", () => {
    const nodeKinds = Object.keys(workflowNodeCatalog) as WorkflowNodeKind[];
    const nodes = nodeKinds.map((kind, index): WorkflowNode => ({
      data: createDefaultNodeData(kind),
      id: `node-${kind}`,
      position: { x: index * 100, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    }));

    expect(nodes.every(isClipboardNodeStructurallyValid)).toBe(true);
    expect(hydrateWorkflowDraft({
      edges: [],
      nodes,
    }).nodes.map((node) => node.data.kind)).toEqual(nodeKinds);
    expect(hydrateWorkflowClipboardData({
      edges: [],
      nodes,
    }).nodes.map((node) => node.data.kind)).toEqual(nodeKinds);
    expect(getWorkflowNodeRole("start")).toBe("entry");
    expect(getWorkflowNodeRole("end")).toBe("terminal");
    expect(findWorkflowEntryNode(nodes)?.data.kind).toBe("start");
    expect(findWorkflowTerminalNode(nodes)?.data.kind).toBe("end");
    expect(canInsertNodeKind("start")).toBe(false);
    expect(canDeleteNodeKind("start")).toBe(false);
    expect(canDuplicateNodeKind("start")).toBe(false);
    expect(canInsertAfterNodeKind("start")).toBe(true);
    expect(canRenameNodeKind("start")).toBe(false);
    expect(canInsertNodeKind("end")).toBe(false);
    expect(canDeleteNodeKind("end")).toBe(false);
    expect(canDuplicateNodeKind("end")).toBe(false);
    expect(canInsertAfterNodeKind("end")).toBe(false);
    expect(canRenameNodeKind("end")).toBe(false);
    expect(canRenameNodeKind("message")).toBe(true);
    expect(isWorkflowNodeKind("toString")).toBe(false);
    expect(isClipboardNodeStructurallyValid({
      data: { kind: "toString" },
      id: "invalid-prototype-kind",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    })).toBe(false);
    expect(hydrateWorkflowDraft({
      edges: [],
      nodes: [
        {
          data: { kind: "toString" },
          id: "invalid-prototype-kind",
          position: { x: 0, y: 0 },
          type: WORKFLOW_NODE_TYPE,
        } as unknown as WorkflowNode,
      ],
    }).nodes).toEqual([]);
  });

  it("keeps core node definitions free of UI bindings", () => {
    const nodeKinds = Object.keys(nodeDefinitionCore) as WorkflowNodeKind[];

    for (const kind of nodeKinds) {
      expect(nodeDefinitionCore[kind]).not.toHaveProperty("body");
      expect(nodeDefinitionCore[kind]).not.toHaveProperty("settings");
      expect(nodeDefinitionCore[kind].configSections).toBe(getNodeConfigSections(kind));
    }
  });

  it("exposes render, settings, variables and validation through node definitions", () => {
    const nodeKinds = Object.keys(nodeDefinitions) as WorkflowNodeKind[];
    const nodes: WorkflowNode[] = nodeKinds.map((kind, index) => ({
      data: createDefaultNodeData(kind),
      id: `node-${kind}`,
      position: { x: index * 100, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    }));

    nodeKinds.forEach((kind, index) => assertDefinitionRuntimeContract(kind, index, nodes));
  });

  it("supports field, custom, and empty node body bindings", () => {
    const fieldNodeKinds: WorkflowNodeKind[] = [
      "agent",
      "ai-collect",
      "ai-intent",
      "coupon",
      "customer-update",
      "handoff",
      "llm",
      "message",
      "order-query",
      "start",
      "tag",
      "tag-query",
      "wait",
    ];

    fieldNodeKinds.forEach((kind) => {
      expect(workflowNodeUiBindings[kind].body.kind).toBe("fields");
    });
    expect(workflowNodeUiBindings.branch.body).toEqual({
      component: BranchNodeBody,
      kind: "custom",
    });
    expect(workflowNodeUiBindings.end.body).toEqual({ kind: "none" });
    expect(workflowNodeUiBindings.end.settings).toBeNull();
    expect(workflowNodeUiBindings.start.settings).toBe(StartConfig);
    expect(workflowNodeUiRegistry.start.settings.kind).toBe("custom");
    expect(workflowNodeCatalog.start.visual.label).toBe("开始");
    expect(createDefaultNodeData("start")).toEqual(
      expect.objectContaining({
        accountIds: [],
        entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
        label: "开始",
        title: "开始",
        triggers: [],
      }),
    );

    const startBody = workflowNodeUiBindings.start.body;
    const waitBody = workflowNodeUiBindings.wait.body;
    const messageBody = workflowNodeUiBindings.message.body;

    expect(startBody.kind === "fields" ? startBody.getFields(createDefaultNodeData("start")) : [])
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "hosting-accounts", label: "托管账号" }),
        expect.objectContaining({ id: "triggers", label: "触发条件" }),
      ]));
    expect(waitBody.kind === "fields" ? waitBody.getFields(createDefaultNodeData("wait")) : [])
      .toEqual([
        expect.objectContaining({
          id: "duration",
          value: { kind: "text", text: "1 天后，执行后续节点" },
        }),
      ]);
    expect(messageBody.kind === "fields" ? messageBody.getFields(createDefaultNodeData("message")) : [])
      .toEqual([
        expect.objectContaining({
          id: "content",
          value: { kind: "empty" },
        }),
      ]);

  });

  it("derives palette nodes from sorted insertable catalog entries", () => {
    const sortedInsertableKinds = orderedWorkflowNodeCatalog
      .filter((definition) => definition.insertable)
      .map((definition) => definition.kind);

    expect(insertableNodeKinds).toEqual(sortedInsertableKinds);
    expect(paletteItems.map((item) => item.id)).toEqual(insertableNodeKinds);
    expect(paletteItems.map((item) => item.accentClassName)).toEqual(
      insertableNodeKinds.map((kind) => workflowNodeCatalog[kind].visual.accentClassName),
    );
    expect(paletteItems.map((item) => item.groupId)).toEqual([
      "flow",
      "flow",
      "flow",
      "data",
      "data",
      "data",
      "data",
      "data",
      "data",
      "message",
      "message",
      "message",
      "benefit",
    ]);
    expect(workflowNodePaletteGroups.map((group) => group.id)).toEqual([
      "flow",
      "data",
      "message",
      "benefit",
    ]);
    expect(orderedNodeDefinitions.map((definition) => definition.kind)).toEqual(
      orderedWorkflowNodeCatalog.map((definition) => definition.kind),
    );
    expect(orderedNodeDefinitionCore.map((definition) => definition.kind)).toEqual(
      orderedWorkflowNodeCatalog.map((definition) => definition.kind),
    );
  });

  it("groups and filters palette nodes from catalog metadata", () => {
    expect(getWorkflowPaletteItemGroups().map((group) => ({
      id: group.id,
      items: group.items.map((item) => item.id),
    }))).toEqual([
      { id: "flow", items: ["wait", "branch", "ai-intent"] },
      { id: "data", items: ["llm", "ai-collect", "order-query", "tag-query", "tag", "customer-update"] },
      { id: "message", items: ["message", "handoff", "agent"] },
      { id: "benefit", items: ["coupon"] },
    ]);
    expect(getWorkflowPaletteItemGroups({ query: "转人工" }).map((group) => ({
      id: group.id,
      items: group.items.map((item) => item.id),
    }))).toEqual([
      { id: "message", items: ["handoff"] },
    ]);
    expect(getWorkflowPaletteItemGroups({
      kinds: getInsertableNodeKindsBetween("wait", "message"),
      query: "条件",
    }).map((group) => ({
      id: group.id,
      items: group.items.map((item) => item.id),
    }))).toEqual([
      { id: "flow", items: ["branch"] },
    ]);
  });

  it("marks the AI-powered palette nodes for shared badge rendering", () => {
    expect(paletteItems
      .filter((item) => item.badge === "ai")
      .map((item) => item.id))
      .toEqual(["ai-intent", "llm", "ai-collect", "agent"]);
  });

  it("derives connection candidates from catalog capabilities", () => {
    expect(getAvailablePrevNodeKinds("start")).toEqual([]);
    expect(getAvailableNextNodeKinds("end")).toEqual([]);
    expect(getAvailableNextNodeKinds("start")).toContain("end");
    expect(getAvailablePrevNodeKinds("end")).toContain("wait");

    expect(getInsertableNodeKindsForSource("end")).toEqual([]);
    expect(getInsertableNodeKindsForSource("start")).toEqual(insertableNodeKinds);
    expect(getInsertableNodeKindsBetween("wait", "end")).toEqual(insertableNodeKinds);
    expect(getInsertableNodeKindsBetween("end", "wait")).toEqual([]);
  });

  it("derives node source handles from the node definition boundary", () => {
    const branchHandles = getNodeSourceHandleDefinitions(createDefaultNodeData("branch"));
    const branchDefinitionHandles = getNodeDefinitionCore("branch").getSourceHandles(createDefaultNodeData("branch"));
    const customBranchHandles = getNodeSourceHandleDefinitions({
      ...createDefaultNodeData("branch"),
      branchPaths: [
        { id: "branch-vip", label: "VIP", operator: "IF", title: "CASE 1" },
        { id: "branch-risk", label: "风险客户", operator: "ELIF", title: "CASE 2" },
        { id: "branch-fallback", isDefault: true, label: "默认", operator: "ELSE", title: "CASE 3" },
      ],
    });
    const customBranchNode: WorkflowNode = {
      data: {
        ...createDefaultNodeData("branch"),
        branchPaths: [
          { id: "branch-vip", label: "VIP", operator: "IF", title: "CASE 1" },
          { id: "branch-risk", label: "风险客户", operator: "ELIF", title: "CASE 2" },
          { id: "branch-fallback", isDefault: true, label: "默认", operator: "ELSE", title: "CASE 3" },
        ],
      },
      id: "branch-node",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };

    expect(getNodeSourceHandleDefinitions(createDefaultNodeData("end"))).toEqual([]);
    expect(branchDefinitionHandles).toEqual(branchHandles);
    expect(getNodeSourceHandleDefinitions(createDefaultNodeData("wait"))).toEqual([{
      outletKind: "default",
      top: 16,
    }]);
    expect(branchHandles.every((handle) => handle.outletKind === "branch-path")).toBe(true);
    expect(branchHandles.map((handle) => handle.id)).toEqual([
      "branch-high",
      "branch-normal",
      "branch-default",
    ]);
    expect(branchHandles.map((handle) => handle.label)).toEqual([
      "高意向客户",
      "普通客户",
      "默认路径",
    ]);
    expect(getDefaultSourceHandleId("branch")).toBe("branch-high");
    expect(customBranchHandles.map((handle) => handle.id)).toEqual([
      "branch-vip",
      "branch-risk",
      "branch-fallback",
    ]);
    expect(getNodeSourceHandleIndex(customBranchNode.data, "branch-risk")).toBe(1);
    expect(getNodeSourceHandleLabel(customBranchNode.data, "branch-risk")).toBe("风险客户");
    expect(getNodeSourceHandleLaneOffset(customBranchNode, "branch-risk")).toBe(0);
    expect(getNodeSourceHandleLaneOffset(customBranchNode, "branch-vip")).toBe(-1);
    expect(getNodeSourceHandleLaneOffset(customBranchNode, "branch-fallback")).toBe(1);
    expect(getNodeSourceHandleTop(customBranchNode, "branch-risk")).toBe(customBranchHandles[1].top);
    expect(getNodeSourceHandleTop(customBranchNode, null)).toBe(getNodeSourceHandleTop(customBranchNode, undefined));
    expect(getDefaultSourceHandleId("branch", {
      ...createDefaultNodeData("branch"),
      branchPaths: [
        { id: "branch-vip", label: "VIP", operator: "IF", title: "CASE 1" },
      ],
    })).toBe("branch-vip");
    expect(getDefaultSourceHandleId("wait")).toBeUndefined();
    expect(getWorkflowHandleKey(null)).toBe(getWorkflowHandleKey(undefined));
    expect(isWorkflowHandleIdEqual(null, undefined)).toBe(true);
    expect(isWorkflowHandleIdEqual("branch-vip", "branch-vip")).toBe(true);
    expect(isWorkflowHandleIdEqual("branch-vip", undefined)).toBe(false);
  });

  it("derives target handles from the shared handle boundary", () => {
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("start"))).toEqual([]);
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("wait"))).toEqual([{ maxConnections: Infinity }]);
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("branch"))).toEqual([{ maxConnections: Infinity }]);
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("end"))).toEqual([{ maxConnections: Infinity }]);
    expect(getNodeTargetHandleCapacity(createDefaultNodeData("start"))).toBe(0);
    expect(getNodeTargetHandleCapacity(createDefaultNodeData("wait"))).toBe(Infinity);
  });

  it("derives unconnected named source handles from the same handle boundary", () => {
    const branchNode: WorkflowNode = {
      data: createDefaultNodeData("branch"),
      id: "branch-node",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const targetNode: WorkflowNode = {
      data: createDefaultNodeData("message"),
      id: "message-node",
      position: { x: 300, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const unconnectedHandles = getNodeUnconnectedSourceHandles(branchNode, [
      {
        id: "edge-branch-node-branch-high-message-node",
        source: "branch-node",
        sourceHandle: "branch-high",
        target: "message-node",
        type: WORKFLOW_EDGE_TYPE,
      },
      {
        id: "edge-branch-node-branch-normal-missing",
        source: "branch-node",
        sourceHandle: "branch-normal",
        target: "missing-node",
        type: WORKFLOW_EDGE_TYPE,
      },
    ], {
      nodes: [branchNode, targetNode],
    });

    expect(unconnectedHandles.map((handle) => handle.id)).toEqual([
      "branch-normal",
      "branch-default",
    ]);
  });

  it("creates independent default branch path data for each branch node", () => {
    const firstBranch = createDefaultNodeData("branch");
    const secondBranch = createDefaultNodeData("branch");

    expect(firstBranch.branchPaths).toEqual(secondBranch.branchPaths);
    expect(firstBranch.branchPaths).not.toBe(secondBranch.branchPaths);
    expect(firstBranch.branchPaths?.[0]).not.toBe(secondBranch.branchPaths?.[0]);
  });
});
