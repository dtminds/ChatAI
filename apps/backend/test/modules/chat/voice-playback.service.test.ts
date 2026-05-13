import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decodeMock = vi.fn(async () => ({
  data: new Uint8Array([0x00, 0x00, 0x01, 0x00]),
  duration: 20,
}));

const isSilkMock = vi.fn((input: Buffer | Uint8Array) => {
  const view = input instanceof Buffer ? input : Buffer.from(input);

  return view.length > 0 && view[0] === 0xaa;
});

vi.mock("silk-wasm", () => ({
  decode: decodeMock,
  isSilk: isSilkMock,
}));

describe("resolveVoicePlaybackPayload", () => {
  beforeEach(() => {
    decodeMock.mockClear();
    isSilkMock.mockClear();
  });

  it("passes through non-SILK payloads unchanged", async () => {
    const { resolveVoicePlaybackPayload } = await import(
      "../../../src/modules/chat/voice-playback.service.js"
    );
    const body = Buffer.from([1, 2, 3]);
    const result = await resolveVoicePlaybackPayload({
      body: Readable.from(body),
      contentType: "audio/amr",
    });

    expect(result.contentType).toBe("audio/amr");
    expect(result.contentLength).toBe(3);
    expect(decodeMock).not.toHaveBeenCalled();

    const echoed = await readAll(result.body);

    expect(echoed.equals(body)).toBe(true);
  });

  it("transcodes SILK payloads to WAV PCM", async () => {
    const { resolveVoicePlaybackPayload } = await import(
      "../../../src/modules/chat/voice-playback.service.js"
    );
    const silkLike = Buffer.from([0xaa, 9, 8, 7]);
    const result = await resolveVoicePlaybackPayload({
      body: Readable.from(silkLike),
      contentType: "application/octet-stream",
    });

    expect(result.contentType).toBe("audio/wav");
    expect(decodeMock).toHaveBeenCalledTimes(1);
    expect(result.contentLength).toBeGreaterThan(44);

    const wav = await readAll(result.body);

    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
  });
});

async function readAll(stream: Readable) {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }

  return Buffer.concat(chunks);
}
