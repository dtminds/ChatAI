import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { transcodeVoiceToWav } from "../src/shared/transcode.js";

describe("amr transcoding", () => {
  it("transcodes AMR-NB files to wav", async () => {
    const amr = await readFile(samplePath());
    const result = await transcodeVoiceToWav(amr, {
      maxBytes: 1024 * 1024,
      maxDurationMs: 120_000,
      sampleRate: 16000,
    });

    expect(result.format).toBe("amr-nb");
    expect(result.contentType).toBe("audio/wav");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.wav.slice(0, 4)).toEqual(new TextEncoder().encode("RIFF"));
  });

  it("rejects AMR files over the configured duration", async () => {
    const amr = await readFile(samplePath());

    await expect(
      transcodeVoiceToWav(amr, {
        maxBytes: 1024 * 1024,
        maxDurationMs: 1,
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
    "amr-nb.amr",
  );
}
