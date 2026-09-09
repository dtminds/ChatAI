import { describe, expect, it } from "vitest";
import { MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE } from "@/pages/chat/api/media-upload-errors";
import {
  getOversizedComposerFileDialogCopy,
  getSendFailureDialogCopy,
} from "@/pages/chat/lib/send-failure-dialog-copy";

describe("getSendFailureDialogCopy", () => {
  it("prefers a Chinese API message over the error code when send fails", () => {
    expect(
      getSendFailureDialogCopy(
        "send",
        "SEAT_NOT_TAKEN_OVER",
        "当前账号尚未由你接管，无法发送消息",
      ),
    ).toEqual({
      description: "当前账号尚未由你接管，无法发送消息",
      title: "发送失败，请稍后重试",
    });
  });

  it("falls back to the error code when send fails without an API message", () => {
    expect(getSendFailureDialogCopy("send", "SEND_RATE_LIMITED")).toEqual({
      description: "错误码：SEND_RATE_LIMITED",
      title: "发送失败，请稍后重试",
    });
  });

  it("maps transport failures to a network retry description", () => {
    expect(
      getSendFailureDialogCopy("send", "NETWORK_ERROR", "Network Error"),
    ).toEqual({
      description: "网络异常，请稍后重试",
      title: "发送失败，请稍后重试",
    });
  });

  it("keeps Chinese upload messages under the matching upload title", () => {
    expect(
      getSendFailureDialogCopy("file-upload", "COS_UPLOAD_FAILED", "COS 上传失败"),
    ).toEqual({
      description: "COS 上传失败",
      title: "文件上传失败，请稍后重试",
    });
  });

  it("uses the SDK load copy when the upload chunk cannot load", () => {
    expect(
      getSendFailureDialogCopy(
        "image-upload",
        "MEDIA_UPLOAD_SDK_LOAD_FAILED",
        "ignored",
      ),
    ).toEqual({
      description: undefined,
      title: MEDIA_UPLOAD_SDK_LOAD_FAILED_MESSAGE,
    });
  });

  it("uses the unavailable title when sending is blocked", () => {
    expect(getSendFailureDialogCopy("unavailable", "UNAVAILABLE")).toEqual({
      description: "错误码：UNAVAILABLE",
      title: "当前无法发送消息，请稍后重试",
    });
  });

  it("uses the oversized file dialog copy", () => {
    expect(getOversizedComposerFileDialogCopy()).toEqual({
      description: "请选择不超过 10 MB 的文件",
      title: "文件过大，无法发送",
    });
  });
});
