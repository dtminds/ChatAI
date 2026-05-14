const COMPOSER_IMAGE_FILE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const COMPOSER_IMAGE_FILE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export const COMPOSER_IMAGE_FILE_ACCEPT = [
  "image/jpeg",
  "image/png",
  ...COMPOSER_IMAGE_FILE_EXTENSIONS,
].join(",");

export function isSupportedComposerImageFile(file: Pick<File, "name" | "type">) {
  const normalizedType = file.type.trim().toLowerCase();

  if (normalizedType) {
    return COMPOSER_IMAGE_FILE_MIME_TYPES.has(normalizedType);
  }

  return hasSupportedComposerImageExtension(file.name);
}

export function isSupportedComposerImageMimeType(type: string) {
  return COMPOSER_IMAGE_FILE_MIME_TYPES.has(type.trim().toLowerCase());
}

function hasSupportedComposerImageExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();

  return COMPOSER_IMAGE_FILE_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  );
}
