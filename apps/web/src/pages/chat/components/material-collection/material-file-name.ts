import { MATERIAL_COLLECTION_TITLE_MAX_LENGTH } from "@chatai/contracts";

export function normalizeMaterialFileExtension(extension: string) {
  return extension.trim().replace(/^\./, "").toLowerCase();
}

export function resolveMaterialFileExtension(
  fileName: string,
  preferredExtension?: string,
) {
  const extensionFromField = normalizeMaterialFileExtension(preferredExtension ?? "");

  if (extensionFromField) {
    return extensionFromField;
  }

  return extractMaterialFileExtension(fileName);
}

export function splitMaterialFileName(
  fileName: string,
  preferredExtension?: string,
) {
  const normalizedFileName = fileName.trim();
  const extension = resolveMaterialFileExtension(normalizedFileName, preferredExtension);

  if (!extension) {
    return {
      baseName: normalizedFileName,
      extension: "",
    };
  }

  const suffix = `.${extension}`;
  const normalizedSuffix = suffix.toLowerCase();

  if (normalizedFileName.toLowerCase().endsWith(normalizedSuffix)) {
    return {
      baseName: normalizedFileName.slice(0, -suffix.length),
      extension,
    };
  }

  return {
    baseName: normalizedFileName,
    extension,
  };
}

export function joinMaterialFileName(baseName: string, extension: string) {
  const normalizedBaseName = baseName.trim();
  const normalizedExtension = normalizeMaterialFileExtension(extension);

  if (!normalizedBaseName) {
    return normalizedExtension ? `.${normalizedExtension}` : "";
  }

  if (!normalizedExtension) {
    return normalizedBaseName;
  }

  return `${normalizedBaseName}.${normalizedExtension}`;
}

export function getMaterialFileNameBaseMaxLength(extension: string) {
  const normalizedExtension = normalizeMaterialFileExtension(extension);

  if (!normalizedExtension) {
    return MATERIAL_COLLECTION_TITLE_MAX_LENGTH;
  }

  return Math.max(
    1,
    MATERIAL_COLLECTION_TITLE_MAX_LENGTH - normalizedExtension.length - 1,
  );
}

export function hasMaterialFileNameBase(
  fileName: string,
  preferredExtension?: string,
) {
  const { baseName } = splitMaterialFileName(fileName, preferredExtension);

  return baseName.trim().length > 0;
}

function extractMaterialFileExtension(fileName: string) {
  const normalizedFileName = fileName.trim();
  const index = normalizedFileName.lastIndexOf(".");

  if (index <= 0 || index === normalizedFileName.length - 1) {
    return "";
  }

  return normalizeMaterialFileExtension(normalizedFileName.slice(index + 1));
}
