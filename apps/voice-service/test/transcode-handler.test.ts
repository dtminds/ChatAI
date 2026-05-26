import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPlayableObjectKey: vi.fn((key: string, inputPrefix = "s5/voice", outputPrefix = "s5/playable-voice") =>
    key.replace(`${inputPrefix}/`, `${outputPrefix}/`).replace(/\.amr$/i, ".wav"),
  ),
  createCosClientFromEnv: vi.fn(),
  fetchCosObject: vi.fn(),
  putCosObject: vi.fn(),
  readVoiceServiceConfig: vi.fn(),
  transcodeVoiceToWav: vi.fn(),
}));

vi.mock("../src/shared/cos.js", () => ({
  createCosClientFromEnv: mocks.createCosClientFromEnv,
  fetchCosObject: mocks.fetchCosObject,
  putCosObject: mocks.putCosObject,
}));

vi.mock("../src/shared/config.js", () => ({
  readVoiceServiceConfig: mocks.readVoiceServiceConfig,
}));

vi.mock("../src/shared/media-sniff.js", () => ({
  buildPlayableObjectKey: mocks.buildPlayableObjectKey,
  detectVoiceFormat: vi.fn(() => ({ format: "silk-v3", headerOffset: 1 })),
  isAllowedSourceObject: vi.fn((key: string, inputPrefix = "s5/voice") => key.startsWith(`${inputPrefix}/`)),
}));

vi.mock("../src/shared/transcode.js", () => ({
  transcodeVoiceToWav: mocks.transcodeVoiceToWav,
}));

