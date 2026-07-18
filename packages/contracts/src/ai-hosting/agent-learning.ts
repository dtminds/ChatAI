import { Type, type Static } from "@sinclair/typebox";

export const AiHostingLearningCandidateStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("adopted"),
  Type.Literal("ignored"),
  Type.Literal("filtered"),
]);

const AiHostingLearningCandidatePersonSchema = Type.Object({
  avatar: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
});

export const AiHostingLearningCandidateItemSchema = Type.Object({
  answer: Type.String(),
  createdAt: Type.Optional(Type.Number()),
  id: Type.String(),
  question: Type.String(),
  rationale: Type.String(),
  seat: Type.Optional(AiHostingLearningCandidatePersonSchema),
  status: AiHostingLearningCandidateStatusSchema,
  user: Type.Optional(AiHostingLearningCandidatePersonSchema),
});

export const AiHostingLearningCandidateListResponseSchema = Type.Object(
  {
    candidates: Type.Array(AiHostingLearningCandidateItemSchema),
    pagination: Type.Object({
      page: Type.Number(),
      pageSize: Type.Number(),
      total: Type.Number(),
    }),
  },
  { additionalProperties: false },
);

export const AiHostingLearningCandidateApproveRequestSchema = Type.Object(
  {
    answer: Type.String({ minLength: 1 }),
    question: Type.String({ minLength: 1 }),
    targetDocId: Type.String({ pattern: "^[0-9]+$" }),
    targetKbId: Type.String({ pattern: "^[0-9]+$" }),
  },
  { additionalProperties: false },
);

export const AiHostingLearningCandidateRejectRequestSchema = Type.Object(
  {
    userReason: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { additionalProperties: false },
);

export const AiHostingLearningCandidateIdSchema = Type.String({
  maxLength: 20,
  minLength: 1,
  pattern: "^[0-9]+$",
});

export const AiHostingLearningCandidateBatchApproveRequestSchema = Type.Object(
  {
    ids: Type.Array(AiHostingLearningCandidateIdSchema, { minItems: 1 }),
    targetDocId: Type.String({ pattern: "^[0-9]+$" }),
    targetKbId: Type.String({ pattern: "^[0-9]+$" }),
  },
  { additionalProperties: false },
);

export const AiHostingLearningCandidateBatchRejectRequestSchema = Type.Object(
  {
    ids: Type.Array(AiHostingLearningCandidateIdSchema, { minItems: 1 }),
    userReason: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { additionalProperties: false },
);

export const AiHostingLearningCandidateBatchApproveResponseSchema = Type.Object(
  {
    failDetails: Type.Array(
      Type.Object({
        error: Type.String(),
        id: Type.String(),
      }),
    ),
    successCount: Type.Number(),
  },
  { additionalProperties: false },
);

export const AiHostingLearningCandidateBatchRejectResponseSchema = Type.Object(
  {
    updatedCount: Type.Number(),
  },
  { additionalProperties: false },
);

export const AiHostingLearningCandidateActionResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
  },
  { additionalProperties: false },
);

export type AiHostingLearningCandidateStatus = Static<
  typeof AiHostingLearningCandidateStatusSchema
>;
export type AiHostingLearningCandidateItem = Static<typeof AiHostingLearningCandidateItemSchema>;
export type AiHostingLearningCandidateListResponse = Static<
  typeof AiHostingLearningCandidateListResponseSchema
>;
export type AiHostingLearningCandidateApproveRequest = Static<
  typeof AiHostingLearningCandidateApproveRequestSchema
>;
export type AiHostingLearningCandidateRejectRequest = Static<
  typeof AiHostingLearningCandidateRejectRequestSchema
>;
export type AiHostingLearningCandidateBatchApproveRequest = Static<
  typeof AiHostingLearningCandidateBatchApproveRequestSchema
>;
export type AiHostingLearningCandidateBatchRejectRequest = Static<
  typeof AiHostingLearningCandidateBatchRejectRequestSchema
>;
export type AiHostingLearningCandidateBatchApproveResponse = Static<
  typeof AiHostingLearningCandidateBatchApproveResponseSchema
>;
export type AiHostingLearningCandidateBatchRejectResponse = Static<
  typeof AiHostingLearningCandidateBatchRejectResponseSchema
>;
export type AiHostingLearningCandidateActionResponse = Static<
  typeof AiHostingLearningCandidateActionResponseSchema
>;
