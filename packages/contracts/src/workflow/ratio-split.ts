import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS = 10_000;
export const WORKFLOW_RATIO_SPLIT_GROUP_MIN = 2;
export const WORKFLOW_RATIO_SPLIT_GROUP_MAX = 5;

const WorkflowRatioSplitDraftGroupSchema = Type.Object({
  basisPoints: Type.Integer({
    maximum: WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS,
    minimum: 0,
  }),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  label: Type.String({ maxLength: 32 }),
}, { additionalProperties: false });

const WorkflowRatioSplitExecutionGroupSchema = Type.Object({
  basisPoints: Type.Integer({
    maximum: WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS,
    minimum: 0,
  }),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  label: Type.String({ maxLength: 32, minLength: 1 }),
}, { additionalProperties: false });

export const WorkflowRatioSplitDraftConfigSchema = Type.Object({
  groups: Type.Array(WorkflowRatioSplitDraftGroupSchema, {
    maxItems: WORKFLOW_RATIO_SPLIT_GROUP_MAX,
    minItems: WORKFLOW_RATIO_SPLIT_GROUP_MIN,
  }),
}, { additionalProperties: false });

export const WorkflowRatioSplitExecutionConfigSchema = Type.Object({
  groups: Type.Array(WorkflowRatioSplitExecutionGroupSchema, {
    maxItems: WORKFLOW_RATIO_SPLIT_GROUP_MAX,
    minItems: WORKFLOW_RATIO_SPLIT_GROUP_MIN,
  }),
}, { additionalProperties: false });

export type WorkflowRatioSplitDraftConfig = Static<typeof WorkflowRatioSplitDraftConfigSchema>;
export type WorkflowRatioSplitDraftGroup = Static<typeof WorkflowRatioSplitDraftGroupSchema>;
export type WorkflowRatioSplitExecutionConfig = Static<typeof WorkflowRatioSplitExecutionConfigSchema>;
export type WorkflowRatioSplitExecutionGroup = Static<typeof WorkflowRatioSplitExecutionGroupSchema>;

export function isWorkflowRatioSplitExecutionConfigComplete(
  value: unknown,
): value is WorkflowRatioSplitExecutionConfig {
  if (!Value.Check(WorkflowRatioSplitExecutionConfigSchema, value)) return false;
  const ids = new Set(value.groups.map(group => group.id));
  return ids.size === value.groups.length
    && value.groups.every(group => group.label.trim().length > 0)
    && getWorkflowRatioSplitBasisPointsTotal(value.groups)
    === WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS;
}

export function getWorkflowRatioSplitBasisPointsTotal(
  groups: readonly Pick<WorkflowRatioSplitDraftGroup, "basisPoints">[],
) {
  return groups.reduce((total, group) => total + group.basisPoints, 0);
}
