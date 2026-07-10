import type {
  InsertableWorkflowNodeKind,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeKind,
} from "./types";
import {
  orderedWorkflowNodeDefinitions,
  workflowNodeDefinitions,
} from "./nodes/registry";
import type {
  AnyWorkflowNodeDefinition,
  NodeVisual,
  WorkflowNodeDefinition,
  WorkflowNodePaletteGroup,
  WorkflowNodePaletteGroupId,
  WorkflowNodeRole,
} from "./nodes/definition-types";

export type {
  NodeVisual,
  WorkflowNodeDefinition as WorkflowNodeCatalogEntry,
  WorkflowNodeLayoutMetrics,
  WorkflowNodePaletteGroup,
  WorkflowNodePaletteGroupId,
  WorkflowNodeRole,
} from "./nodes/definition-types";

export const workflowNodePaletteGroups = [
  {
    id: "flow",
    label: "流程控制",
    sort: 10,
  },
  {
    id: "logic",
    label: "条件逻辑",
    sort: 20,
  },
  {
    id: "engagement",
    label: "触达动作",
    sort: 30,
  },
] as const satisfies readonly WorkflowNodePaletteGroup[];

export const workflowNodeCatalog = workflowNodeDefinitions;

export const orderedWorkflowNodeCatalog = orderedWorkflowNodeDefinitions;

export const nodeVisuals = Object.fromEntries(
  Object.entries(workflowNodeCatalog).map(([kind, definition]) => [
    kind,
    definition.visual,
  ]),
) as Record<WorkflowNodeKind, NodeVisual>;

type InsertableWorkflowNodeCatalogEntry = AnyWorkflowNodeDefinition & {
  kind: InsertableWorkflowNodeKind;
  paletteGroup: WorkflowNodePaletteGroupId;
  paletteLabel: string;
};

export type WorkflowPaletteItem = {
  accentClassName: string;
  description: string;
  groupId: WorkflowNodePaletteGroupId;
  icon: NodeVisual["icon"];
  id: InsertableWorkflowNodeKind;
  label: string;
  searchText: string;
  sort: number;
};

export type WorkflowPaletteItemGroup = WorkflowNodePaletteGroup & {
  items: WorkflowPaletteItem[];
};

export const insertableNodeKinds = orderedWorkflowNodeCatalog
  .filter(isInsertableWorkflowNodeCatalogEntry)
  .map((definition) => definition.kind);

export const paletteItems = insertableNodeKinds
  .map((kind) => workflowNodeCatalog[kind])
  .filter(isInsertableWorkflowNodeCatalogEntry)
  .map(createPaletteItem) satisfies WorkflowPaletteItem[];

export function getAvailableNextNodeKinds(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).availableNextKinds;
}

export function getAvailablePrevNodeKinds(kind: WorkflowNodeKind) {
  return getWorkflowNodeCatalogEntry(kind).availablePrevKinds;
}

export function getInsertableNodeKindsForSource(
  sourceKind: WorkflowNodeKind,
): InsertableWorkflowNodeKind[] {
  const availableNextKinds = new Set(getAvailableNextNodeKinds(sourceKind));

  return insertableNodeKinds.filter((kind) => availableNextKinds.has(kind));
}

export function getInsertableNodeKindsBetween(
  sourceKind: WorkflowNodeKind,
  targetKind: WorkflowNodeKind,
): InsertableWorkflowNodeKind[] {
  return getInsertableNodeKindsForSource(sourceKind).filter((kind) =>
    getAvailableNextNodeKinds(kind).includes(targetKind)
    && getAvailablePrevNodeKinds(targetKind).includes(kind),
  );
}

export function getPaletteItemsByKinds(kinds: InsertableWorkflowNodeKind[]) {
  return filterWorkflowPaletteItems({ kinds });
}

export function filterWorkflowPaletteItems({
  kinds,
  query = "",
}: {
  kinds?: InsertableWorkflowNodeKind[];
  query?: string;
} = {}) {
  const kindSet = kinds ? new Set(kinds) : null;
  const normalizedQuery = normalizePaletteSearchText(query);

  return paletteItems.filter((item) => {
    if (kindSet && !kindSet.has(item.id)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return item.searchText.includes(normalizedQuery);
  });
}

export function getWorkflowPaletteItemGroups({
  kinds,
  query = "",
}: {
  kinds?: InsertableWorkflowNodeKind[];
  query?: string;
} = {}): WorkflowPaletteItemGroup[] {
  const items = filterWorkflowPaletteItems({ kinds, query });
  const itemsByGroupId = new Map<WorkflowNodePaletteGroupId, WorkflowPaletteItem[]>();

  items.forEach((item) => {
    itemsByGroupId.set(item.groupId, [...itemsByGroupId.get(item.groupId) ?? [], item]);
  });

  return workflowNodePaletteGroups
    .map((group) => ({
      ...group,
      items: [...itemsByGroupId.get(group.id) ?? []].sort((first, second) => first.sort - second.sort),
    }))
    .filter((group) => group.items.length > 0);
}

export function getWorkflowNodeCatalogEntry<TKind extends WorkflowNodeKind>(
  kind: TKind,
): WorkflowNodeDefinition<TKind> {
  return workflowNodeCatalog[kind] as unknown as WorkflowNodeDefinition<TKind>;
}

export function getWorkflowNodeRole(kind: WorkflowNodeKind): WorkflowNodeRole | undefined {
  return getWorkflowNodeCatalogEntry(kind).role;
}

export function isWorkflowEntryNode(node: WorkflowNode) {
  return getWorkflowNodeRole(node.data.kind) === "entry";
}

export function isWorkflowTerminalNode(node: WorkflowNode) {
  return getWorkflowNodeRole(node.data.kind) === "terminal";
}

export function findWorkflowEntryNode(nodes: WorkflowNode[]) {
  return nodes.find(isWorkflowEntryNode);
}

export function findWorkflowTerminalNode(nodes: WorkflowNode[]) {
  return nodes.find(isWorkflowTerminalNode);
}

export function isWorkflowNodeKind(value: unknown): value is WorkflowNodeKind {
  return typeof value === "string" && Object.hasOwn(workflowNodeCatalog, value);
}

export function createWorkflowNodeExecutionConfig<TKind extends WorkflowNodeKind>(
  data: WorkflowNodeData<TKind>,
) {
  return getWorkflowNodeCatalogEntry(data.kind).createExecutionConfig(data);
}

function isInsertableWorkflowNodeCatalogEntry(
  definition: AnyWorkflowNodeDefinition,
): definition is InsertableWorkflowNodeCatalogEntry {
  return definition.insertable
    && definition.paletteGroup !== undefined
    && definition.paletteLabel !== undefined;
}

function createPaletteItem(definition: InsertableWorkflowNodeCatalogEntry): WorkflowPaletteItem {
  const description = definition.description ?? "";
  const group = workflowNodePaletteGroups.find((item) => item.id === definition.paletteGroup);
  const label = definition.paletteLabel;

  return {
    accentClassName: definition.visual.accentClassName,
    description,
    groupId: definition.paletteGroup,
    icon: definition.visual.icon,
    id: definition.kind,
    label,
    searchText: normalizePaletteSearchText([
      definition.kind,
      definition.visual.label,
      label,
      description,
      group?.label ?? "",
    ].join(" ")),
    sort: definition.sort,
  };
}

function normalizePaletteSearchText(value: string) {
  return value.trim().toLowerCase();
}
