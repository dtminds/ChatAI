export const SMART_REPLY_MAKE_SHORTER_TEMPLATE_ID = 17;

export function extractAiHelperTemplateConfigParamId(data: unknown) {
  if (!isRecord(data)) {
    return undefined;
  }

  const configData = data.configData;

  if (!Array.isArray(configData) || configData.length === 0) {
    return undefined;
  }

  const first = configData[0];

  if (!isRecord(first)) {
    return undefined;
  }

  return readPositiveInteger(first.id);
}

export function buildAiHelperAskRequestBody(generateId: string) {
  const numeric = readPositiveInteger(generateId);

  return {
    generateId: numeric ?? generateId,
  };
}

export function collectAiHelperAskStreamText(raw: string) {
  return raw.trim();
}

export function mapJavaAiHelperGenerateId(data: unknown) {
  if (typeof data === "string" && data.trim().length > 0) {
    return data.trim();
  }

  if (typeof data === "number" && Number.isFinite(data)) {
    return String(data);
  }

  if (!isRecord(data)) {
    return undefined;
  }

  const generateId = data.generateId;

  if (typeof generateId === "string" && generateId.trim().length > 0) {
    return generateId.trim();
  }

  if (typeof generateId === "number" && Number.isFinite(generateId)) {
    return String(generateId);
  }

  return undefined;
}

function readPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10);

    return parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
