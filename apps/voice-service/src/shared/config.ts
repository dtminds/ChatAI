export type VoiceServiceConfig = {
  bucket: string;
  outputPrefix: string;
  inputPrefix: string;
  maxBytes: number;
  maxDurationMs: number;
  sampleRate: number;
};

export function readVoiceServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): VoiceServiceConfig {
  return {
    bucket: env.VOICE_SERVICE_BUCKET ?? "scrm-msg-audit-1304132716",
    inputPrefix: normalizePrefix(env.VOICE_SERVICE_INPUT_PREFIX ?? "s5/voice"),
    outputPrefix: normalizePrefix(
      env.VOICE_SERVICE_OUTPUT_PREFIX ?? "s5/playable-voice",
    ),
    maxBytes: parsePositiveInteger(env.VOICE_SERVICE_MAX_BYTES, 10 * 1024 * 1024),
    maxDurationMs: parsePositiveInteger(env.VOICE_SERVICE_MAX_DURATION_MS, 60_000),
    sampleRate: parsePositiveInteger(env.VOICE_SERVICE_SAMPLE_RATE, 16_000),
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePrefix(prefix: string) {
  return prefix.replace(/^\/+/, "").replace(/\/+$/, "");
}
