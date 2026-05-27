import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectVoiceFormat } from "../src/shared/media-sniff.js";
import { transcodeVoiceToWav } from "../src/shared/transcode.js";

describe("voice transcoding", () => {
  it("transcodes Tencent SILK_V3 data to wav", async () => {
    const silk = await readFile(samplePath());
    expect(detectVoiceFormat(silk)).toMatchObject({
      format: "silk-v3",
      headerOffset: 1,
    });

    const result = await transcodeVoiceToWav(silk, {
      maxBytes: 1024 * 1024,
      maxDurationMs: 60_000,
      sampleRate: 16000,
    });

    expect(result.format).toBe("silk-v3");
    expect(result.durationMs).toBeGreaterThan(2000);
    expect(result.durationMs).toBeLessThan(3000);
    expect(text(result.wav, 0, 4)).toBe("RIFF");
    expect(text(result.wav, 8, 4)).toBe("WAVE");
    expect(result.contentType).toBe("audio/wav");
  });

  it("rejects unknown voice data", async () => {
    await expect(
      transcodeVoiceToWav(new Uint8Array([1, 2, 3]), {
        maxBytes: 1024,
        maxDurationMs: 60_000,
        sampleRate: 16000,
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_VOICE_FORMAT",
    });
  });

  it("rejects oversized voice data before decoding", async () => {
    await expect(
      transcodeVoiceToWav(new Uint8Array(11), {
        maxBytes: 10,
        maxDurationMs: 60_000,
        sampleRate: 16000,
      }),
    ).rejects.toMatchObject({
      code: "VOICE_FILE_TOO_LARGE",
    });
  });

  it("rejects voice data over the configured duration", async () => {
    const silk = await readFile(samplePath());

    await expect(
      transcodeVoiceToWav(silk, {
        maxBytes: 1024 * 1024,
        maxDurationMs: 100,
        sampleRate: 16000,
      }),
    ).rejects.toMatchObject({
      code: "VOICE_DURATION_TOO_LONG",
    });
  });
});

function samplePath() {
  return join(
    import.meta.dirname,
    "fixtures",
    "tencent-silk.amr",
  );
}

function text(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder().decode(bytes.slice(start, start + length));
}
