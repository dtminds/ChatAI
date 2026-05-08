import { Type, type Static } from "@sinclair/typebox";

export const ApiErrorSchema = Type.Object({
  code: Type.String(),
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  message: Type.String(),
});

export const ApiErrorEnvelopeSchema = Type.Object({
  error: ApiErrorSchema,
  success: Type.Literal(false),
});

export function ApiSuccessEnvelopeSchema<TSchema extends ReturnType<typeof Type.Any>>(
  dataSchema: TSchema,
) {
  return Type.Object({
    data: dataSchema,
    success: Type.Literal(true),
  });
}

export type ApiError = Static<typeof ApiErrorSchema>;
export type ApiErrorEnvelope = Static<typeof ApiErrorEnvelopeSchema>;

export type ApiSuccessEnvelope<TData> = {
  data: TData;
  success: true;
};

export type ApiEnvelope<TData> = ApiSuccessEnvelope<TData> | ApiErrorEnvelope;

export function apiSuccess<TData>(data: TData): ApiSuccessEnvelope<TData> {
  return {
    data,
    success: true,
  };
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorEnvelope {
  return {
    error: {
      code,
      ...(details ? { details } : {}),
      message,
    },
    success: false,
  };
}
