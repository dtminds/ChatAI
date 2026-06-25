import { MATERIAL_COLLECTION_BIZ_TYPE } from "./enums.js";

export const MATERIAL_COLLECTION_TITLE_MAX_LENGTH = 32;
export const MATERIAL_COLLECTION_DESCRIPTION_MAX_LENGTH = 64;

export type MaterialFileCollectFields = {
  fileName: string;
  fileUrl: string;
};

export type MaterialH5CollectFields = {
  description: string;
  linkUrl: string;
  title: string;
};

export type MaterialImageCollectFields = {
  fileUrl: string;
};

export type MaterialVideoCollectFields = {
  coverUrl: string;
  fileUrl: string;
};

export type MaterialCollectFieldError = {
  errorMsg: string;
};

export function isOwnVideoMaterialUrl(fileUrl: string) {
  const normalizedUrl = fileUrl.trim();

  if (normalizedUrl.startsWith("https://b5.bokr.com.cn")) {
    return true;
  }

  return normalizedUrl.replace(/^\/+/, "").startsWith("s5/msg/");
}

export function parseMaterialRawContent(rawContent: string | null | undefined) {
  if (!rawContent) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(rawContent);

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readMaterialRawString(
  record: Record<string, unknown>,
  key: string,
) {
  const value = record[key];

  return typeof value === "string" ? value.trim() : "";
}

export function readMaterialLinkUrl(record: Record<string, unknown>) {
  return (
    readMaterialRawString(record, "href") ||
    readMaterialRawString(record, "linkUrl") ||
    readMaterialRawString(record, "url")
  );
}

export function readMaterialDescription(record: Record<string, unknown>) {
  return (
    readMaterialRawString(record, "description") ||
    readMaterialRawString(record, "desc")
  );
}

export function truncateMaterialCollectionText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

export function validateMaterialCollectionSubmitFields(input: {
  description?: string;
  fileName?: string;
  title?: string;
}):
  | {
      description?: string;
      fileName?: string;
      title?: string;
    }
  | MaterialCollectFieldError {
  const fields: {
    description?: string;
    fileName?: string;
    title?: string;
  } = {};

  if (input.fileName !== undefined) {
    const fileNameResult = validateBoundedMaterialText(
      input.fileName,
      MATERIAL_COLLECTION_TITLE_MAX_LENGTH,
      "文件名称",
    );

    if (isMaterialCollectFieldError(fileNameResult)) {
      return fileNameResult;
    }

    fields.fileName = fileNameResult;
  }

  if (input.title !== undefined) {
    const titleResult = validateBoundedMaterialText(
      input.title,
      MATERIAL_COLLECTION_TITLE_MAX_LENGTH,
      "链接标题",
    );

    if (isMaterialCollectFieldError(titleResult)) {
      return titleResult;
    }

    fields.title = titleResult;
  }

  if (input.description !== undefined) {
    const descriptionResult = validateBoundedMaterialText(
      input.description,
      MATERIAL_COLLECTION_DESCRIPTION_MAX_LENGTH,
      "链接描述",
    );

    if (isMaterialCollectFieldError(descriptionResult)) {
      return descriptionResult;
    }

    fields.description = descriptionResult;
  }

  return fields;
}

export function resolveMaterialFileCollectFields(
  rawContent: string | null | undefined,
  overrides?: { fileName?: string },
): MaterialFileCollectFields | MaterialCollectFieldError {
  const content = parseMaterialRawContent(rawContent);
  const fileUrl = readMaterialRawString(content, "fileUrl");

  if (!fileUrl) {
    return { errorMsg: "文件缺少下载地址，无法收录" };
  }

  const fileNameSource =
    overrides?.fileName ||
    readMaterialRawString(content, "fileName") ||
    readMaterialRawString(content, "title");
  const fileNameResult = validateBoundedMaterialText(
    fileNameSource,
    MATERIAL_COLLECTION_TITLE_MAX_LENGTH,
    "文件名称",
  );

  if (isMaterialCollectFieldError(fileNameResult)) {
    return fileNameResult;
  }

  if (!fileNameResult) {
    return { errorMsg: "文件名称不能为空" };
  }

  return { fileName: fileNameResult, fileUrl };
}

export function resolveMaterialH5CollectFields(
  rawContent: string | null | undefined,
  overrides?: { description?: string; title?: string },
): MaterialH5CollectFields | MaterialCollectFieldError {
  const content = parseMaterialRawContent(rawContent);
  const linkUrl = readMaterialLinkUrl(content);

  if (!linkUrl) {
    return { errorMsg: "链接地址不能为空" };
  }

  const titleSource =
    overrides?.title || readMaterialRawString(content, "title");
  const titleResult = validateBoundedMaterialText(
    titleSource,
    MATERIAL_COLLECTION_TITLE_MAX_LENGTH,
    "链接标题",
  );

  if (isMaterialCollectFieldError(titleResult)) {
    return titleResult;
  }

  if (!titleResult) {
    return { errorMsg: "链接标题不能为空" };
  }

  const descriptionResult = validateBoundedMaterialText(
    overrides?.description ?? readMaterialDescription(content),
    MATERIAL_COLLECTION_DESCRIPTION_MAX_LENGTH,
    "链接描述",
  );

  if (isMaterialCollectFieldError(descriptionResult)) {
    return descriptionResult;
  }

  return {
    description: descriptionResult,
    linkUrl,
    title: titleResult,
  };
}

export function resolveMaterialImageCollectFields(
  rawContent: string | null | undefined,
): MaterialImageCollectFields | MaterialCollectFieldError {
  const fileUrl = readMaterialRawString(parseMaterialRawContent(rawContent), "fileUrl");

  if (!fileUrl) {
    return { errorMsg: "图片缺少地址，无法收录" };
  }

  return { fileUrl };
}

export function resolveMaterialVideoCollectFields(
  rawContent: string | null | undefined,
): MaterialVideoCollectFields | MaterialCollectFieldError {
  const content = parseMaterialRawContent(rawContent);
  const fileUrl = readMaterialRawString(content, "fileUrl");

  if (!fileUrl) {
    return { errorMsg: "视频缺少地址，无法收录" };
  }

  const coverUrl = readMaterialRawString(content, "coverUrl");

  if (!coverUrl) {
    return { errorMsg: "视频缺少封面，无法收录" };
  }

  return { coverUrl, fileUrl };
}

export function buildMaterialFileContentJson(
  rawContent: string | null | undefined,
  fields: MaterialFileCollectFields,
) {
  const content = {
    ...parseMaterialRawContent(rawContent),
    fileName: fields.fileName,
    fileUrl: fields.fileUrl,
  };

  return JSON.stringify(content);
}

export function buildMaterialH5ContentJson(
  rawContent: string | null | undefined,
  fields: MaterialH5CollectFields,
) {
  const content = parseMaterialRawContent(rawContent);
  const nextContent: Record<string, unknown> = {
    ...content,
    description: fields.description,
    href: fields.linkUrl,
    title: fields.title,
  };

  delete nextContent.desc;
  delete nextContent.linkUrl;
  delete nextContent.url;

  return JSON.stringify(nextContent);
}

export function buildMaterialImageContentJson(
  rawContent: string | null | undefined,
  fields: MaterialImageCollectFields,
) {
  const content = {
    ...parseMaterialRawContent(rawContent),
    fileUrl: fields.fileUrl,
  };

  return JSON.stringify(content);
}

export function buildMaterialVideoContentJson(
  rawContent: string | null | undefined,
  fields: MaterialVideoCollectFields,
) {
  const content = {
    ...parseMaterialRawContent(rawContent),
    coverUrl: fields.coverUrl,
    fileUrl: fields.fileUrl,
  };

  return JSON.stringify(content);
}

export function patchMaterialFileContentJson(
  rawContent: string | null | undefined,
  fileName: string,
) {
  const resolved = resolveMaterialFileCollectFields(rawContent, { fileName });

  if ("errorMsg" in resolved) {
    return resolved;
  }

  return {
    content: buildMaterialFileContentJson(rawContent, resolved),
    title: resolved.fileName,
  };
}

export function patchMaterialH5ContentJson(
  rawContent: string | null | undefined,
  input: { description?: string; title: string },
) {
  const resolved = resolveMaterialH5CollectFields(rawContent, input);

  if ("errorMsg" in resolved) {
    return resolved;
  }

  return {
    content: buildMaterialH5ContentJson(rawContent, resolved),
    title: resolved.title,
  };
}

export function canEditMaterialCollectionItem(bizType: number) {
  return (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBoundedMaterialText(
  value: string,
  maxLength: number,
  label: string,
): string | MaterialCollectFieldError {
  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return { errorMsg: `${label}不能超过 ${maxLength} 个字符` };
  }

  return trimmed;
}

function isMaterialCollectFieldError(
  value: string | MaterialCollectFieldError,
): value is MaterialCollectFieldError {
  return typeof value === "object" && value !== null && "errorMsg" in value;
}
