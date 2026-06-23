import { Type, type Static } from "@sinclair/typebox";

export const KbDocParseModeSchema = Type.Union([
  Type.Literal("standard"),
  Type.Literal("enhanced"),
]);

export const KbDocChunkStrategySchema = Type.Union([
  Type.Literal("length"),
  Type.Literal("separator"),
]);

export const KbDocChunkParamsSchema = Type.Union([
  Type.Object({
    maxLength: Type.Union([
      Type.Literal(500),
      Type.Literal(1000),
      Type.Literal(2000),
    ]),
    strategy: Type.Literal("length"),
  }),
  Type.Object({
    separator: Type.Literal("newline"),
    strategy: Type.Literal("separator"),
  }),
]);

export const KbDocCreateRequestSchema = Type.Object({
  chunkParams: KbDocChunkParamsSchema,
  chunkStrategy: KbDocChunkStrategySchema,
  description: Type.Optional(Type.String()),
  docSuffix: Type.String({ minLength: 1 }),
  docUrl: Type.String({ minLength: 1 }),
  kbId: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  parseMode: KbDocParseModeSchema,
});

export const KbDocCreateResponseSchema = Type.Object({
  docId: Type.String(),
});

export const KbDocUploadCredentialResponseSchema = Type.Object({
  mocked: Type.Literal(true),
  requestId: Type.String(),
});

export type KbDocParseMode = Static<typeof KbDocParseModeSchema>;
export type KbDocChunkStrategy = Static<typeof KbDocChunkStrategySchema>;
export type KbDocChunkParams = Static<typeof KbDocChunkParamsSchema>;
export type KbDocCreateRequest = Static<typeof KbDocCreateRequestSchema>;
export type KbDocCreateResponse = Static<typeof KbDocCreateResponseSchema>;
export type KbDocUploadCredentialResponse = Static<
  typeof KbDocUploadCredentialResponseSchema
>;
