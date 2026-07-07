import type { NodeProps } from "@xyflow/react";
import { branchHandleOptions } from "../constants";
import { getBranchHandleTop } from "../layout";
import { nodeVisuals } from "../node-definitions";
import type { WorkflowRenderNode } from "../types";
import { WorkflowBaseNode } from "./base-node";
import { WorkflowSourceHandle } from "./node-handles";
import { NodeComponentMap } from "./registry";

export function WorkflowNodeCard({ data, id }: NodeProps<WorkflowRenderNode>) {
  const NodeComponent = NodeComponentMap[data.kind];

  return (
    <WorkflowBaseNode
      body={<NodeComponent data={data} visual={nodeVisuals[data.kind]} />}
      data={data}
      id={id}
      sourceHandles={<WorkflowNodeSourceHandles data={data} id={id} />}
    />
  );
}

function WorkflowNodeSourceHandles({
  data,
  id,
}: Pick<NodeProps<WorkflowRenderNode>, "data" | "id">) {
  if (data.kind === "goal") {
    return null;
  }

  if (data.kind === "branch") {
    return (
      <>
        {branchHandleOptions.map((branch) => (
          <WorkflowSourceHandle
            className="workflow-branch-path-handle"
            handleId={branch.id}
            insertMenuOpen={
              data.insertMenuOpen
              && (data.insertMenuSourceHandle ?? branchHandleOptions[0].id) === branch.id
            }
            key={branch.id}
            label={branch.label}
            nodeId={id}
            onToggleInsertMenu={data.onToggleInsertMenu}
            showInsertAction
            title={data.title}
            top={getBranchHandleTop(branch.id)}
          />
        ))}
      </>
    );
  }

  return (
    <WorkflowSourceHandle
      insertMenuOpen={data.insertMenuOpen}
      nodeId={id}
      onToggleInsertMenu={data.onToggleInsertMenu}
      showInsertAction
      title={data.title}
      top={16}
    />
  );
}
