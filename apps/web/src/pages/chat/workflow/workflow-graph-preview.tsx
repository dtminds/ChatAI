import { useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import { hydrateWorkflowDraft } from "./workflow-draft-normalizer";
import { createWorkflowReadOnlyRenderElements } from "./use-workflow-render-elements";
import type { WorkflowDraft } from "./types";

const ignore = () => undefined;

export function WorkflowGraphPreview({
  className,
  draft,
}: {
  className?: string;
  draft: WorkflowDraft;
}) {
  const previewDraft = useMemo(() => hydrateWorkflowDraft(draft), [draft]);
  const rendered = useMemo(
    () => createWorkflowReadOnlyRenderElements(previewDraft.nodes, previewDraft.edges),
    [previewDraft],
  );

  return (
    <div className={cn("workflow-page workflow-graph-preview relative isolate overflow-hidden rounded-xl border bg-[var(--workflow-canvas-bg)]", className)}>
      <ReactFlowProvider>
        <WorkflowCanvas
          allowedInsertableNodeKinds={[]}
          canRedo={false}
          canUndo={false}
          edges={rendered.edges}
          fitViewOnInit
          hideAttribution
          isReadOnly
          nodes={rendered.nodes}
          onAddNode={ignore}
          onArrange={ignore}
          onConnect={ignore}
          onEdgesChange={ignore}
          onIsValidConnection={() => false}
          onNodeDrag={ignore}
          onNodeDragStart={ignore}
          onNodeDragStop={ignore}
          onNodeHoverEnd={ignore}
          onNodeHoverStart={ignore}
          onNodesChange={ignore}
          onPaletteOpenChange={ignore}
          onPaneClick={ignore}
          onRedo={ignore}
          onSelectEdge={ignore}
          onSelectNode={ignore}
          onUndo={ignore}
          onViewportChangeEnd={ignore}
          paletteOpen={false}
          preview
          showToolbar={false}
          viewport={previewDraft.viewport}
        />
      </ReactFlowProvider>
    </div>
  );
}
