import { Type, type Static } from "@sinclair/typebox";

export const KB_SEARCH_QUERY_MAX_LENGTH = 32;

export const KbDocTypeSchema = Type.Union([
  Type.Literal("qa"),
  Type.Literal("document"),
  Type.Literal("image"),
  Type.Literal("attachment"),
]);

export const KbDocStatusSchema = Type.Union([
  Type.Literal("completed"),
  Type.Literal("parsing"),
  Type.Literal("failed"),
  Type.Literal("queued"),
]);

export const KbChunkTypeSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("faq"),
  Type.Literal("image"),
]);

export const KbChunkSourceSchema = Type.Union([
  Type.Literal("manual"),
  Type.Literal("system"),
  Type.Literal("sidebar"),
]);

export const KbCreateRequestSchema = Type.Object({
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  name: Type.String({ minLength: 1, maxLength: 30 }),
});

export const KbCreateResponseSchema = Type.Object(
  {
    kbId: Type.String(),
  },
  { additionalProperties: false },
);

export const KbListItemSchema = Type.Object({
  createdAt: Type.String(),
  description: Type.String(),
  kbId: Type.String(),
  name: Type.String(),
  updatedAt: Type.String(),
});

export const KbListResponseSchema = Type.Object(
  {
    kbs: Type.Array(KbListItemSchema),
    pagination: Type.Object({
      page: Type.Number(),
      pageSize: Type.Number(),
      total: Type.Number(),
    }),
  },
  { additionalProperties: false },
);

export const KbDocListItemSchema = Type.Object({
  briefSummary: Type.Optional(Type.String()),
  createdAt: Type.String(),
  description: Type.Optional(Type.String()),
  docId: Type.String(),
  docSize: Type.Number({ minimum: 0 }),
  docSuffix: Type.String(),
  hasDocSummary: Type.Boolean(),
  docType: KbDocTypeSchema,
  kbId: Type.String(),
  name: Type.String(),
  sliceCount: Type.Union([Type.Number(), Type.Null()]),
  status: KbDocStatusSchema,
  statusMessage: Type.Optional(Type.String()),
  updatedAt: Type.String(),
});

export const KbDocDetailSchema = Type.Intersect([
  KbDocListItemSchema,
  Type.Object({
    docSummary: Type.Optional(Type.String()),
    previewImageUrl: Type.Optional(Type.String()),
    volcDocId: Type.Optional(Type.String()),
  }),
]);

export const KbDocListResponseSchema = Type.Object(
  {
    docs: Type.Array(KbDocListItemSchema),
    pagination: Type.Object({
      page: Type.Number(),
      pageSize: Type.Number(),
      total: Type.Number(),
    }),
  },
  { additionalProperties: false },
);

export const KbChunkListItemSchema = Type.Object({
  chunkId: Type.String(),
  chunkType: KbChunkTypeSchema,
  content: Type.String(),
  createdAt: Type.String(),
  description: Type.Optional(Type.String()),
  docId: Type.String(),
  imageUrls: Type.Optional(Type.Array(Type.String())),
  kbId: Type.String(),
  source: KbChunkSourceSchema,
  title: Type.Optional(Type.String()),
  updatedAt: Type.String(),
  volcChunkId: Type.Optional(Type.String()),
});

export const KbChunkListResponseSchema = Type.Object({
  chunks: Type.Array(KbChunkListItemSchema),
  pagination: Type.Object({
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
  }),
});

export type KbCreateRequest = Static<typeof KbCreateRequestSchema>;
export type KbCreateResponse = Static<typeof KbCreateResponseSchema>;
export type KbDocType = Static<typeof KbDocTypeSchema>;
export type KbDocStatus = Static<typeof KbDocStatusSchema>;
export type KbChunkType = Static<typeof KbChunkTypeSchema>;
export type KbChunkSource = Static<typeof KbChunkSourceSchema>;
export type KbListItem = Static<typeof KbListItemSchema>;
export type KbListResponse = Static<typeof KbListResponseSchema>;
export type KbDocListItem = Static<typeof KbDocListItemSchema>;
export type KbDocDetail = Static<typeof KbDocDetailSchema>;
export type KbDocListResponse = Static<typeof KbDocListResponseSchema>;
export type KbChunkListItem = Static<typeof KbChunkListItemSchema>;
export type KbChunkListResponse = Static<typeof KbChunkListResponseSchema>;
