import type { NodeVisual } from "../node-catalog";
import type {
  WorkflowNodeKind,
  WorkflowNodeRenderData,
} from "../types";

export type NodeBodyProps<TKind extends WorkflowNodeKind = WorkflowNodeKind> = {
  data: WorkflowNodeRenderData<TKind>;
  visual: NodeVisual;
};
