import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  decodeAudio: vi.fn(),
}));

vi.mock("audio-decode", () => ({
  default: mocks.decodeAudio,
}));

describe("AMR audio buffer transcoding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads standard AudioBuffer channel data through getChannelData", async () => {
    const { transcodeVoiceToWav } = await import("../src/shared/transcode.js");
    const getChannelData = vi.fn((channel: number) => (
      channel === 0
        ? new Float32Array([0, 0.5, -0.5])
        : new Float32Array([0.25, -0.25, 0])
    ));

    mocks.decodeAudio.mockResolvedValue({
      getChannelData,
      numberOfChannels: 2,
      sampleRate: 8000,
    });

    const result = await transcodeVoiceToWav(new TextEncoder().encode("#!AMR\nvoice"), {
      maxBytes: 1024,
      maxDurationMs: 60_000,
      sampleRate: 16000,
    });

    expect(getChannelData).toHaveBeenCalledTimes(2);
    expect(getChannelData).toHaveBeenNthCalledWith(1, 0);
    expect(getChannelData).toHaveBeenNthCalledWith(2, 1);
    expect(result.format).toBe("amr-nb");
    expect(result.durationMs).toBe(1);
    expect(new TextDecoder().decode(result.wav.slice(0, 4))).toBe("RIFF");
  });

  it("wraps audio decode failures in a transcode error", async () => {
    const { transcodeVoiceToWav } = await import("../src/shared/transcode.js");

    mocks.decodeAudio.mockRejectedValue(new Error("decode failed"));

    await expect(
      transcodeVoiceToWav(new TextEncoder().encode("#!AMR-WB\nvoice"), {
        maxBytes: 1024,
        maxDurationMs: 60_000,
        sampleRate: 16000,
      }),
    ).rejects.toMatchObject({
      code: "DECODE_FAILED",
      message: "音频解码失败",
    });
  });
});
