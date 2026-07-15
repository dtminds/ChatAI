import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { getWorkflowNodeOutputDefinitions, getWorkflowOutputTypeLabel } from "../workflow-node-outputs";
import type { WorkflowNode, WorkflowNodeOutputDefinition } from "../types";

export function NodeOutputsSection({ node }: { node: WorkflowNode }) {
  const outputs = getWorkflowNodeOutputDefinitions(node);

  if (!outputs.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">节点输出</h3>
      <div className="space-y-1 rounded-lg border bg-background p-2">
        {outputs.map((output) => (
          <OutputRow key={output.key} output={output} />
        ))}
      </div>
    </section>
  );
}

function OutputRow({ output }: { output: WorkflowNodeOutputDefinition }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 rounded px-2 text-sm">
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate">{output.label}</span>
        {output.description ? <OutputDescription output={output} /> : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {getWorkflowOutputTypeLabel(output.valueType)}
      </span>
    </div>
  );
}

function OutputDescription({ output }: { output: WorkflowNodeOutputDefinition }) {
  const [open, setOpen] = useState(false);

  return (
    <HoverCard closeDelay={100} onOpenChange={setOpen} open={open} openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          aria-label={`查看${output.label}说明`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onBlur={() => setOpen(false)}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          type="button"
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.8} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 p-3" side="left">
        <WorkflowOutputDescription content={output.description ?? ""} />
      </HoverCardContent>
    </HoverCard>
  );
}

export function WorkflowOutputDescription({ content }: { content: string }) {
  return (
    <ReactMarkdown
      allowedElements={["p", "strong", "code", "ol", "ul", "li", "br"]}
      components={{
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 text-[0.92em]">{children}</code>
        ),
        li: ({ children }) => <li className="pl-0.5">{children}</li>,
        ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
        p: ({ children }) => <p className="whitespace-pre-wrap leading-5">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
      }}
      skipHtml
      unwrapDisallowed
    >
      {content}
    </ReactMarkdown>
  );
}
