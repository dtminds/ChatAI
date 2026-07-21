import { Type, type Static } from "@sinclair/typebox";

const KB_DOC_MB = 1024 * 1024;

export const KB_DOC_FILE_SIZE_LIMIT_10_MB = 10 * KB_DOC_MB;
export const KB_DOC_FILE_SIZE_LIMIT_100_MB = 100 * KB_DOC_MB;
export const KB_DOC_FILE_SIZE_LIMIT_200_MB = 200 * KB_DOC_MB;

export const KB_DOC_FALLBACK_FILE_SIZE_LIMIT = KB_DOC_FILE_SIZE_LIMIT_10_MB;

const KB_DOC_FILE_SIZE_LIMIT_BY_SUFFIX: Record<string, number> = {
  doc: KB_DOC_FILE_SIZE_LIMIT_200_MB,
  docx: KB_DOC_FILE_SIZE_LIMIT_200_MB,
  "faq.xlsx": KB_DOC_FILE_SIZE_LIMIT_100_MB,
  md: KB_DOC_FILE_SIZE_LIMIT_10_MB,
  pdf: KB_DOC_FILE_SIZE_LIMIT_200_MB,
  ppt: KB_DOC_FILE_SIZE_LIMIT_200_MB,
  pptx: KB_DOC_FILE_SIZE_LIMIT_200_MB,
  txt: KB_DOC_FILE_SIZE_LIMIT_10_MB,
  xlsx: KB_DOC_FILE_SIZE_LIMIT_100_MB,
};

export function getKbDocFileSizeLimit(docSuffix: string) {
  const normalizedSuffix = normalizeKbDocFileSuffix(docSuffix);
  return KB_DOC_FILE_SIZE_LIMIT_BY_SUFFIX[normalizedSuffix] ?? KB_DOC_FALLBACK_FILE_SIZE_LIMIT;
}

export function formatKbDocFileSizeLimit(limit: number) {
  return `${Math.round(limit / KB_DOC_MB)}MB`;
}

function normalizeKbDocFileSuffix(docSuffix: string) {
  return docSuffix.trim().toLowerCase().replace(/^\.+/, "");
}

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
  docSize: Type.Number({ minimum: 0 }),
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
  allowPerfixs: Type.Array(Type.String()),
  bucket: Type.String(),
  credentials: Type.Object({
    sessionToken: Type.String(),
    tmpSecretId: Type.String(),
    tmpSecretKey: Type.String(),
    token: Type.Optional(Type.String()),
  }),
  expiration: Type.String(),
  expiredTime: Type.Number(),
  region: Type.String(),
  requestId: Type.String(),
  startTime: Type.Number(),
});

export type KbDocParseMode = Static<typeof KbDocParseModeSchema>;
export type KbDocChunkStrategy = Static<typeof KbDocChunkStrategySchema>;
export type KbDocChunkParams = Static<typeof KbDocChunkParamsSchema>;
export type KbDocCreateRequest = Static<typeof KbDocCreateRequestSchema>;
export type KbDocCreateResponse = Static<typeof KbDocCreateResponseSchema>;
export type KbDocUploadCredentialResponse = Static<
  typeof KbDocUploadCredentialResponseSchema
>;

export const KbDocCreateFaqRequestSchema = Type.Object({
  description: Type.Optional(Type.String()),
  docSize: Type.Number({ minimum: 0 }),
  docSuffix: Type.String({ minLength: 1 }),
  docUrl: Type.String({ minLength: 1 }),
  kbId: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
});

export const KbDocCreateBlankRequestSchema = Type.Object(
  {
    description: Type.Optional(Type.String({ maxLength: 1000 })),
    kbId: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { additionalProperties: false },
);

export const KbDocCreateImageRequestSchema = Type.Object({
  description: Type.String({ minLength: 1 }),
  docSize: Type.Number({ minimum: 0 }),
  docSuffix: Type.String({ minLength: 1 }),
  docUrl: Type.String({ minLength: 1 }),
  kbId: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
});

export const KbDocDeleteResponseSchema = Type.Object({
  deleted: Type.Boolean(),
});

export const KbDocRetryResponseSchema = Type.Object({
  retried: Type.Boolean(),
});

export type KbDocCreateFaqRequest = Static<typeof KbDocCreateFaqRequestSchema>;
export type KbDocCreateBlankRequest = Static<typeof KbDocCreateBlankRequestSchema>;
export type KbDocCreateImageRequest = Static<typeof KbDocCreateImageRequestSchema>;
export type KbDocDeleteResponse = Static<typeof KbDocDeleteResponseSchema>;
export type KbDocRetryResponse = Static<typeof KbDocRetryResponseSchema>;
