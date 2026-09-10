import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_USAGE_STRING_LENGTH = 255;
const UsageKeySchema = Type.String({ minLength: 1, maxLength: MAX_USAGE_STRING_LENGTH });
const AI_USAGE_UTC_INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.\d{1,9})?Z$/;
const UtcInstantSchema = Type.String({
  pattern: AI_USAGE_UTC_INSTANT_PATTERN.source,
});

export const AiUsageCapabilitySchema = Type.Union([
  Type.Literal("ai_reply"),
  Type.Literal("conversation_insight"),
  Type.Literal("user_memory"),
  Type.Literal("workflow_intent"),
  Type.Literal("workflow_llm"),
  Type.Literal("workflow_ai_collect"),
]);
export type AiUsageCapability = Static<typeof AiUsageCapabilitySchema>;

export const AiUsageModelSchema = Type.Object({
  creditMultiplier: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
  model: Type.String({ minLength: 1, maxLength: MAX_USAGE_STRING_LENGTH }),
  modelId: Type.Union([
    Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
    Type.Null(),
  ]),
}, { additionalProperties: false });
export type AiUsageModel = Static<typeof AiUsageModelSchema>;

export const AiUsageModelTokenSchema = Type.Object({
  inputTokens: Type.Integer({ minimum: 0, maximum: MAX_SAFE_INTEGER }),
  model: Type.String({ minLength: 1, maxLength: MAX_USAGE_STRING_LENGTH }),
  modelId: Type.Union([
    Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
    Type.Null(),
  ]),
  outputTokens: Type.Integer({ minimum: 0, maximum: MAX_SAFE_INTEGER }),
  provider: Type.String({ minLength: 1, maxLength: 64 }),
  requestCount: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
}, { additionalProperties: false });
export type AiUsageModelToken = Static<typeof AiUsageModelTokenSchema>;

export const AiUsageBusinessSnapshotSchema = Type.Record(
  Type.String({ pattern: "^[A-Za-z][A-Za-z0-9_]{0,63}$" }),
  Type.Union([
    Type.Boolean(),
    Type.Integer({ minimum: 0, maximum: MAX_SAFE_INTEGER }),
    Type.String({ maxLength: MAX_USAGE_STRING_LENGTH }),
    Type.Null(),
  ]),
  { minProperties: 1, maxProperties: 16 },
);
export type AiUsageBusinessSnapshot = Static<typeof AiUsageBusinessSnapshotSchema>;

const commonEventProperties = {
  billingKey: UsageKeySchema,
  billingModel: AiUsageModelSchema,
  businessSnapshot: AiUsageBusinessSnapshotSchema,
  eventKey: UsageKeySchema,
  modelUsages: Type.Array(AiUsageModelTokenSchema, { minItems: 1, maxItems: 32 }),
  occurredAt: UtcInstantSchema,
  schemaVersion: Type.Literal(1),
  uid: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
};

function eventSchema<Capability extends AiUsageCapability, BusinessType extends string>(
  capability: Capability,
  businessType: BusinessType,
) {
  return Type.Object({
    ...commonEventProperties,
    businessId: UsageKeySchema,
    businessType: Type.Literal(businessType),
    capability: Type.Literal(capability),
  }, { additionalProperties: false });
}

export const AiUsageEventSchema = Type.Union([
  eventSchema("ai_reply", "agent_reply"),
  eventSchema("conversation_insight", "logical_session"),
  eventSchema("user_memory", "user_memory_run_item"),
  eventSchema("workflow_intent", "workflow_node_execution"),
  eventSchema("workflow_llm", "workflow_node_execution"),
  eventSchema("workflow_ai_collect", "workflow_node_execution"),
]);
export type AiUsageEvent = Static<typeof AiUsageEventSchema>;

export function isAiUsageEvent(value: unknown): value is AiUsageEvent {
  if (!Value.Check(AiUsageEventSchema, value)) return false;
  return normalizeAiUsageUtcInstant(value.occurredAt) === value.occurredAt;
}

export function normalizeAiUsageUtcInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = AI_USAGE_UTC_INSTANT_PATTERN.exec(value);
  if (!match) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const normalized = parsed.toISOString();
  return normalized.slice(0, 19) === match[1] ? normalized : null;
}

export const AiUsageBatchReportRequestSchema = Type.Object({
  events: Type.Array(AiUsageEventSchema, { minItems: 1, maxItems: 100 }),
}, { additionalProperties: false });
export type AiUsageBatchReportRequest = Static<typeof AiUsageBatchReportRequestSchema>;

