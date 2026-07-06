import type {
  WorkbenchMaterialCollectionGroupDto,
  WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import { canEditMaterialCollectionItem, MATERIAL_COLLECTION_GROUP_MAX_COUNT, readMaterialDescription } from "@chatai/contracts";
import type { MaterialContentFormValues } from "@/pages/chat/components/material-collection/material-content-form-fields";
import { resolveMaterialFileExtension } from "@/pages/chat/components/material-collection/material-file-name";

export type MaterialCollectionGroup = WorkbenchMaterialCollectionGroupDto;
export type MaterialCollectionItem = WorkbenchMaterialCollectionItemDto;

export function isMaterialCollectionGroupLimitReached(groupCount: number) {
  return groupCount >= MATERIAL_COLLECTION_GROUP_MAX_COUNT;
}

export function canEditMaterialItem(item: MaterialCollectionItem) {
  return canEditMaterialCollectionItem(item.bizType);
}

export function getMaterialContentFormValues(
  item: MaterialCollectionItem,
): MaterialContentFormValues {
  if (item.contentType === "file") {
    const fileName = readString(item.content.fileName) || item.title;

    return {
      description: "",
      fileExtension: resolveMaterialFileExtension(
        fileName,
        readString(item.content.extension),
      ),
      fileName,
      title: "",
    };
  }

  if (item.contentType === "h5") {
    const contentRecord =
      typeof item.content === "object" &&
      item.content !== null &&
      !Array.isArray(item.content)
        ? (item.content as Record<string, unknown>)
        : {};

    return {
      description: readMaterialDescription(contentRecord),
      fileExtension: "",
      fileName: "",
      title: readString(item.content.title) || item.title,
    };
  }

  if (item.contentType === "mini-program") {
    return {
      description: "",
      fileExtension: "",
      fileName: "",
      title: readString(item.content.title) || item.title,
    };
  }

  if (item.contentType === "video") {
    return {
      description: "",
      fileExtension: "",
      fileName: "",
      title: item.title,
    };
  }

  return {
    description: "",
    fileExtension: "",
    fileName: "",
    title: "",
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
