import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import {
  getDefaultSourceHandleId,
  getNodeSourceHandleDefinitions,
  getNodeTargetHandleDefinitions,
} from "../node-handle-definitions";
import { getNodeDefinition, nodeVisuals } from "../node-definitions";
import type { WorkflowRenderNode } from "../types";
import { WorkflowBaseNode } from "./base-node";
import { NodeFieldList } from "./node-field-list";
import {
  WorkflowSourceHandle,
  WorkflowTargetHandle,
} from "./node-handles";

function WorkflowNodeCardComponent({ data, id }: NodeProps<WorkflowRenderNode>) {
  const definition = getNodeDefinition(data.kind);
  const body = definition.body;
  const CustomBody = body.kind === "custom" ? body.component : null;

  return (
    <div className="relative">
      <WorkflowBaseNode
        body={
          CustomBody
            ? <CustomBody data={data} visual={nodeVisuals[data.kind]} />
            : body.kind === "fields"
              ? <NodeFieldList fields={body.getFields(data)} />
              : null
        }
        data={data}
        id={id}
        sourceHandles={<WorkflowNodeSourceHandles data={data} id={id} />}
        targetHandles={<WorkflowNodeTargetHandles data={data} />}
      />
      {data.dataMetric ? (
        <div
          className="nodrag nopan absolute left-0 top-full mt-1.5 flex w-full justify-center gap-3 whitespace-nowrap text-[11px] text-muted-foreground"
        >
          {data.kind === "start" ? (
            <span>已进入 <strong className="font-semibold text-foreground">{data.dataMetric.entered}</strong></span>
          ) : null}
          {data.kind !== "start" && data.kind !== "end" ? (
            <>
              <button
                className="hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onDataMetricClick?.(id);
                }}
                type="button"
              >
                当前停留 <strong className="font-semibold text-foreground">{data.dataMetric.current}</strong>
              </button>
              <span>已通过 <strong className="font-semibold text-foreground">{data.dataMetric.passed}</strong></span>
            </>
          ) : null}
          {data.kind === "end" ? (
            <span>已完成 <strong className="font-semibold text-foreground">{data.dataMetric.completed}</strong></span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const WorkflowNodeCard = memo(WorkflowNodeCardComponent, (previousProps, nextProps) =>
  previousProps.id === nextProps.id
  && previousProps.data === nextProps.data);

function WorkflowNodeSourceHandles({
  data,
  id,
}: Pick<NodeProps<WorkflowRenderNode>, "data" | "id">) {
  const handles = getNodeSourceHandleDefinitions(data);

  if (!handles.length) {
    return null;
  }

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
          showInsertAction={!data.dataMetric}
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
  const handles = getNodeTargetHandleDefinitions(data);

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
