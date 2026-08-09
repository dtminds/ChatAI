import { cn } from "@/lib/utils";
import { AgentModelBadge } from "@/pages/chat/ai-hosting/agent-model-badge";

export type WorkflowNodeFieldTagTone = "default" | "primary" | "warning";

export type WorkflowNodeFieldTag = {
  text: string;
  tone?: WorkflowNodeFieldTagTone;
};

export type WorkflowNodeFieldValue =
  | {
      kind: "empty";
      text?: string;
    }
  | {
      kind: "model";
      label: string;
      model: string;
    }
  | {
      kind: "tag";
      text: string;
      tone?: WorkflowNodeFieldTagTone;
    }
  | {
      items: WorkflowNodeFieldTag[];
      kind: "tags";
      singleLine?: boolean;
    }
  | {
      kind: "text";
      maxLines?: number;
      text: string;
    };

export type WorkflowNodeField = {
  id: string;
  label: string;
  value: WorkflowNodeFieldValue;
};

export function NodeFieldList({ fields }: { fields: WorkflowNodeField[] }) {
  if (!fields.length) {
    return null;
  }

  return (
    <span className="mx-4 mb-3.5 grid gap-2 pb-0.5">
      {fields.map((field) => (
        <span
          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-1 text-xs leading-[18px]"
          key={field.id}
        >
          <span className="whitespace-nowrap text-[var(--workflow-text-tertiary)]">
            {field.label}：
          </span>
          <NodeFieldValue value={field.value} />
        </span>
      ))}
    </span>
  );
}

function NodeFieldValue({ value }: { value: WorkflowNodeFieldValue }) {
  if (value.kind === "empty") {
    return (
      <span className="min-w-0 text-[var(--workflow-text-tertiary)]">
        {value.text ?? "未配置"}
      </span>
    );
  }

  if (value.kind === "tag") {
    return (
      <span className="flex min-w-0 flex-wrap gap-1">
        <NodeFieldTag tag={value} />
      </span>
    );
  }

  if (value.kind === "model") {
    return (
      <AgentModelBadge
        className="max-w-full text-xs [&>span:first-child]:size-4"
        label={value.label}
        model={value.model}
      />
    );
  }

  if (value.kind === "tags") {
    return (
      <span className={cn(
        "min-w-0",
        value.singleLine
          ? "overflow-hidden [mask-image:linear-gradient(to_right,#000_calc(100%_-_20px),transparent)]"
          : "flex flex-wrap gap-1",
      )}>
        <span className={value.singleLine ? "flex w-max min-w-full gap-1 whitespace-nowrap" : "contents"}>
          {value.items.map((tag, index) => (
            <NodeFieldTag key={`${tag.text}-${index}`} singleLine={value.singleLine} tag={tag} />
          ))}
        </span>
      </span>
    );
  }

  const maxLines = Math.max(1, Math.floor(value.maxLines ?? 1));

  return (
    <span
      className="min-w-0 overflow-hidden break-words text-foreground"
      style={{
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: maxLines,
        display: "-webkit-box",
      }}
    >
      {value.text}
    </span>
  );
}

function NodeFieldTag({ singleLine = false, tag }: {
  singleLine?: boolean;
  tag: WorkflowNodeFieldTag;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center rounded px-1.5 py-0.5 text-[11px] leading-4",
        singleLine && "max-w-full shrink-0 overflow-hidden",
        tag.tone === "primary" && "bg-primary/10 text-primary",
        tag.tone === "warning" && "bg-warning-muted/55 text-warning",
        (!tag.tone || tag.tone === "default") && "bg-secondary text-secondary-foreground",
      )}
    >
      <span className={singleLine ? "truncate" : undefined}>{tag.text}</span>
    </span>
  );
}
