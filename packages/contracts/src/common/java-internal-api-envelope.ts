export type JavaInternalApiEnvelope<TData = unknown> = {
  data?: TData;
  error: number;
  errorMsg: string;
  success: boolean;
};

export type JavaInternalApiEnvelopeDecodeResult =
  | { data: unknown; kind: "success" }
  | { error: number; errorMsg: string; kind: "rejected" }
  | { kind: "invalid"; reason: string };

export function decodeJavaInternalApiEnvelope(
  value: unknown,
): JavaInternalApiEnvelopeDecodeResult {
  if (!isRecord(value)) {
    return { kind: "invalid", reason: "envelope must be an object" };
  }
  if (typeof value.success !== "boolean") {
    return { kind: "invalid", reason: "success must be a boolean" };
  }
  if (typeof value.error !== "number" || !Number.isSafeInteger(value.error)) {
    return { kind: "invalid", reason: "error must be a safe integer" };
  }
  if (typeof value.errorMsg !== "string") {
    return { kind: "invalid", reason: "errorMsg must be a string" };
  }
  if (value.success) {
    return { data: value.data, kind: "success" };
  }
  return {
    error: value.error,
    errorMsg: value.errorMsg,
    kind: "rejected",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
