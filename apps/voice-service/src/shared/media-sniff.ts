export type VoiceFormat = "amr-nb" | "amr-wb" | "silk-v3" | "unknown";

export type DetectedVoiceFormat = {
  format: VoiceFormat;
  headerOffset: number;
};

const AMR_NB_HEADER = "#!AMR\n";
const AMR_WB_HEADER = "#!AMR-WB\n";
const SILK_HEADER = "#!SILK_V3";

export function detectVoiceFormat(data: Uint8Array): DetectedVoiceFormat {
  if (startsWithAscii(data, AMR_NB_HEADER)) {
    return {
      format: "amr-nb",
      headerOffset: 0,
    };
  }

  if (startsWithAscii(data, AMR_WB_HEADER)) {
    return {
      format: "amr-wb",
      headerOffset: 0,
    };
  }

  const silkOffset = indexOfAscii(data, SILK_HEADER);

  if (silkOffset >= 0) {
    return {
      format: "silk-v3",
      headerOffset: silkOffset,
    };
  }

  return {
    format: "unknown",
    headerOffset: -1,
  };
}

export function isAllowedSourceObject(key: string) {
  return key.startsWith("s5/voice/");
}

export function buildPlayableObjectKey(sourceKey: string) {
  if (!isAllowedSourceObject(sourceKey)) {
    throw new Error(`Invalid source key: ${sourceKey}`);
  }

  return sourceKey
    .replace(/^s5\/voice\//, "s5/playable-voice/")
    .replace(/\.[^/.]+$/u, ".wav");
}

function startsWithAscii(data: Uint8Array, text: string) {
  if (data.length < text.length) {
    return false;
  }

  for (let index = 0; index < text.length; index += 1) {
    if (data[index] !== text.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function indexOfAscii(data: Uint8Array, text: string) {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).indexOf(text);
}
