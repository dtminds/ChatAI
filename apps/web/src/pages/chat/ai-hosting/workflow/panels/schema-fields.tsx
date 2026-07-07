import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  NodeConfigField,
  NodeConfigSection,
} from "../node-config-schema";
import type { MarketingNodeData } from "../types";
import { FieldGroup } from "./field-group";

export function NodeConfigSchemaSections({
  data,
  onNodeChange,
  sections,
}: {
  data: MarketingNodeData;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
  sections: NodeConfigSection[];
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

function NodeConfigFieldControl({
  data,
  field,
  onNodeChange,
}: {
  data: MarketingNodeData;
  field: NodeConfigField;
  onNodeChange: (patch: Partial<MarketingNodeData>) => void;
}) {
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
