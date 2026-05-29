import {
  ensurePlayableVoiceOnCos,
  mapEnsurePlayableVoiceError,
} from "@chatai/voice-service/ensure-playable-voice";
import { BadGatewayError, NotFoundError } from "../../shared/errors.js";
import { getPlayableMediaHost } from "./media-config.js";

type PlayableVoiceExistsChecker = (playbackUrl: string) => Promise<boolean>;

export async function ensureVoiceUrlForRecognition(input: {
  content: Record<string, unknown>;
  playableVoiceExists: PlayableVoiceExistsChecker;
  readStringValue: (value: unknown) => string;
  resolveVoiceRecognitionUrl: (content: Record<string, unknown>) => string;
}) {
  const voiceUrl = input.resolveVoiceRecognitionUrl(input.content);

  if (!voiceUrl) {
    return {
      transFileUrl: undefined,
      voiceUrl: "",
    };
  }

  if (await input.playableVoiceExists(voiceUrl)) {
    return {
      transFileUrl: readOptionalTransFileUrl(input.content, input.readStringValue),
      voiceUrl,
    };
  }

  const sourceVoiceUrl = resolveSourceVoiceUrl(input.content, input.readStringValue);

  if (!sourceVoiceUrl) {
    throw new NotFoundError(
      "PLAYABLE_VOICE_NOT_READY",
      "语音转码文件尚未就绪，请稍后再试",
    );
  }

  let transFileUrl: string | undefined;

  try {
    const ensured = await ensurePlayableVoiceOnCos({
      playableVoiceUrl: voiceUrl,
      sourceVoiceUrl,
    });
    transFileUrl = ensured.playableObjectKey;
  } catch (error) {
    const mappedError = mapEnsurePlayableVoiceError(error);

    if (mappedError.code === "VOICE_TRANSCODE_NOT_CONFIGURED") {
      throw new BadGatewayError(
        "VOICE_TRANSCODE_NOT_CONFIGURED",
        "语音转码服务未配置，请联系管理员",
        { reason: mappedError.code },
      );
    }

    if (
      mappedError.code === "SOURCE_VOICE_FETCH_FAILED" ||
      mappedError.code === "SOURCE_VOICE_URL_INVALID"
    ) {
      throw new NotFoundError(
        "PLAYABLE_VOICE_NOT_READY",
        "语音转码文件尚未就绪，请稍后再试",
      );
    }

    throw new BadGatewayError(
      mappedError.code,
      mappedError.message || "语音转码失败",
      {
        cause: mappedError.code,
      },
    );
  }

  if (!(await input.playableVoiceExists(voiceUrl))) {
    throw new NotFoundError(
      "PLAYABLE_VOICE_NOT_READY",
      "语音转码文件尚未就绪，请稍后再试",
    );
  }

  return {
    transFileUrl,
    voiceUrl,
  };
}

function readOptionalTransFileUrl(
  content: Record<string, unknown>,
  readStringValue: (value: unknown) => string,
) {
  const transFileUrl = readStringValue(content.transFileUrl).trim();

  return transFileUrl || undefined;
}

function resolveSourceVoiceUrl(
  content: Record<string, unknown>,
  readStringValue: (value: unknown) => string,
) {
  const fileUrl = readStringValue(content.fileUrl).trim();

  if (!fileUrl) {
    return "";
  }

  try {
    const url = new URL(fileUrl);

    if (url.protocol === "https:" && url.host === getPlayableMediaHost()) {
      return url.toString();
    }
  } catch {
    return `https://${getPlayableMediaHost()}/${fileUrl.replace(/^\/+/, "")}`;
  }

  return "";
}
