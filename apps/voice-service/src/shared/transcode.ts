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

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
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

    let decoded: DecodedAudioBuffer;

    try {
      decoded = await decodeAudio(input);
    } catch {
      throw new VoiceTranscodeError("DECODE_FAILED", "音频解码失败");
    }

    if (!decoded) {
      throw new VoiceTranscodeError("DECODE_FAILED", "音频解码失败");
    }

    const sampleRate = decoded.sampleRate;
    const channelData = readAudioBufferChannelData(decoded);
    const durationMs = Math.ceil(((channelData[0]?.length ?? 0) / sampleRate) * 1000);

    if (durationMs > options.maxDurationMs) {
      throw new VoiceTranscodeError("VOICE_DURATION_TOO_LONG", "语音时长超出限制");
    }

    const pcm = mixDownToPcm16(channelData);
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

  let decoded: Awaited<ReturnType<typeof decode>>;

  try {
    decoded = await decode(input, options.sampleRate);
  } catch (error) {
    throw new VoiceTranscodeError("DECODE_FAILED", "音频解码失败", { cause: error });
  }

  const wav = createPcm16MonoWav(decoded.data, options.sampleRate);

  return {
    contentType: "audio/wav",
    durationMs: decoded.duration || durationMs,
    format: detected.format,
    sampleRate: options.sampleRate,
    wav,
  };
}

type DecodedAudioBuffer = {
  channelData?: Float32Array[];
  getChannelData?: (channel: number) => Float32Array;
  numberOfChannels?: number;
  sampleRate: number;
};

function readAudioBufferChannelData(decoded: DecodedAudioBuffer) {
  if (Array.isArray(decoded.channelData)) {
    return decoded.channelData;
  }

  if (typeof decoded.getChannelData !== "function" || typeof decoded.numberOfChannels !== "number") {
    throw new VoiceTranscodeError("DECODE_FAILED", "音频解码失败");
  }

  const channelData: Float32Array[] = [];

  for (let channelIndex = 0; channelIndex < decoded.numberOfChannels; channelIndex += 1) {
    channelData.push(decoded.getChannelData(channelIndex));
  }

  return channelData;
}

function mixDownToPcm16(channelData: Float32Array[]) {
  const validChannels = channelData.filter((channel) => channel instanceof Float32Array);
  const channels = validChannels.length;
  const samples = validChannels[0]?.length ?? 0;
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    let mixed = 0;

    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      mixed += validChannels[channelIndex]![sampleIndex] ?? 0;
    }

    const normalized = channels > 0 ? Math.max(-1, Math.min(1, mixed / channels)) : 0;
    const int16 = normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
    view.setInt16(sampleIndex * 2, Math.round(int16), true);
  }

  return pcm;
}
