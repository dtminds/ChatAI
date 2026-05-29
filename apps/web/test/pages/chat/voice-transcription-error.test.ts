import { describe, expect, it } from "vitest";
import { RequestNormalizedError } from "@/lib/request";
import { resolveVoiceTranscriptionErrorMessage } from "@/pages/chat/lib/voice-transcription-error";

describe("resolveVoiceTranscriptionErrorMessage", () => {
  it("maps empty transcription to a user-facing reason", () => {
    expect(
      resolveVoiceTranscriptionErrorMessage(new Error("EMPTY_TRANSCRIPTION")),
    ).toBe("语音识别结果为空");
  });

  it("returns backend Chinese error messages directly", () => {
    expect(
      resolveVoiceTranscriptionErrorMessage(
        new RequestNormalizedError({
          code: "VOICE_TRANSCRIPTION_UNSUPPORTED",
          message: "当前消息不支持语音转文字",
        }),
      ),
    ).toBe("当前消息不支持语音转文字");
  });

  it("maps transport failures to a retry hint", () => {
    expect(
      resolveVoiceTranscriptionErrorMessage(
        new RequestNormalizedError({
          message: "Network Error",
        }),
      ),
    ).toBe("网络异常，请稍后重试");
  });

  it("falls back to error code when only a generic message is available", () => {
    expect(
      resolveVoiceTranscriptionErrorMessage(
        new RequestNormalizedError({
          code: "VOICE_TRANSCRIPTION_EMPTY",
          message: "Request failed",
        }),
      ),
    ).toBe("转文字失败：VOICE_TRANSCRIPTION_EMPTY");
  });
});
