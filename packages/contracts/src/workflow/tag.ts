import { Type, type Static } from "@sinclair/typebox";
import { WorkflowTagExecutionConfigSchema } from "./node-contract.js";

export const WorkflowTagCommandSchema = Type.Composite([
  WorkflowTagExecutionConfigSchema,
  Type.Object({ source: Type.Literal("workflow") }),
], { additionalProperties: false });

export const WorkflowTagResultSchema = Type.Object({}, { additionalProperties: false });

export type WorkflowTagCommand = Static<typeof WorkflowTagCommandSchema>;
export type WorkflowTagResult = Static<typeof WorkflowTagResultSchema>;
