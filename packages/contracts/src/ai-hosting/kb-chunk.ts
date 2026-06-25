import { Type, type Static } from "@sinclair/typebox";

export const KbChunkWritableTypeSchema = Type.Union([
  Type.Literal("text"),
  Type.Literal("faq"),
]);

export const KbChunkCreateRequestSchema = Type.Object({
  chunkType: KbChunkWritableTypeSchema,
  content: Type.String({ minLength: 1 }),
  docId: Type.String({ minLength: 1 }),
  title: Type.Optional(Type.String({ maxLength: 256 })),
});

export const KbChunkCreateResponseSchema = Type.Object({
  chunkId: Type.String(),
});

export const KbChunkUpdateRequestSchema = Type.Object({
  content: Type.String({ minLength: 1 }),
  title: Type.Optional(Type.String({ maxLength: 256 })),
});

export const KbChunkUpdateResponseSchema = Type.Object({
  updated: Type.Boolean(),
});

export const KbChunkDeleteResponseSchema = Type.Object({
  deleted: Type.Boolean(),
});

export type KbChunkWritableType = Static<typeof KbChunkWritableTypeSchema>;
export type KbChunkCreateRequest = Static<typeof KbChunkCreateRequestSchema>;
export type KbChunkCreateResponse = Static<typeof KbChunkCreateResponseSchema>;
export type KbChunkUpdateRequest = Static<typeof KbChunkUpdateRequestSchema>;
export type KbChunkUpdateResponse = Static<typeof KbChunkUpdateResponseSchema>;
export type KbChunkDeleteResponse = Static<typeof KbChunkDeleteResponseSchema>;
