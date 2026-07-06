import { Type, type Static } from "@sinclair/typebox";

export const KbAttachmentTypeSchema = Type.Union([
  Type.Literal(1),
  Type.Literal(2),
  Type.Literal(3),
  Type.Literal(4),
  Type.Literal(5),
]);

export const KbAttachmentContentSchema = Type.Object({
  content: Type.Record(Type.String(), Type.Unknown()),
  materialCollectionId: Type.Optional(Type.String()),
  msgInfoId: Type.Optional(Type.String()),
  msgid: Type.Optional(Type.String()),
  type: Type.Union([
    Type.Literal("image"),
    Type.Literal("file"),
    Type.Literal("h5"),
    Type.Literal("weapp"),
  ]),
});

export const KbAttachmentInitResponseSchema = Type.Object(
  {
    docId: Type.String(),
    initialized: Type.Boolean(),
    status: Type.Union([
      Type.Literal("queued"),
      Type.Literal("parsing"),
      Type.Literal("completed"),
      Type.Literal("failed"),
    ]),
  },
  { additionalProperties: false },
);

export const KbAttachmentListItemSchema = Type.Object({
  attachmentContent: KbAttachmentContentSchema,
  attachmentType: KbAttachmentTypeSchema,
  chunkId: Type.String(),
  createdAt: Type.String(),
  description: Type.String(),
  fileSizeLabel: Type.Optional(Type.String()),
  subtitle: Type.Optional(Type.String()),
  title: Type.String(),
  updatedAt: Type.String(),
});

export const KbAttachmentListResponseSchema = Type.Object(
  {
    attachments: Type.Array(KbAttachmentListItemSchema),
    pagination: Type.Object({
      page: Type.Number(),
      pageSize: Type.Number(),
      total: Type.Number(),
    }),
  },
  { additionalProperties: false },
);

export const KbAttachmentCreateRequestSchema = Type.Object({
  attachmentContent: KbAttachmentContentSchema,
  attachmentType: KbAttachmentTypeSchema,
  description: Type.String({ minLength: 1 }),
  title: Type.Optional(Type.String({ maxLength: 256 })),
});

export const KbAttachmentCreateResponseSchema = Type.Object(
  {
    chunkId: Type.String(),
  },
  { additionalProperties: false },
);

export const KbAttachmentUpdateRequestSchema = Type.Object({
  attachmentContent: Type.Optional(KbAttachmentContentSchema),
  description: Type.String({ minLength: 1 }),
  title: Type.Optional(Type.String({ maxLength: 256 })),
});

export const KbAttachmentUpdateResponseSchema = Type.Object(
  {
    updated: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const KbAttachmentDeleteResponseSchema = Type.Object(
  {
    deleted: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const KbAttachmentBatchDeleteRequestSchema = Type.Object({
  chunkIds: Type.Array(Type.String({ pattern: "^[0-9]+$" }), {
    maxItems: 20,
    minItems: 1,
  }),
});

export const KbAttachmentBatchDeleteResponseSchema = Type.Object(
  {
    failCount: Type.Integer({ minimum: 0 }),
    successCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export type KbAttachmentType = Static<typeof KbAttachmentTypeSchema>;
export type KbAttachmentContent = Static<typeof KbAttachmentContentSchema>;
export type KbAttachmentInitResponse = Static<typeof KbAttachmentInitResponseSchema>;
export type KbAttachmentListItem = Static<typeof KbAttachmentListItemSchema>;
export type KbAttachmentListResponse = Static<typeof KbAttachmentListResponseSchema>;
export type KbAttachmentCreateRequest = Static<typeof KbAttachmentCreateRequestSchema>;
export type KbAttachmentCreateResponse = Static<typeof KbAttachmentCreateResponseSchema>;
export type KbAttachmentUpdateRequest = Static<typeof KbAttachmentUpdateRequestSchema>;
export type KbAttachmentUpdateResponse = Static<typeof KbAttachmentUpdateResponseSchema>;
export type KbAttachmentDeleteResponse = Static<typeof KbAttachmentDeleteResponseSchema>;
export type KbAttachmentBatchDeleteRequest = Static<typeof KbAttachmentBatchDeleteRequestSchema>;
export type KbAttachmentBatchDeleteResponse = Static<typeof KbAttachmentBatchDeleteResponseSchema>;
