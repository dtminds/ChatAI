import { RequestNormalizedError } from "@/lib/request";

const DEFAULT_MESSAGE = "转文字失败，请稍后重试";

export function resolveVoiceTranscriptionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "EMPTY_TRANSCRIPTION") {
    return "语音识别结果为空";
  }

  const message = readErrorMessage(error)?.trim();
  const code = readErrorCode(error);

  if (message && containsChineseText(message)) {
    return message;
  }

  if (message && isTransportFailureMessage(message)) {
    return "网络异常，请稍后重试";
  }

  if (message && !isGenericRequestMessage(message)) {
    return message;
  }

  if (code) {
    return `转文字失败：${code}`;
  }

  return DEFAULT_MESSAGE;
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    return typeof message === "string" ? message : undefined;
  }

  return undefined;
}

function readErrorCode(error: unknown) {
  if (error instanceof RequestNormalizedError && error.code) {
    return error.code;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;

    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function containsChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function isTransportFailureMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("cors")
    || normalized.includes("network error")
    || normalized.includes("network")
    || normalized.includes("timeout")
    || normalized.includes("failed to fetch")
    || normalized.includes("econnaborted")
  );
}

function isGenericRequestMessage(message: string) {
  return message === "Request failed" || message === "Unknown request error";
}
