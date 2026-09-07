import {
  MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE,
  MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE,
} from "@/pages/chat/api/media-upload-errors";

export type SendFailureReason =
  | "file-upload"
  | "image-upload"
  | "send"
  | "unavailable";

export function getOversizedComposerFileDialogCopy() {
  return {
    description: "请选择不超过 10 MB 的文件",
    title: "文件过大，无法发送",
  };
}

export function getSendFailureDialogCopy(
  reason: SendFailureReason,
  errorCode: string,
  errorMessage?: string,
) {
  const description = resolveSendFailureDescription(reason, errorCode, errorMessage);

  if (
    (reason === "file-upload" || reason === "image-upload") &&
    errorCode === MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE
  ) {
    return {
      title: MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE,
      description: undefined,
    };
  }

  if (reason === "file-upload") {
    return {
      title: "文件上传失败，请稍后重试",
      description,
    };
  }

  if (reason === "image-upload") {
    return {
      title: "图片上传失败，请稍后重试",
      description,
    };
  }

  if (reason === "unavailable") {
    return {
      title: "当前无法发送消息，请稍后重试",
      description,
    };
  }

  return {
    title: "发送失败，请稍后重试",
    description,
  };
}

function resolveSendFailureDescription(
  reason: SendFailureReason,
  errorCode: string,
  errorMessage?: string,
) {
  const message = errorMessage?.trim();

  if (reason === "file-upload" || reason === "image-upload") {
    if (message && containsChineseText(message)) {
      return message;
    }

    return undefined;
  }

  if (message && containsChineseText(message)) {
    return message;
  }

  if (message && isTransportFailureMessage(message)) {
    return "网络异常，请稍后重试";
  }

  return `错误码：${errorCode}`;
}

function containsChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function isTransportFailureMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("cors") ||
    normalized.includes("network error") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("failed to fetch")
  );
}
