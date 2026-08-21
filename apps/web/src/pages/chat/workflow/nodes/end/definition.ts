import { LoginCircle01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createDefaultTargetHandles,
  createNoSourceHandles,
  createNodeData,
  sourceNodeKinds,
  terminalNodeLayout,
} from "../definition-shared";

export const endNodeDefinition: WorkflowNodeDefinition<"end"> = {
  availableNextKinds: [],
  availablePrevKinds: sourceNodeKinds,
  canDelete: false,
  canDuplicate: false,
  canInsertAfter: false,
  canRename: false,
  configSections: [],
  createDefaultData: () =>
    createNodeData("end", {
      label: "结束",
      metric: "退出营销旅程",
      title: "结束",
    }),
  insertable: false,
  kind: "end",
  layout: terminalNodeLayout,
  role: "terminal",
  getSourceHandles: createNoSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 1000,
  visual: {
    accentClassName: "bg-blue-500 text-white",
    accentRgb: "37 99 235",
    icon: LoginCircle01Icon,
    label: "结束",
  },
};
