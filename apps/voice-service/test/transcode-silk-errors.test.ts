import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decode: vi.fn(),
  getDuration: vi.fn(),
}));

vi.mock("silk-wasm", () => ({
  decode: mocks.decode,
  getDuration: mocks.getDuration,
}));

describe("SILK transcoding failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps SILK duration read failures in a transcode error", async () => {
    const { transcodeVoiceToWav } = await import("../src/shared/transcode.js");

    mocks.getDuration.mockImplementation(() => {
      throw new Error("bad silk frame");
    });

    await expect(
      transcodeVoiceToWav(new TextEncoder().encode("#!SILK_V3broken"), {
        maxBytes: 1024,
        maxDurationMs: 60_000,
        sampleRate: 16000,
      }),
    ).rejects.toMatchObject({
      code: "DECODE_FAILED",
      cause: expect.any(Error),
      message: "音频解码失败",
    });
  });
});
