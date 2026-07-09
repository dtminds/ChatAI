import type { NodeVisual } from "../node-catalog";
import type { WorkflowNodeRenderData } from "../types";

export type NodeBodyProps = {
  data: WorkflowNodeRenderData;
  visual: NodeVisual;
};
