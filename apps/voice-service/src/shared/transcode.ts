import { decode, getDuration } from "silk-wasm";
import decodeAudio from "audio-decode";
import { detectVoiceFormat, type VoiceFormat } from "./media-sniff.js";
import { createPcm16MonoWav } from "./wav.js";

export type TranscodeOptions = {
  maxBytes: number;
  maxDurationMs: number;
  sampleRate: number;
};

export type TranscodeResult = {
  contentType: "audio/wav";
  durationMs: number;
  format: Exclude<VoiceFormat, "unknown">;
  sampleRate: number;
  wav: Uint8Array;
};

export class VoiceTranscodeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "VoiceTranscodeError";
  }
}

export async function transcodeVoiceToWav(
  input: Uint8Array,
  options: TranscodeOptions,
): Promise<TranscodeResult> {
  if (input.byteLength > options.maxBytes) {
    throw new VoiceTranscodeError("VOICE_FILE_TOO_LARGE", "语音文件过大");
  }

  const detected = detectVoiceFormat(input);

  if (detected.format === "unknown") {
    throw new VoiceTranscodeError("UNSUPPORTED_VOICE_FORMAT", "语音格式不支持");
  }

  if (detected.format !== "silk-v3") {
    if (detected.format !== "amr-nb" && detected.format !== "amr-wb") {
      throw new VoiceTranscodeError("UNSUPPORTED_VOICE_FORMAT", "语音格式暂未接入转码");
    }

    const decoded = await decodeAudio(input);
    const sampleRate = decoded.sampleRate;
    const durationMs = Math.ceil(((decoded.channelData[0]?.length ?? 0) / sampleRate) * 1000);

    if (durationMs > options.maxDurationMs) {
      throw new VoiceTranscodeError("VOICE_DURATION_TOO_LONG", "语音时长超出限制");
    }

    const pcm = mixDownToPcm16(decoded.channelData);
    const wav = createPcm16MonoWav(pcm, sampleRate);

    return {
      contentType: "audio/wav",
      durationMs,
      format: detected.format,
      sampleRate,
      wav,
    };
  }

  const durationMs = getDuration(input, 20);

  if (durationMs > options.maxDurationMs) {
    throw new VoiceTranscodeError("VOICE_DURATION_TOO_LONG", "语音时长超出限制");
  }

  const decoded = await decode(input, options.sampleRate);
  const wav = createPcm16MonoWav(decoded.data, options.sampleRate);

  return {
    contentType: "audio/wav",
    durationMs: decoded.duration || durationMs,
    format: detected.format,
    sampleRate: options.sampleRate,
    wav,
  };
}

function mixDownToPcm16(channelData: Float32Array[]) {
  const channels = channelData.length;
  const samples = channelData[0]?.length ?? 0;
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    let mixed = 0;

    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      mixed += channelData[channelIndex]?.[sampleIndex] ?? 0;
    }

    const normalized = channels > 0 ? Math.max(-1, Math.min(1, mixed / channels)) : 0;
    const int16 = normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
    view.setInt16(sampleIndex * 2, Math.round(int16), true);
  }

  return pcm;
}