describe("transcode-on-cos-event handler", () => {
  beforeEach(() => {
    mocks.createCosClientFromEnv.mockReturnValue({});
    mocks.fetchCosObject.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]),
      metadata: {},
    });
    mocks.putCosObject.mockResolvedValue(undefined);
    mocks.readVoiceServiceConfig.mockReturnValue({
      bucket: "scrm-msg-audit-1304132716",
      inputPrefix: "s5/voice",
      outputPrefix: "s5/playable-voice",
      maxBytes: 1024 * 1024,
      maxDurationMs: 60_000,
      sampleRate: 16000,
    });
    mocks.transcodeVoiceToWav.mockResolvedValue({
      contentType: "audio/wav",
      durationMs: 2280,
      format: "silk-v3",
      sampleRate: 16000,
      wav: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    });
  });

  it("transcodes a COS object and writes wav to the playable prefix", async () => {
    const { main_handler } = await import("../src/functions/transcode-on-cos-event.js");

    await expect(
      main_handler({
        Records: [
          {
            cos: {
              cosBucket: { name: "scrm-msg-audit-1304132716" },
              cosObject: {
                key: encodeURIComponent("s5/voice/20260513/272/voice.amr"),
              },
              cosRegion: { region: "ap-shanghai" },
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      bucket: "scrm-msg-audit-1304132716",
      key: "s5/voice/20260513/272/voice.amr",
      playableKey: "s5/playable-voice/20260513/272/voice.wav",
    });

    expect(mocks.fetchCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/voice/20260513/272/voice.amr",
    );
    expect(mocks.transcodeVoiceToWav).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      expect.objectContaining({
        maxBytes: 1024 * 1024,
        maxDurationMs: 60_000,
        sampleRate: 16000,
      }),
    );
    expect(mocks.putCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/playable-voice/20260513/272/voice.wav",
      new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    );
  });

  it("normalizes short COS event bucket names with the event appid", async () => {
    const { main_handler } = await import("../src/functions/transcode-on-cos-event.js");

    await expect(
      main_handler({
        Records: [
          {
            cos: {
              cosBucket: { name: "scrm-msg-audit" },
              cosObject: {
                key: encodeURIComponent("s5/voice/20260513/272/voice.amr"),
              },
              cosRegion: { appid: "1304132716", region: "ap-shanghai" },
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      bucket: "scrm-msg-audit-1304132716",
      key: "s5/voice/20260513/272/voice.amr",
      playableKey: "s5/playable-voice/20260513/272/voice.wav",
    });

    expect(mocks.fetchCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/voice/20260513/272/voice.amr",
    );
  });

  it("accepts a short COS event bucket name that matches the configured bucket base", async () => {
    const { main_handler } = await import("../src/functions/transcode-on-cos-event.js");

    await expect(
      main_handler({
        Records: [
          {
            cos: {
              cosBucket: { name: "scrm-msg-audit" },
              cosObject: {
                key: encodeURIComponent("s5/voice/20260513/272/voice.amr"),
              },
              cosRegion: { region: "ap-shanghai" },
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      bucket: "scrm-msg-audit-1304132716",
      key: "s5/voice/20260513/272/voice.amr",
      playableKey: "s5/playable-voice/20260513/272/voice.wav",
    });

    expect(mocks.fetchCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/voice/20260513/272/voice.amr",
    );
  });

  it("normalizes COS event object keys that include appid and bucket segments", async () => {
    const { main_handler } = await import("../src/functions/transcode-on-cos-event.js");

    await expect(
      main_handler({
        Records: [
          {
            cos: {
              cosBucket: { name: "scrm-msg-audit" },
              cosObject: {
                key: encodeURIComponent(
                  "/1304132716/scrm-msg-audit/s5/voice/16559c8f42de41d890823bf8016617e7.amr",
                ),
              },
              cosRegion: { region: "ap-shanghai" },
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      bucket: "scrm-msg-audit-1304132716",
      key: "s5/voice/16559c8f42de41d890823bf8016617e7.amr",
      playableKey: "s5/playable-voice/16559c8f42de41d890823bf8016617e7.wav",
    });

    expect(mocks.fetchCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/voice/16559c8f42de41d890823bf8016617e7.amr",
    );
  });

  it("normalizes COS event object keys that start with a bucket segment", async () => {
    const { main_handler } = await import("../src/functions/transcode-on-cos-event.js");

    await expect(
      main_handler({
        Records: [
          {
            cos: {
              cosBucket: { name: "scrm-msg-audit" },
              cosObject: {
                key: encodeURIComponent(
                  "scrm-msg-audit/s5/voice/16559c8f42de41d890823bf8016617e7.amr",
                ),
              },
              cosRegion: { region: "ap-shanghai" },
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      bucket: "scrm-msg-audit-1304132716",
      key: "s5/voice/16559c8f42de41d890823bf8016617e7.amr",
      playableKey: "s5/playable-voice/16559c8f42de41d890823bf8016617e7.wav",
    });

    expect(mocks.fetchCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/voice/16559c8f42de41d890823bf8016617e7.amr",
    );
  });

  it("uses configured input and output prefixes when validating and writing objects", async () => {
    mocks.readVoiceServiceConfig.mockReturnValue({
      bucket: "scrm-msg-audit-1304132716",
      inputPrefix: "s5/msg",
      outputPrefix: "s5/playable-voice",
      maxBytes: 1024 * 1024,
      maxDurationMs: 60_000,
      sampleRate: 16000,
    });
    const { main_handler } = await import("../src/functions/transcode-on-cos-event.js");

    await expect(
      main_handler({
        Records: [
          {
            cos: {
              cosBucket: { name: "scrm-msg-audit-1304132716" },
              cosObject: {
                key: encodeURIComponent("s5/msg/20260513/272/voice.amr"),
              },
              cosRegion: { region: "ap-shanghai" },
            },
          },
        ],
      }),
    ).resolves.toMatchObject({
      bucket: "scrm-msg-audit-1304132716",
      key: "s5/msg/20260513/272/voice.amr",
      playableKey: "s5/playable-voice/20260513/272/voice.wav",
    });

    expect(mocks.fetchCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/msg/20260513/272/voice.amr",
    );
    expect(mocks.buildPlayableObjectKey).toHaveBeenCalledWith(
      "s5/msg/20260513/272/voice.amr",
      "s5/msg",
      "s5/playable-voice",
    );
    expect(mocks.putCosObject).toHaveBeenCalledWith(
      expect.any(Object),
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/playable-voice/20260513/272/voice.wav",
      new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    );
  });
});
