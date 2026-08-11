import { Type, type Static } from "@sinclair/typebox";
import type { WorkflowNodeKind } from "./dto.js";
import type { WorkflowEntryEventType } from "./trigger.js";

export const WorkflowTypeSchema = Type.Union([
  Type.Literal("chatai_sop"),
  Type.Literal("wecom_sop"),
  Type.Literal("member_sop"),
]);

export const WorkflowSubjectTypeSchema = Type.Union([
  Type.Literal("chatai_contact"),
  Type.Literal("wecom_contact"),
  Type.Literal("miniapp_member"),
]);

export const WorkflowCapabilityRequirementSchema = Type.Object({
  capabilityKey: Type.String({
    maxLength: 128,
    minLength: 1,
    pattern: "^(?:event|operation)\\.[a-z0-9]+(?:[._-][a-z0-9]+)*$",
  }),
  contractVersion: Type.Integer({ minimum: 1, maximum: 65_535 }),
}, { additionalProperties: false });

export const WorkflowTypeEntitlementResultSchema = Type.Union([
  Type.Object({
    entitled: Type.Literal(true),
    unentitledSince: Type.Null(),
  }, { additionalProperties: false }),
  Type.Object({
    entitled: Type.Literal(false),
    unentitledSince: Type.String({
      pattern: "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)$",
    }),
  }, { additionalProperties: false }),
]);

export type WorkflowType = Static<typeof WorkflowTypeSchema>;
export type WorkflowSubjectType = Static<typeof WorkflowSubjectTypeSchema>;
export type WorkflowCapabilityRequirement = Static<typeof WorkflowCapabilityRequirementSchema>;
export type WorkflowTypeEntitlementResult = Static<typeof WorkflowTypeEntitlementResultSchema>;

export type WorkflowCapabilityProfile = {
  allowedEntryEventTypes: readonly WorkflowEntryEventType[];
  allowedNodeKinds: readonly WorkflowNodeKind[];
  availability: "enabled" | "reserved";
  subjectType: WorkflowSubjectType;
  variableCatalog: readonly string[];
  workflowType: WorkflowType;
};

const SHARED_WORKFLOW_VARIABLE_CATALOG = [
  "subject.id",
  "trigger.eventType",
  "trigger.occurredAt",
] as const;

const CHATAI_WORKFLOW_VARIABLE_CATALOG = [
  ...SHARED_WORKFLOW_VARIABLE_CATALOG,
  "trigger.projection.workUserId",
  "trigger.projection.seatId",
  "trigger.projection.externalUserId",
  "trigger.projection.thirdExternalUserId",
  "trigger.projection.tagId",
  "trigger.projection.messageId",
] as const;

const WECOM_WORKFLOW_VARIABLE_CATALOG = [
  ...SHARED_WORKFLOW_VARIABLE_CATALOG,
  "trigger.projection.workUserId",
  "trigger.projection.externalUserId",
  "trigger.projection.tagId",
] as const;

const CHATAI_NODE_KINDS = [
  "start",
  "wait",
  "wait-event",
  "branch",
  "message",
  "message-query",
  "handoff",
  "agent",
  "llm",
  "ai-collect",
  "ai-intent",
  "order-query",
  "tag-query",
  "tag",
  "customer-update",
  "coupon",
  "end",
] as const satisfies readonly WorkflowNodeKind[];

const WECOM_NODE_KINDS = [
  "start",
  "wait",
  "branch",
  "llm",
  "order-query",
  "tag-query",
  "tag",
  "customer-update",
  "coupon",
  "end",
] as const satisfies readonly WorkflowNodeKind[];

export const WORKFLOW_CAPABILITY_PROFILES = {
  chatai_sop: {
    allowedEntryEventTypes: [
      "message.received",
      "contact.friend_added",
      "contact.tag_added",
    ],
    allowedNodeKinds: CHATAI_NODE_KINDS,
    availability: "enabled",
    subjectType: "chatai_contact",
    variableCatalog: CHATAI_WORKFLOW_VARIABLE_CATALOG,
    workflowType: "chatai_sop",
  },
  member_sop: {
    allowedEntryEventTypes: [],
    allowedNodeKinds: [],
    availability: "reserved",
    subjectType: "miniapp_member",
    variableCatalog: [],
    workflowType: "member_sop",
  },
  wecom_sop: {
    allowedEntryEventTypes: [
      "contact.friend_added",
      "contact.tag_added",
    ],
    allowedNodeKinds: WECOM_NODE_KINDS,
    availability: "enabled",
    subjectType: "wecom_contact",
    variableCatalog: WECOM_WORKFLOW_VARIABLE_CATALOG,
    workflowType: "wecom_sop",
  },
} as const satisfies Record<WorkflowType, WorkflowCapabilityProfile>;

export function getWorkflowCapabilityProfile(
  workflowType: WorkflowType,
): WorkflowCapabilityProfile {
  return WORKFLOW_CAPABILITY_PROFILES[workflowType];
}

export function getEnabledWorkflowTypes(): WorkflowType[] {
  return Object.values(WORKFLOW_CAPABILITY_PROFILES)
    .filter((profile) => profile.availability === "enabled")
    .map((profile) => profile.workflowType);
}
