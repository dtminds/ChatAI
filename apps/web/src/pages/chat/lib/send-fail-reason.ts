export const SEND_FAILURE_FALLBACK_REASON = "发送失败";

export function resolveSendFailureTooltip(failReason?: string) {
  const text = failReason?.trim();
  return text || SEND_FAILURE_FALLBACK_REASON;
}
