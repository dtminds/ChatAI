import { describe, expect, it } from "vitest";
import {
  getAvailableNextNodeKinds,
  getAvailablePrevNodeKinds,
  getInsertableNodeKindsBetween,
  getInsertableNodeKindsForSource,
  getWorkflowNodeCatalogEntry,
  insertableNodeKinds,
  orderedWorkflowNodeCatalog,
  paletteItems,
  workflowNodeCatalog,
} from "@/pages/chat/ai-hosting/workflow/node-catalog";
import {
  createDefaultNodeData,
  nodeDefinitions,
  orderedNodeDefinitions,
} from "@/pages/chat/ai-hosting/workflow/node-definitions";
import { getNodeConfigSections } from "@/pages/chat/ai-hosting/workflow/node-config-schema";
import { NodeComponentMap } from "@/pages/chat/ai-hosting/workflow/nodes/registry";
import { PanelComponentMap } from "@/pages/chat/ai-hosting/workflow/panels/registry";
import type { MarketingNodeKind } from "@/pages/chat/ai-hosting/workflow/types";

describe("workflow node catalog", () => {
  it("keeps pure node metadata, UI bindings and config schema in sync", () => {
    const nodeKinds = Object.keys(workflowNodeCatalog) as MarketingNodeKind[];

    expect(nodeKinds).toEqual(["action", "ai", "branch", "goal", "trigger", "wait"]);

    for (const kind of nodeKinds) {
      const catalogEntry = getWorkflowNodeCatalogEntry(kind);
      const definition = nodeDefinitions[kind];
      const defaultData = createDefaultNodeData(kind);

      expect(definition.kind).toBe(catalogEntry.kind);
      expect(definition.visual).toBe(catalogEntry.visual);
      expect(definition.createDefaultData).toBe(catalogEntry.createDefaultData);
      expect(NodeComponentMap[kind]).toBe(definition.body);
      expect(PanelComponentMap[kind]).toBe(definition.settings);
      expect(getNodeConfigSections(kind)).toBe(catalogEntry.configSections);
      expect(defaultData.kind).toBe(kind);
      expect(defaultData.title).toBeTruthy();
      expect(defaultData.summary).toBeTruthy();
      expect(defaultData.metric).toBeTruthy();
    }
  });

  it("derives palette nodes from sorted insertable catalog entries", () => {
    const sortedInsertableKinds = orderedWorkflowNodeCatalog
      .filter((definition) => definition.insertable)
      .map((definition) => definition.kind);

    expect(insertableNodeKinds).toEqual(sortedInsertableKinds);
    expect(paletteItems.map((item) => item.id)).toEqual(insertableNodeKinds);
    expect(orderedNodeDefinitions.map((definition) => definition.kind)).toEqual(
      orderedWorkflowNodeCatalog.map((definition) => definition.kind),
    );
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
});
