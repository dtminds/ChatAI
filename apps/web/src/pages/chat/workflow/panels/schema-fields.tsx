import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  NodeConfigField,
  NodeConfigSection,
} from "../node-config-schema";
import type {
  WorkflowNodeConfigPatch,
  WorkflowNodeData,
  WorkflowNodeKind,
} from "../types";
import { FieldGroup } from "./field-group";

export function NodeConfigSchemaSections<TKind extends WorkflowNodeKind>({
  data,
  onNodeChange,
  sections,
}: {
  data: WorkflowNodeData<TKind>;
  onNodeChange: (patch: WorkflowNodeConfigPatch<TKind>) => void;
  sections: NodeConfigSection<TKind>[];
}) {
  return (
    <>
      {sections.map((section) => (
        <FieldGroup key={section.id} title={section.title}>
          <div className="space-y-3">
            {section.fields.map((field) => (
              <NodeConfigFieldControl
                data={data}
                field={field}
                key={field.id}
                onNodeChange={onNodeChange}
              />
            ))}
          </div>
        </FieldGroup>
      ))}
    </>
  );
}

function NodeConfigFieldControl<TKind extends WorkflowNodeKind>({
  data,
  field,
  onNodeChange,
}: {
  data: WorkflowNodeData<TKind>;
  field: NodeConfigField<TKind>;
  onNodeChange: (patch: WorkflowNodeConfigPatch<TKind>) => void;
}) {
  if (field.kind === "option-cards") {
    const activeValue = field.getValue(data);

    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <div className={cn("grid gap-2", field.columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {field.getOptions(data).map((option) => {
            const isActive = activeValue === option.value;

            return (
              <button
                aria-label={`选择${option.label}`}
                aria-pressed={isActive}
                className={cn(
                  "flex min-h-[72px] flex-col items-start rounded-[10px] border bg-card p-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                  isActive && "border-primary bg-primary/5",
                )}
                key={option.value}
                onClick={() => onNodeChange(field.toPatch(option.value, data, option))}
                type="button"
              >
                {option.icon ? (
                  <HugeiconsIcon icon={option.icon} size={17} strokeWidth={1.8} />
                ) : null}
                <span className={cn("text-sm font-medium", option.icon && "mt-2")}>
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-1 text-xs leading-4 text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.kind === "switch") {
    return (
      <div className="flex items-center justify-between rounded-[10px] border bg-card p-3">
        <div>
          <Label htmlFor={field.id}>{field.label}</Label>
          {field.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
          ) : null}
        </div>
        <Switch
          aria-label={field.label}
          checked={field.getValue(data)}
          id={field.id}
          onCheckedChange={(checked) => onNodeChange(field.toPatch(checked, data))}
        />
      </div>
    );
  }

  if (field.kind === "textarea") {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{field.label}</Label>
        <Textarea
          className="resize-none"
          id={field.id}
          onChange={(event) => onNodeChange(field.toPatch(event.target.value, data))}
          rows={field.minRows ?? 4}
          value={field.getValue(data)}
        />
      </div>
    );
  }

  if (field.kind === "number") {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{field.label}</Label>
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <Input
            id={field.id}
            min={field.min}
            onChange={(event) => {
              const numericValue = Number(event.target.value);
              const nextValue = Math.max(numericValue, field.min ?? Number.NEGATIVE_INFINITY);
              onNodeChange(field.toPatch(nextValue, data));
            }}
            type="number"
            value={field.getValue(data)}
          />
          {field.suffix ? <span className="text-sm text-muted-foreground">{field.suffix}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>{field.label}</Label>
      <Input
        id={field.id}
        onChange={(event) => onNodeChange(field.toPatch(event.target.value, data))}
        value={field.getValue(data)}
      />
    </div>
  );
}
