import { describe, expect, it } from "vitest";
import { createPcm16MonoWav } from "../src/shared/wav.js";

describe("wav encoding", () => {
  it("wraps pcm_s16le data in a mono wav container", () => {
    const pcm = new Uint8Array([0x00, 0x00, 0xff, 0x7f]);
    const wav = createPcm16MonoWav(pcm, 16000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(text(wav, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(40);
    expect(text(wav, 8, 4)).toBe("WAVE");
    expect(text(wav, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(wav, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(4);
    expect([...wav.slice(44)]).toEqual([...pcm]);
  });
});

function text(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder().decode(bytes.slice(start, start + length));
}
