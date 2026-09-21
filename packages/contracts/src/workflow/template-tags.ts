import { Type, type Static } from "@sinclair/typebox";

export const WorkflowTemplateTagIdSchema = Type.String({
  maxLength: 80,
  pattern: "^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$",
});

export const workflowTemplateTagDimensions = [
  {
    id: "lifecycle",
    label: "生命周期",
    tags: [
      { id: "lifecycle:potential_conversion", label: "潜客转化" },
      { id: "lifecycle:new_customer_repurchase", label: "新客二回" },
      { id: "lifecycle:old_customer_repurchase", label: "老客复购" },
      { id: "lifecycle:dormant_reactivation", label: "沉睡唤醒" },
    ],
  },
  {
    id: "industry",
    label: "行业特性",
    tags: [
      { id: "industry:apparel", label: "服饰" },
      { id: "industry:beauty", label: "美妆" },
      { id: "industry:maternal_baby", label: "母婴" },
      { id: "industry:pet", label: "宠物" },
      { id: "industry:health", label: "大健康" },
    ],
  },
  {
    id: "scene",
    label: "常见场景",
    tags: [
      { id: "scene:points", label: "积分运营" },
      { id: "scene:customer_care", label: "客户关怀" },
      { id: "scene:promotion_event", label: "大促活动" },
      { id: "scene:product_marketing", label: "商品营销" },
    ],
  },
] as const;

export type WorkflowTemplateTagDimension = (typeof workflowTemplateTagDimensions)[number];
export type WorkflowTemplateTagId = Static<typeof WorkflowTemplateTagIdSchema>;

const workflowTemplateTagMap: Map<string, WorkflowTemplateTagDimension["tags"][number]> = new Map(
  workflowTemplateTagDimensions.flatMap(dimension => dimension.tags.map(tag => [tag.id, tag] as const)),
);

export function isWorkflowTemplateTagId(value: string): value is WorkflowTemplateTagId {
  return workflowTemplateTagMap.has(value);
}

export function getWorkflowTemplateTagLabel(tagId: string) {
  return workflowTemplateTagMap.get(tagId)?.label;
}

export function normalizeWorkflowTemplateTagIds(tags: readonly string[] | null | undefined): WorkflowTemplateTagId[] {
  return [...new Set((tags ?? []).filter(isWorkflowTemplateTagId))];
}

export function getWorkflowTemplateTagDimension(tagId: string) {
  return workflowTemplateTagDimensions.find(dimension => dimension.tags.some(tag => tag.id === tagId));
}
