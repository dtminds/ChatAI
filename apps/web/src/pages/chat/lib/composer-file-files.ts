const SUPPORTED_COMPOSER_FILE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "pdf",
  "ppt",
  "pptx",
  "txt",
  "xls",
  "xlsx",
]);

const SUPPORTED_COMPOSER_FILE_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export const COMPOSER_FILE_ACCEPT = [
  ".pdf",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".txt",
  ".ppt",
  ".pptx",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

export const MAX_COMPOSER_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function isSupportedComposerFile(file: File) {
  const contentType = file.type.trim().toLowerCase();

  if (contentType && SUPPORTED_COMPOSER_FILE_TYPES.has(contentType)) {
    return true;
  }

  return SUPPORTED_COMPOSER_FILE_EXTENSIONS.has(getFileExtension(file.name));
}

export function isComposerFileSizeAllowed(file: File) {
  return file.size <= MAX_COMPOSER_FILE_SIZE_BYTES;
}

export function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();

  return extension && extension !== fileName.toLowerCase() ? extension : "";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${formatFileSizeUnit(bytes / 1024)} KB`;
  }

  return `${formatFileSizeUnit(bytes / (1024 * 1024))} MB`;
}

function formatFileSizeUnit(value: number) {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}
