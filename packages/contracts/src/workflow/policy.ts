import { Type, type Static } from "@sinclair/typebox";
import type { WorkflowNodeKind } from "./dto.js";
import type { WorkflowEntryEventType } from "./trigger.js";

export const WORKFLOW_ACTIVE_DEFINITION_LIMIT = 50;

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
  "trigger.occurredAt",
] as const;

const CHATAI_WORKFLOW_VARIABLE_CATALOG = [
  ...SHARED_WORKFLOW_VARIABLE_CATALOG,
  "trigger.projection.workUserId",
  "trigger.projection.seatId",
  "trigger.projection.externalUserId",
] as const;

const WECOM_WORKFLOW_VARIABLE_CATALOG = [
  ...SHARED_WORKFLOW_VARIABLE_CATALOG,
  "trigger.projection.workUserId",
  "trigger.projection.externalUserId",
] as const;

const CHATAI_NODE_KINDS = [
  "start",
  "wait",
  "wait-event",
  "branch",
  "ratio-split",
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
  "order-bind",
  "coupon",
  "end",
] as const satisfies readonly WorkflowNodeKind[];

const WECOM_NODE_KINDS = [
  "start",
  "wait",
  "branch",
  "ratio-split",
  "llm",
  "order-query",
  "tag-query",
  "tag",
  "customer-update",
  "order-bind",
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

export function getWorkflowGuaranteedVariableCatalog(
  workflowType: WorkflowType,
  eventTypes: readonly WorkflowEntryEventType[],
) {
  const shared = new Set<string>(SHARED_WORKFLOW_VARIABLE_CATALOG);
  if (eventTypes.length === 0) return [...shared];
  const eventCatalogs = eventTypes.map(eventType =>
    new Set<string>(getWorkflowEntryEventVariableCatalog(workflowType, eventType)));
  return getWorkflowCapabilityProfile(workflowType).variableCatalog.filter(variable =>
    shared.has(variable) || eventCatalogs.every(catalog => catalog.has(variable)));
}

export function getEnabledWorkflowTypes(): WorkflowType[] {
  return Object.values(WORKFLOW_CAPABILITY_PROFILES)
    .filter((profile) => profile.availability === "enabled")
    .map((profile) => profile.workflowType);
}

function getWorkflowEntryEventVariableCatalog(
  workflowType: WorkflowType,
  eventType: WorkflowEntryEventType,
) {
  const shared = [...SHARED_WORKFLOW_VARIABLE_CATALOG];
  if (workflowType === "wecom_sop") {
    if (eventType === "contact.friend_added") {
      return [
        ...shared,
        "trigger.projection.workUserId",
        "trigger.projection.externalUserId",
      ];
    }
    if (eventType === "contact.tag_added") {
      return [
        ...shared,
        "trigger.projection.workUserId",
        "trigger.projection.externalUserId",
      ];
    }
    return shared;
  }
  if (workflowType === "chatai_sop") {
    const contactIdentity = [
      "trigger.projection.workUserId",
      "trigger.projection.seatId",
    ];
    if (eventType === "contact.friend_added") {
      return [...shared, ...contactIdentity, "trigger.projection.externalUserId"];
    }
    if (eventType === "contact.tag_added") {
      return [
        ...shared,
        ...contactIdentity,
        "trigger.projection.externalUserId",
      ];
    }
    if (eventType === "message.received") {
      return [...shared, ...contactIdentity];
    }
  }
  return shared;
}
