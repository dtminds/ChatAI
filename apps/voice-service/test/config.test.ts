import { describe, expect, it } from "vitest";
import { readVoiceServiceConfig } from "../src/shared/config.js";

describe("voice service config", () => {
  it("requires an explicit COS bucket", () => {
    expect(() => readVoiceServiceConfig({} as NodeJS.ProcessEnv)).toThrow(
      "Missing required environment variable: VOICE_SERVICE_BUCKET",
    );
  });

  it("reads the configured COS bucket", () => {
    expect(
      readVoiceServiceConfig({
        VOICE_SERVICE_BUCKET: "scrm-msg-audit-1304132716",
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      bucket: "scrm-msg-audit-1304132716",
      inputPrefix: "s5/voice",
      outputPrefix: "s5/playable-voice",
    });
  });
});
