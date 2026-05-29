import { createCosClientFromEnv, putCosObject } from "./cos.js";
import { readVoiceServiceConfig } from "./config.js";
import { buildPlayableObjectKey } from "./media-sniff.js";
import { transcodeVoiceToWav, VoiceTranscodeError } from "./transcode.js";

const DEFAULT_COS_REGION = "ap-shanghai";
const SOURCE_FETCH_TIMEOUT_MS = 15_000;

export class EnsurePlayableVoiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "EnsurePlayableVoiceError";
  }
}

export async function ensurePlayableVoiceOnCos(input: {
  env?: NodeJS.ProcessEnv;
  playableVoiceUrl: string;
  sourceVoiceUrl: string;
}) {
  const config = readVoiceServiceConfig(input.env);
  const client = createCosClientFromEnv(input.env);
  const region = readCosRegion(input.env);
  const sourceObjectKey = extractSourceObjectKey(input.sourceVoiceUrl);
  const playableObjectKey = buildPlayableObjectKey(
    sourceObjectKey,
    config.inputPrefix,
    config.outputPrefix,
  );
  const sourceResponse = await fetchSourceVoice(input.sourceVoiceUrl);
  const sourceBody = new Uint8Array(await sourceResponse.arrayBuffer());
  const transcoded = await transcodeVoiceToWav(sourceBody, {
    maxBytes: config.maxBytes,
    maxDurationMs: config.maxDurationMs,
    sampleRate: config.sampleRate,
  });

  await putCosObject(
    client,
    config.bucket,
    region,
    playableObjectKey,
    transcoded.wav,
  );

  return {
    playableObjectKey,
    playableVoiceUrl: input.playableVoiceUrl,
  };
}

function readCosRegion(env: NodeJS.ProcessEnv = process.env) {
  const region = env.VOICE_SERVICE_REGION?.trim();

  return region || DEFAULT_COS_REGION;
}

async function fetchSourceVoice(sourceVoiceUrl: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceVoiceUrl, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new EnsurePlayableVoiceError(
        "SOURCE_VOICE_FETCH_FAILED",
        "语音原始文件读取失败",
      );
    }

    return response;
  } catch (error) {
    if (error instanceof EnsurePlayableVoiceError) {
      throw error;
    }

    throw new EnsurePlayableVoiceError(
      "SOURCE_VOICE_FETCH_FAILED",
      "语音原始文件读取失败",
      { cause: error instanceof Error ? error : undefined },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractSourceObjectKey(sourceVoiceUrl: string) {
  let pathname: string;

  try {
    pathname = new URL(sourceVoiceUrl).pathname;
  } catch {
    throw new EnsurePlayableVoiceError(
      "SOURCE_VOICE_URL_INVALID",
      "语音原始地址无效",
    );
  }

  const objectKey = pathname.replace(/^\/+/, "");

  if (!objectKey) {
    throw new EnsurePlayableVoiceError(
      "SOURCE_VOICE_URL_INVALID",
      "语音原始地址无效",
    );
  }

  return objectKey;
}

export function mapEnsurePlayableVoiceError(error: unknown) {
  if (error instanceof EnsurePlayableVoiceError) {
    return error;
  }

  if (error instanceof VoiceTranscodeError) {
    return new EnsurePlayableVoiceError(error.code, error.message, { cause: error });
  }

  if (error instanceof Error && error.message.includes("Missing COS credentials")) {
    return new EnsurePlayableVoiceError(
      "VOICE_TRANSCODE_NOT_CONFIGURED",
      "语音转码服务未配置",
      { cause: error },
    );
  }

  if (error instanceof Error && error.message.includes("VOICE_SERVICE_BUCKET")) {
    return new EnsurePlayableVoiceError(
      "VOICE_TRANSCODE_NOT_CONFIGURED",
      "语音转码服务未配置",
      { cause: error },
    );
  }

  return new EnsurePlayableVoiceError(
    "PLAYABLE_VOICE_ENSURE_FAILED",
    "语音转码失败",
    { cause: error instanceof Error ? error : undefined },
  );
}
