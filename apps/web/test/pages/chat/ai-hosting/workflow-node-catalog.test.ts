import { describe, expect, it } from "vitest";
import {
  getAvailableNextNodeKinds,
  getAvailablePrevNodeKinds,
  getInsertableNodeKindsBetween,
  getInsertableNodeKindsForSource,
  getWorkflowPaletteItemGroups,
  getWorkflowNodeCatalogEntry,
  insertableNodeKinds,
  orderedWorkflowNodeCatalog,
  paletteItems,
  workflowNodePaletteGroups,
  workflowNodeCatalog,
} from "@/pages/chat/ai-hosting/workflow/node-catalog";
import {
  createDefaultNodeData,
  getNodeDefinition,
  nodeDefinitions,
  orderedNodeDefinitions,
} from "@/pages/chat/ai-hosting/workflow/node-definitions";
import { getNodeConfigSections } from "@/pages/chat/ai-hosting/workflow/node-config-schema";
import {
  getDefaultSourceHandleId,
  getNodeSourceHandleDefinitions,
} from "@/pages/chat/ai-hosting/workflow/node-handle-definitions";
import { NodeComponentMap } from "@/pages/chat/ai-hosting/workflow/nodes/registry";
import { workflowNodeUiBindings } from "@/pages/chat/ai-hosting/workflow/node-ui-bindings";
import { NodeSettingsPanelMap } from "@/pages/chat/ai-hosting/workflow/panels/registry";
import { createInitialEdges } from "@/pages/chat/ai-hosting/workflow/graph";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/ai-hosting/workflow/constants";
import type { WorkflowNode, WorkflowNodeKind } from "@/pages/chat/ai-hosting/workflow/types";

describe("workflow node catalog", () => {
  it("keeps pure node metadata, UI bindings and config schema in sync", () => {
    const nodeKinds = Object.keys(workflowNodeCatalog) as WorkflowNodeKind[];

    expect(nodeKinds).toEqual(["action", "ai", "branch", "goal", "trigger", "wait"]);

    for (const kind of nodeKinds) {
      const catalogEntry = getWorkflowNodeCatalogEntry(kind);
      const definition = nodeDefinitions[kind];
      const defaultData = createDefaultNodeData(kind);

      expect(definition.kind).toBe(catalogEntry.kind);
      expect(getNodeDefinition(kind)).toBe(definition);
      expect(definition.visual).toBe(catalogEntry.visual);
      expect(definition.createDefaultData).toBe(catalogEntry.createDefaultData);
      expect(definition.body).toBe(workflowNodeUiBindings[kind].body);
      expect(definition.settings).toBe(NodeSettingsPanelMap[kind]);
      expect(definition.getOutputVariables).toBe(catalogEntry.getOutputVariables);
      expect(NodeComponentMap[kind]).toBe(workflowNodeUiBindings[kind].body);
      expect(getNodeConfigSections(kind)).toBe(catalogEntry.configSections);
      expect(definition.getSourceHandles).toBe(getNodeSourceHandleDefinitions);
      expect(getNodeSourceHandleDefinitions(defaultData)).toEqual(expect.any(Array));
      expect(definition.getSourceHandles(defaultData)).toEqual(getNodeSourceHandleDefinitions(defaultData));
      expect(defaultData.kind).toBe(kind);
      expect(defaultData.title).toBeTruthy();
      expect(defaultData.summary).toBeTruthy();
      expect(defaultData.metric).toBeTruthy();
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

  it("derives palette nodes from sorted insertable catalog entries", () => {
    const sortedInsertableKinds = orderedWorkflowNodeCatalog
      .filter((definition) => definition.insertable)
      .map((definition) => definition.kind);

    expect(insertableNodeKinds).toEqual(sortedInsertableKinds);
    expect(paletteItems.map((item) => item.id)).toEqual(insertableNodeKinds);
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
    const customBranchHandles = getNodeSourceHandleDefinitions({
      ...createDefaultNodeData("branch"),
      branchPaths: [
        { id: "branch-vip", label: "VIP", operator: "IF", title: "CASE 1" },
        { id: "branch-risk", label: "风险客户", operator: "ELIF", title: "CASE 2" },
        { id: "branch-fallback", isDefault: true, label: "默认", operator: "ELSE", title: "CASE 3" },
      ],
    });

    expect(getNodeSourceHandleDefinitions(createDefaultNodeData("goal"))).toEqual([]);
    expect(getNodeSourceHandleDefinitions(createDefaultNodeData("wait"))).toEqual([{ top: 16 }]);
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
    expect(getDefaultSourceHandleId("branch", {
      ...createDefaultNodeData("branch"),
      branchPaths: [
        { id: "branch-vip", label: "VIP", operator: "IF", title: "CASE 1" },
      ],
    })).toBe("branch-vip");
    expect(getDefaultSourceHandleId("wait")).toBeUndefined();
  });

  it("creates independent default branch path data for each branch node", () => {
    const firstBranch = createDefaultNodeData("branch");
    const secondBranch = createDefaultNodeData("branch");

    expect(firstBranch.branchPaths).toEqual(secondBranch.branchPaths);
    expect(firstBranch.branchPaths).not.toBe(secondBranch.branchPaths);
    expect(firstBranch.branchPaths?.[0]).not.toBe(secondBranch.branchPaths?.[0]);
  });
});
