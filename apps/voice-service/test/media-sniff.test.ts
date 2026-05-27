import { describe, expect, it } from "vitest";
import {
  buildPlayableObjectKey,
  detectVoiceFormat,
  isAllowedSourceObject,
} from "../src/shared/media-sniff.js";

describe("voice media sniffing", () => {
  it("detects SILK files with a leading Tencent length byte", () => {
    const data = new Uint8Array([0x02, ...ascii("#!SILK_V3"), 0x14, 0x00]);

    expect(detectVoiceFormat(data)).toEqual({
      format: "silk-v3",
      headerOffset: 1,
    });
  });

  it("detects standard AMR narrowband and wideband headers", () => {
    expect(detectVoiceFormat(ascii("#!AMR\nabc"))).toEqual({
      format: "amr-nb",
      headerOffset: 0,
    });
    expect(detectVoiceFormat(ascii("#!AMR-WB\nabc"))).toEqual({
      format: "amr-wb",
      headerOffset: 0,
    });
  });

  it("rejects unknown input", () => {
    expect(detectVoiceFormat(ascii("not audio"))).toEqual({
      format: "unknown",
      headerOffset: -1,
    });
  });

  it("only accepts source objects under s5/voice", () => {
    expect(isAllowedSourceObject("s5/voice/20260513/272/a.amr")).toBe(true);
    expect(isAllowedSourceObject("s5/playable-voice/20260513/272/a.wav")).toBe(false);
    expect(isAllowedSourceObject("s5/image/20260513/272/a.amr")).toBe(false);
    expect(isAllowedSourceObject("s5/voice/../playable-voice/a.amr")).toBe(false);
  });

  it("accepts source objects under a configured input prefix", () => {
    expect(isAllowedSourceObject("s5/msg/20260513/272/a.amr", "s5/msg")).toBe(true);
    expect(isAllowedSourceObject("s5/voice/20260513/272/a.amr", "s5/msg")).toBe(false);
  });

  it("maps source object keys to playable wav keys", () => {
    expect(buildPlayableObjectKey("s5/voice/20260513/272/a.amr")).toBe(
      "s5/playable-voice/20260513/272/a.wav",
    );
    expect(buildPlayableObjectKey("s5/voice/20260513/272/a.silk")).toBe(
      "s5/playable-voice/20260513/272/a.wav",
    );
    expect(buildPlayableObjectKey("s5/voice/20260513/272/a.awb")).toBe(
      "s5/playable-voice/20260513/272/a.wav",
    );
  });

  it("maps configured input prefixes to configured playable wav prefixes", () => {
    expect(buildPlayableObjectKey("s5/msg/20260513/272/a.amr", "s5/msg", "s5/playable-voice")).toBe(
      "s5/playable-voice/20260513/272/a.wav",
    );
  });
});

function ascii(value: string) {
  return new TextEncoder().encode(value);
}
