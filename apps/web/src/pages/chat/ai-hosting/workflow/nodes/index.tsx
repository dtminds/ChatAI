import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import {
  getDefaultSourceHandleId,
} from "../node-handle-definitions";
import { getNodeDefinition, nodeVisuals } from "../node-definitions";
import type { WorkflowRenderNode } from "../types";
import { WorkflowBaseNode } from "./base-node";
import {
  WorkflowSourceHandle,
  WorkflowTargetHandle,
} from "./node-handles";

function WorkflowNodeCardComponent({ data, id }: NodeProps<WorkflowRenderNode>) {
  const definition = getNodeDefinition(data.kind);
  const NodeComponent = definition.body;

  return (
    <WorkflowBaseNode
      body={<NodeComponent data={data} visual={nodeVisuals[data.kind]} />}
      data={data}
      id={id}
      sourceHandles={<WorkflowNodeSourceHandles data={data} id={id} />}
      targetHandles={<WorkflowNodeTargetHandles data={data} />}
    />
  );
}

export const WorkflowNodeCard = memo(WorkflowNodeCardComponent, (previousProps, nextProps) =>
  previousProps.id === nextProps.id
  && previousProps.data === nextProps.data);

function WorkflowNodeSourceHandles({
  data,
  id,
}: Pick<NodeProps<WorkflowRenderNode>, "data" | "id">) {
  if (data.kind === "goal") {
    return null;
  }

  const handles = getNodeDefinition(data.kind).getSourceHandles(data);

  return (
    <>
      {handles.map((handle) => (
        <WorkflowSourceHandle
          className={handle.id ? "workflow-branch-path-handle" : undefined}
          handleId={handle.id}
          insertMenuOpen={
            Boolean(data.insertMenuOpen)
            && (data.insertMenuSourceHandle ?? getDefaultSourceHandleId(data.kind, data)) === handle.id
          }
          key={handle.id ?? "default"}
          label={handle.label}
          nodeId={id}
          onToggleInsertMenu={data.onToggleInsertMenu}
          showInsertAction
          title={data.title}
          top={handle.top}
        />
      ))}
    </>
  );
}

function WorkflowNodeTargetHandles({
  data,
}: Pick<NodeProps<WorkflowRenderNode>, "data">) {
  const handles = getNodeDefinition(data.kind).getTargetHandles(data);

  if (!handles.length) {
    return null;
  }

  return (
    <>
      {handles.map((handle) => (
        <WorkflowTargetHandle key={handle.id ?? "default"} />
      ))}
    </>
  );
}
