import type {
  WorkbenchMaterialCollectionGroupDto,
  WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import { MATERIAL_COLLECTION_GROUP_MAX_COUNT } from "@chatai/contracts";

export type MaterialCollectionGroup = WorkbenchMaterialCollectionGroupDto;
export type MaterialCollectionItem = WorkbenchMaterialCollectionItemDto;

export function isMaterialCollectionGroupLimitReached(groupCount: number) {
  return groupCount >= MATERIAL_COLLECTION_GROUP_MAX_COUNT;
}
