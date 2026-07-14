import { StopCircleIcon } from "@hugeicons/core-free-icons";
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
    createNodeData("end", 1, {
      label: "结束",
      metric: "退出营销旅程",
      title: "结束",
    }),
  createExecutionConfig: () => ({}),
  insertable: false,
  kind: "end",
  layout: terminalNodeLayout,
  role: "terminal",
  schemaVersion: 1,
  getSourceHandles: createNoSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  sort: 1000,
  visual: {
    accentClassName: "bg-slate-700 text-white ring-slate-700/20",
    accentRgb: "51 65 85",
    icon: StopCircleIcon,
    label: "结束",
  },
};
