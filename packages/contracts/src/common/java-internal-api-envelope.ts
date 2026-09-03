export type JavaInternalApiEnvelope<TData = unknown> =
  | {
      data?: TData;
      error?: unknown;
      errorMsg?: unknown;
      success: true;
    }
  | {
      data?: TData;
      error?: unknown;
      errorMsg?: unknown;
      success: false;
    };

export type JavaInternalApiEnvelopeDecodeResult =
  | { kind: "success"; payload: Record<string, unknown> }
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
  if (value.success) {
    const payload = Object.fromEntries(Object.entries(value).filter(([key]) =>
      key !== "success" && key !== "error" && key !== "errorMsg"));
    return { kind: "success", payload };
  }
  return {
    error: typeof value.error === "number" ? value.error : -1,
    errorMsg: typeof value.errorMsg === "string" ? value.errorMsg : "",
    kind: "rejected",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
