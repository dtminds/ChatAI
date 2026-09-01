import { Type, type Static } from "@sinclair/typebox";
import { WorkflowDraftSchema, WorkflowIdSchema } from "./dto.js";
import { WorkflowTypeSchema } from "./policy.js";

export const WorkflowTemplateStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("published"),
  Type.Literal("offline"),
  Type.Literal("archived"),
]);

export const WorkflowTemplateConfigurationItemSchema = Type.Object({
  description: Type.String({ maxLength: 200 }),
  id: Type.String({ minLength: 1, maxLength: 64 }),
  label: Type.String({ minLength: 1, maxLength: 80 }),
  required: Type.Boolean(),
  type: Type.Union([
    Type.Literal("text"),
    Type.Literal("number"),
    Type.Literal("select"),
  ]),
  options: Type.Optional(Type.Array(Type.Object({
    label: Type.String({ maxLength: 80 }),
    value: Type.String({ maxLength: 200 }),
  }, { additionalProperties: false }), { maxItems: 50 })),
}, { additionalProperties: false });

export const WorkflowTemplateListItemSchema = Type.Object({
  category: Type.String({ maxLength: 40 }),
  coverUrl: Type.Union([Type.String({ maxLength: 512 }), Type.Null()]),
  description: Type.String({ maxLength: 200 }),
  id: WorkflowIdSchema,
  name: Type.String({ minLength: 1, maxLength: 40 }),
  nodeCount: Type.Integer({ minimum: 0, maximum: 200 }),
  publishedAt: Type.String(),
  scene: Type.String({ maxLength: 40 }),
  updatedAt: Type.String(),
  version: Type.Integer({ minimum: 1 }),
  workflowType: WorkflowTypeSchema,
}, { additionalProperties: false });

export const WorkflowTemplateListPageSchema = Type.Object({
  items: Type.Array(WorkflowTemplateListItemSchema, { maxItems: 50 }),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
  total: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
}, { additionalProperties: false });

export const WorkflowTemplateDetailSchema = Type.Intersect([
  WorkflowTemplateListItemSchema,
  Type.Object({
    configurationItems: Type.Array(WorkflowTemplateConfigurationItemSchema, { maxItems: 100 }),
    draft: WorkflowDraftSchema,
    status: WorkflowTemplateStatusSchema,
  }, { additionalProperties: false }),
]);

export const WorkflowTemplateConversionRequestSchema = Type.Object({
  category: Type.String({ maxLength: 40 }),
  coverUrl: Type.Optional(Type.String({ maxLength: 512 })),
  description: Type.String({ maxLength: 200 }),
  expectedDraftVersion: Type.Integer({ minimum: 1 }),
  name: Type.String({ minLength: 1, maxLength: 40 }),
  scene: Type.String({ maxLength: 40 }),
});

export const WorkflowTemplateApplicationRequestSchema = Type.Object({
  clientRequestId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  description: Type.Optional(Type.String({ maxLength: 200 })),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
});

export type WorkflowTemplateStatus = Static<typeof WorkflowTemplateStatusSchema>;
export type WorkflowTemplateConfigurationItem = Static<typeof WorkflowTemplateConfigurationItemSchema>;
export type WorkflowTemplateListItem = Static<typeof WorkflowTemplateListItemSchema>;
export type WorkflowTemplateListPage = Static<typeof WorkflowTemplateListPageSchema>;
export type WorkflowTemplateDetail = Static<typeof WorkflowTemplateDetailSchema>;
export type WorkflowTemplateConversionRequest = Static<typeof WorkflowTemplateConversionRequestSchema>;
export type WorkflowTemplateApplicationRequest = Static<typeof WorkflowTemplateApplicationRequestSchema>;
