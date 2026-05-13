import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { decode, isSilk } from "silk-wasm";
import {
  BadGatewayError,
  BadRequestError,
} from "../../shared/errors.js";
import type { ProxiedMediaAsset } from "./media-proxy.service.js";

const MAX_VOICE_PAYLOAD_BYTES = 25 * 1024 * 1024;
/** 工作台侧 OSS 语音当前观测为 Tencent SILK，解码侧按 pcm_s16le mono 对齐 */
const SILK_VOICE_SAMPLE_RATE_HZ = 24000;

function pcm16leMonoToWavBuffer(pcm: Uint8Array, sampleRateHz: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRateHz * blockAlign;
  const dataSize = pcm.byteLength;
  const headerSize = 44;
  const out = Buffer.alloc(headerSize + dataSize);

  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(numChannels, 22);
  out.writeUInt32LE(sampleRateHz, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bitsPerSample, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  Buffer.from(pcm).copy(out, headerSize);

  return out;
}

async function readStreamToVoiceBuffer(body: Readable) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : typeof chunk === "string"
        ? Buffer.from(chunk, "utf8")
        : Buffer.from(chunk as Uint8Array);
    size += buf.length;

    if (size > MAX_VOICE_PAYLOAD_BYTES) {
      throw new BadRequestError("VOICE_PAYLOAD_TOO_LARGE", "语音文件过大");
    }

    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

export type VoicePlaybackPayload = {
  body: Readable;
  contentLength: number;
  contentType: string;
};

/**
 * 将允许域名下的语音资源转为浏览器可用的字节流：
 * Tencent SILK（含 OSS 上以 .amr 命名的 SILK 容器）转成 WAV；
 * 其他内容按原始 media 推断类型透传，供 BenzAMR 等前端解码链路使用。
 */
export async function resolveVoicePlaybackPayload(
  media: ProxiedMediaAsset,
): Promise<VoicePlaybackPayload> {
  const rawBuffer = await readStreamToVoiceBuffer(media.body);

  if (!isSilk(rawBuffer)) {
    return {
      body: Readable.from(rawBuffer),
      contentLength: rawBuffer.length,
      contentType: media.contentType,
    };
  }

  let pcm: Uint8Array;

  try {
    pcm = (await decode(rawBuffer, SILK_VOICE_SAMPLE_RATE_HZ)).data;
  } catch {
    throw new BadGatewayError(
      "VOICE_SILK_DECODE_FAILED",
      "SILK 语音解码失败",
    );
  }

  const wav = pcm16leMonoToWavBuffer(pcm, SILK_VOICE_SAMPLE_RATE_HZ);

  return {
    body: Readable.from(wav),
    contentLength: wav.length,
    contentType: "audio/wav",
  };
}
