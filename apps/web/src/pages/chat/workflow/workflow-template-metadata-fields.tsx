import { workflowTemplateTagDimensions } from "@chatai/contracts";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const WORKFLOW_TEMPLATE_METADATA_DIALOG_CLASS_NAME =
  "max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[640px] overflow-y-auto";

export type WorkflowTemplateMetadataValue = {
  coverUrl: string;
  description: string;
  name: string;
  sortOrder: string;
  tags: string[];
};

export function WorkflowTemplateMetadataFields({
  onChange,
  value,
}: {
  onChange: (value: WorkflowTemplateMetadataValue) => void;
  value: WorkflowTemplateMetadataValue;
}) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const descriptionId = `${fieldId}-description`;
  const coverUrlId = `${fieldId}-cover-url`;
  const sortOrderId = `${fieldId}-sort-order`;
  const update = <Key extends keyof WorkflowTemplateMetadataValue>(
    key: Key,
    nextValue: WorkflowTemplateMetadataValue[Key],
  ) => onChange({ ...value, [key]: nextValue });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
        <Label className="pt-2" htmlFor={nameId}>模板名称</Label>
        <Input
          id={nameId}
          onChange={(event) => update("name", event.target.value)}
          placeholder="请输入模板名称"
          value={value.name}
        />
      </div>
      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
        <Label className="pt-2" htmlFor={descriptionId}>模板描述</Label>
        <Textarea
          id={descriptionId}
          onChange={(event) => update("description", event.target.value)}
          placeholder="请输入模板描述"
          required
          value={value.description}
        />
      </div>
      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
        <Label className="pt-2" htmlFor={coverUrlId}>封面图片</Label>
        <Input
          id={coverUrlId}
          onChange={(event) => update("coverUrl", event.target.value)}
          placeholder="请输入封面图片 URL（可选，默认无需输入）"
          value={value.coverUrl}
        />
      </div>
      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
        <Label className="pt-2" htmlFor={sortOrderId}>排序权重</Label>
        <div className="space-y-1.5">
          <Input
            id={sortOrderId}
            inputMode="numeric"
            onChange={(event) => update("sortOrder", event.target.value)}
            placeholder="请输入排序权重"
            type="number"
            value={value.sortOrder}
          />
          <p className="text-xs text-muted-foreground">数值越大越靠前，默认为 0</p>
        </div>
      </div>
      <div aria-label="模板标签" className="space-y-3">
        {workflowTemplateTagDimensions.map(dimension => (
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4" key={dimension.id}>
            <div className="pt-1.5 text-sm font-medium">{dimension.label}</div>
            <div className="flex flex-wrap gap-2">
              {dimension.tags.map(tag => {
                const selected = value.tags.includes(tag.id);
                return (
                  <Button
                    aria-pressed={selected}
                    className="h-8"
                    key={tag.id}
                    onClick={() => update(
                      "tags",
                      selected
                        ? value.tags.filter(id => id !== tag.id)
                        : [...value.tags, tag.id],
                    )}
                    size="sm"
                    type="button"
                    variant={selected ? "secondary" : "outline"}
                  >
                    {tag.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