export const AiUsageBatchReportResultSchema = Type.Union([
  Type.Object({
    eventKey: UsageKeySchema,
    status: Type.Literal("accepted"),
    uid: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
  }, { additionalProperties: false }),
  Type.Object({
    eventKey: UsageKeySchema,
    status: Type.Literal("duplicate"),
    uid: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
  }, { additionalProperties: false }),
  Type.Object({
    errorCode: Type.String({ minLength: 1, maxLength: 128 }),
    errorMessage: Type.String({ minLength: 1, maxLength: 512 }),
    eventKey: UsageKeySchema,
    status: Type.Literal("rejected"),
    uid: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
  }, { additionalProperties: false }),
]);
export type AiUsageBatchReportResult = Static<typeof AiUsageBatchReportResultSchema>;

export const AiUsageBatchReportResponseSchema = Type.Object({
  results: Type.Array(AiUsageBatchReportResultSchema, { minItems: 1, maxItems: 100 }),
}, { additionalProperties: false });
export type AiUsageBatchReportResponse = Static<typeof AiUsageBatchReportResponseSchema>;

export const AiUsageBillingPeriodSchema = Type.Object({
  endAt: UtcInstantSchema,
  startAt: UtcInstantSchema,
}, { additionalProperties: false });
export type AiUsageBillingPeriod = Static<typeof AiUsageBillingPeriodSchema>;

const CreditAmountSchema = Type.String({ pattern: "^\\d+\\.\\d{6}$" });

export const AiUsageBillingSummaryQuerySchema = Type.Object({
  endAt: UtcInstantSchema,
  startAt: UtcInstantSchema,
  uid: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
}, { additionalProperties: false });
export type AiUsageBillingSummaryQuery = Static<typeof AiUsageBillingSummaryQuerySchema>;

export const AiUsageBillingSummaryItemSchema = Type.Object({
  accruedCredits: CreditAmountSchema,
  capability: AiUsageCapabilitySchema,
  deductedCredits: CreditAmountSchema,
  usageCount: Type.Integer({ minimum: 0, maximum: MAX_SAFE_INTEGER }),
  waivedCredits: CreditAmountSchema,
}, { additionalProperties: false });
export type AiUsageBillingSummaryItem = Static<typeof AiUsageBillingSummaryItemSchema>;

export const AiUsageBillingSummaryResponseSchema = Type.Object({
  accruedCredits: CreditAmountSchema,
  deductedCredits: CreditAmountSchema,
  items: Type.Array(AiUsageBillingSummaryItemSchema),
  period: AiUsageBillingPeriodSchema,
  waivedCredits: CreditAmountSchema,
}, { additionalProperties: false });
export type AiUsageBillingSummaryResponse = Static<typeof AiUsageBillingSummaryResponseSchema>;

export const AiUsageBillingDetailQuerySchema = Type.Object({
  capability: Type.Optional(AiUsageCapabilitySchema),
  cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  endAt: UtcInstantSchema,
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  startAt: UtcInstantSchema,
  uid: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
}, { additionalProperties: false });
export type AiUsageBillingDetailQuery = Static<typeof AiUsageBillingDetailQuerySchema>;

export const AiUsageBillingDetailItemSchema = Type.Object({
  accruedCredits: CreditAmountSchema,
  baseCredits: CreditAmountSchema,
  billingKey: UsageKeySchema,
  businessId: UsageKeySchema,
  businessType: Type.String({ minLength: 1, maxLength: 64 }),
  capability: AiUsageCapabilitySchema,
  creditMultiplier: Type.Integer({ minimum: 1, maximum: MAX_SAFE_INTEGER }),
  deductedCredits: CreditAmountSchema,
  eventKey: UsageKeySchema,
  model: Type.String({ minLength: 1, maxLength: MAX_USAGE_STRING_LENGTH }),
  occurredAt: UtcInstantSchema,
  priceVersion: Type.String({ minLength: 1, maxLength: 64 }),
  waivedCredits: CreditAmountSchema,
  waiverReason: Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Null()]),
}, { additionalProperties: false });
export type AiUsageBillingDetailItem = Static<typeof AiUsageBillingDetailItemSchema>;

export const AiUsageBillingDetailResponseSchema = Type.Object({
  items: Type.Array(AiUsageBillingDetailItemSchema, { maxItems: 100 }),
  nextCursor: Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()]),
}, { additionalProperties: false });
export type AiUsageBillingDetailResponse = Static<typeof AiUsageBillingDetailResponseSchema>;
