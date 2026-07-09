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
import {
  BranchNodeBody,
  StandardNodeBody,
} from "@/pages/chat/workflow/nodes/node-bodies";
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

describe("workflow node catalog", () => {
  it("uses per-node registry modules as the catalog and UI source of truth", () => {
    const nodeKinds = Object.keys(workflowNodeDefinitions) as WorkflowNodeKind[];

    expect(nodeKinds).toEqual(["action", "ai", "branch", "goal", "trigger", "wait"]);
    expect(workflowNodeCatalog).toBe(workflowNodeDefinitions);
    expect(orderedWorkflowNodeCatalog).toBe(orderedWorkflowNodeDefinitions);
    expect(Object.keys(workflowNodeUiRegistry)).toEqual(nodeKinds);

    for (const kind of nodeKinds) {
      expect(workflowNodeDefinitions[kind].kind).toBe(kind);
      expect(workflowNodeUiRegistry[kind].body).toBeTypeOf("function");
      expect(workflowNodeUiRegistry[kind].settings.kind).toMatch(/custom|schema/);
    }
  });

  it("keeps pure node metadata, UI bindings and config schema in sync", () => {
    const nodeKinds = Object.keys(workflowNodeCatalog) as WorkflowNodeKind[];

    expect(nodeKinds).toEqual(["action", "ai", "branch", "goal", "trigger", "wait"]);

    for (const kind of nodeKinds) {
      const catalogEntry = getWorkflowNodeCatalogEntry(kind);
      const definition = nodeDefinitions[kind];
      const defaultData = createDefaultNodeData(kind);

      expect(definition.kind).toBe(catalogEntry.kind);
      expect(getNodeDefinitionCore(kind)).toBe(nodeDefinitionCore[kind]);
      expect(getNodeDefinition(kind)).toBe(definition);
      expect(nodeDefinitionCore[kind].visual).toBe(catalogEntry.visual);
      expect(definition.visual).toBe(catalogEntry.visual);
      expect(definition.layout).toBe(catalogEntry.layout);
      expect(definition.role).toBe(catalogEntry.role);
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
    expect(getWorkflowNodeRole("trigger")).toBe("entry");
    expect(getWorkflowNodeRole("goal")).toBe("terminal");
    expect(findWorkflowEntryNode(nodes)?.data.kind).toBe("trigger");
    expect(findWorkflowTerminalNode(nodes)?.data.kind).toBe("goal");
    expect(canInsertNodeKind("trigger")).toBe(false);
    expect(canDeleteNodeKind("trigger")).toBe(false);
    expect(canDuplicateNodeKind("trigger")).toBe(false);
    expect(canInsertAfterNodeKind("trigger")).toBe(true);
    expect(canInsertNodeKind("goal")).toBe(false);
    expect(canDeleteNodeKind("goal")).toBe(false);
    expect(canDuplicateNodeKind("goal")).toBe(false);
    expect(canInsertAfterNodeKind("goal")).toBe(false);
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

    for (const node of nodes) {
      const definition = getNodeDefinition(node.data.kind);

      expect(definition.body).toBeTypeOf("function");
      expect(definition.settings).toBeTypeOf("function");
      expect(definition.configSections).toEqual(getNodeConfigSections(node.data.kind));
      expect(definition.getOutputVariables?.(node)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "result" }),
        ]),
      );
      expect(definition.validate?.(node, { edges: createInitialEdges(), nodes }) ?? []).toEqual(
        expect.any(Array),
      );
    }
  });

  it("uses the standard node UI binding for non-branch node kinds", () => {
    const standardNodeKinds: WorkflowNodeKind[] = ["action", "ai", "goal", "trigger", "wait"];

    standardNodeKinds.forEach((kind) => {
      expect(workflowNodeUiBindings[kind].body).toBe(StandardNodeBody);
    });
    expect(workflowNodeUiBindings.branch.body).toBe(BranchNodeBody);
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
      "logic",
      "engagement",
      "engagement",
    ]);
    expect(workflowNodePaletteGroups.map((group) => group.id)).toEqual([
      "flow",
      "logic",
      "engagement",
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
      { id: "flow", items: ["wait"] },
      { id: "logic", items: ["branch"] },
      { id: "engagement", items: ["action", "ai"] },
    ]);
    expect(getWorkflowPaletteItemGroups({ query: "接待" }).map((group) => ({
      id: group.id,
      items: group.items.map((item) => item.id),
    }))).toEqual([
      { id: "engagement", items: ["ai"] },
    ]);
    expect(getWorkflowPaletteItemGroups({
      kinds: getInsertableNodeKindsBetween("wait", "action"),
      query: "条件",
    }).map((group) => ({
      id: group.id,
      items: group.items.map((item) => item.id),
    }))).toEqual([
      { id: "logic", items: ["branch"] },
    ]);
  });

  it("derives connection candidates from catalog capabilities", () => {
    expect(getAvailablePrevNodeKinds("trigger")).toEqual([]);
    expect(getAvailableNextNodeKinds("goal")).toEqual([]);
    expect(getAvailableNextNodeKinds("trigger")).toContain("goal");
    expect(getAvailablePrevNodeKinds("goal")).toContain("wait");

    expect(getInsertableNodeKindsForSource("goal")).toEqual([]);
    expect(getInsertableNodeKindsForSource("trigger")).toEqual(insertableNodeKinds);
    expect(getInsertableNodeKindsBetween("wait", "goal")).toEqual(insertableNodeKinds);
    expect(getInsertableNodeKindsBetween("goal", "wait")).toEqual([]);
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

    expect(getNodeSourceHandleDefinitions(createDefaultNodeData("goal"))).toEqual([]);
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
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("trigger"))).toEqual([]);
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("wait"))).toEqual([{}]);
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("branch"))).toEqual([{}]);
    expect(getNodeTargetHandleDefinitions(createDefaultNodeData("goal"))).toEqual([{}]);
    expect(getNodeTargetHandleCapacity(createDefaultNodeData("trigger"))).toBe(0);
    expect(getNodeTargetHandleCapacity(createDefaultNodeData("wait"))).toBe(1);
  });

  it("derives unconnected named source handles from the same handle boundary", () => {
    const branchNode: WorkflowNode = {
      data: createDefaultNodeData("branch"),
      id: "branch-node",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const targetNode: WorkflowNode = {
      data: createDefaultNodeData("action"),
      id: "action-node",
      position: { x: 300, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    };
    const unconnectedHandles = getNodeUnconnectedSourceHandles(branchNode, [
      {
        id: "edge-branch-node-branch-high-action-node",
        source: "branch-node",
        sourceHandle: "branch-high",
        target: "action-node",
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
