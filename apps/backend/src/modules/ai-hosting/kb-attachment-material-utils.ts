import type { KbAttachmentType } from "@chatai/contracts";

export function resolveMaterialBizTypeForKbAttachment(
  attachmentType: KbAttachmentType,
): KbAttachmentType {
  return attachmentType;
}

export function parseKbAttachmentMaterialId(materialCollectionId: string) {
  const normalized = materialCollectionId.trim();
  const parsed = Number(normalized);

  if (!normalized || !Number.isSafeInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function readPrimaryKbAttachmentMaterialId(
  attachmentIds: number[] | null | undefined,
) {
  const firstId = attachmentIds?.[0];

  return firstId != null && Number.isSafeInteger(firstId) && firstId > 0
    ? firstId
    : undefined;
}

export function readPrimaryKbAttachmentType(
  attachmentTypes: number[] | null | undefined,
): KbAttachmentType | undefined {
  const firstType = attachmentTypes?.[0];

  if (
    firstType === 2
    || firstType === 3
    || firstType === 4
    || firstType === 6
    || firstType === 7
  ) {
    return firstType;
  }

  return undefined;
}
