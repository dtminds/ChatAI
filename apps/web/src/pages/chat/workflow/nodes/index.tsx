import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
    <div className="relative isolate">
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
        <button
          className="nodrag nopan absolute inset-x-4 top-full -mt-px flex h-8 items-center justify-between rounded-b-[8px] border-x border-b bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
          onClick={(event) => {
            event.stopPropagation();
            data.onDataMetricClick?.(id);
          }}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-3 whitespace-nowrap text-left">
            {data.kind === "start" ? (
              <span>已进入 <strong className="font-semibold text-foreground">{data.dataMetric.entered}</strong></span>
            ) : null}
            {data.kind !== "start" && data.kind !== "end" ? (
              <>
                <span>
                  当前停留 <strong className="font-semibold text-foreground">{data.dataMetric.current}</strong>
                </span>
                <span>已通过 <strong className="font-semibold text-foreground">{data.dataMetric.passed}</strong></span>
              </>
            ) : null}
            {data.kind === "end" ? (
              <span>已完成 <strong className="font-semibold text-foreground">{data.dataMetric.completed}</strong></span>
            ) : null}
          </span>
          <HugeiconsIcon className="shrink-0" icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
        </button>
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
