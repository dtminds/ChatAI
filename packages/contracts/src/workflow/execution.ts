import { Type, type Static } from "@sinclair/typebox";
import { WorkflowIdSchema, WorkflowNodeKindSchema } from "./dto.js";
import { WorkflowCapabilityRequirementSchema } from "./policy.js";

const WorkflowExecutionNodeBaseSchema = Type.Object({
  config: Type.Record(Type.String(), Type.Unknown()),
  id: Type.String({ minLength: 1, maxLength: 128 }),
  kind: WorkflowNodeKindSchema,
  nodeSchemaVersion: Type.Integer({ minimum: 1 }),
});

export const WorkflowExecutionNodeSchema = Type.Composite([
  WorkflowExecutionNodeBaseSchema,
  Type.Object({
    requiredCapabilities: Type.Array(WorkflowCapabilityRequirementSchema),
  }),
]);

export const WorkflowLegacyExecutionNodeSchema = WorkflowExecutionNodeBaseSchema;

export const WorkflowExecutionEdgeSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 256 }),
  source: Type.String({ minLength: 1, maxLength: 128 }),
  sourceOutletId: Type.String({ minLength: 1, maxLength: 128 }),
  target: Type.String({ minLength: 1, maxLength: 128 }),
});

const WorkflowExecutionSpecBaseSchema = Type.Object({
  edges: Type.Array(WorkflowExecutionEdgeSchema, { maxItems: 500 }),
  entryNodeId: Type.String({ minLength: 1, maxLength: 128 }),
  revision: Type.Integer({ minimum: 1 }),
  terminalNodeId: Type.String({ minLength: 1, maxLength: 128 }),
  workflowId: WorkflowIdSchema,
});

export const WorkflowExecutionSpecSchema = Type.Composite([
  WorkflowExecutionSpecBaseSchema,
  Type.Object({
    nodes: Type.Array(WorkflowExecutionNodeSchema, { maxItems: 200 }),
    requiredCapabilities: Type.Array(WorkflowCapabilityRequirementSchema),
    schemaVersion: Type.Literal(2),
  }),
]);

export const WorkflowLegacyExecutionSpecSchema = Type.Composite([
  WorkflowExecutionSpecBaseSchema,
  Type.Object({
    nodes: Type.Array(WorkflowLegacyExecutionNodeSchema, { maxItems: 200 }),
    schemaVersion: Type.Literal(1),
  }),
]);

export const WorkflowStoredExecutionSpecSchema = Type.Union([
  WorkflowExecutionSpecSchema,
  WorkflowLegacyExecutionSpecSchema,
]);

export const WorkflowRunStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("waiting"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);

export const WorkflowTaskStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("leased"),
  Type.Literal("dispatched"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
  Type.Literal("dead"),
]);

export const WorkflowTaskMessageSchema = Type.Object({
  messageId: Type.String({ minLength: 1 }),
  occurredAt: Type.String(),
  runId: WorkflowIdSchema,
  shardId: Type.Integer({ minimum: 0, maximum: 255 }),
  taskId: WorkflowIdSchema,
  taskVersion: Type.Integer({ minimum: 1 }),
  uid: WorkflowIdSchema,
});

export type WorkflowExecutionNode = Static<typeof WorkflowExecutionNodeSchema>;
export type WorkflowLegacyExecutionNode = Static<typeof WorkflowLegacyExecutionNodeSchema>;
export type WorkflowExecutionEdge = Static<typeof WorkflowExecutionEdgeSchema>;
export type WorkflowExecutionSpec = Static<typeof WorkflowExecutionSpecSchema>;
export type WorkflowLegacyExecutionSpec = Static<typeof WorkflowLegacyExecutionSpecSchema>;
export type WorkflowStoredExecutionSpec = Static<typeof WorkflowStoredExecutionSpecSchema>;
export type WorkflowRunStatus = Static<typeof WorkflowRunStatusSchema>;
export type WorkflowTaskStatus = Static<typeof WorkflowTaskStatusSchema>;
export type WorkflowTaskMessage = Static<typeof WorkflowTaskMessageSchema>;
