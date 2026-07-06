import {
  buildMaterialImageContentJson,
  MATERIAL_COLLECTION_BIZ_TYPE,
  MATERIAL_COLLECTION_SOURCE_TYPE,
  resolveMaterialImageCollectFields,
  type KbAttachmentImageMaterialCreateRequest,
  type KbAttachmentType,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError } from "../../shared/errors.js";
import {
  mapMaterialCollectionItem,
  type MaterialCollectionRow,
} from "../chat/material-collection-mappers.js";
import {
  mapMaterialItemToKbAttachmentContent,
} from "./kb-attachment-mappers.js";
import {
  parseKbAttachmentMaterialId,
  resolveMaterialBizTypeForKbAttachment,
} from "./kb-attachment-material-utils.js";

const BIZ_STATUS_ACTIVE = 1;

export async function findKbAttachmentMaterialsByIds(
  db: Kysely<Database>,
  uid: number,
  materialIds: number[],
) {
  const uniqueIds = [...new Set(materialIds.filter((id) => id > 0))];

  if (uniqueIds.length === 0) {
    return new Map<number, MaterialCollectionRow>();
  }

  const rows = await db
    .selectFrom("xy_wap_embed_material_collection")
    .selectAll()
    .where("uid", "=", uid)
    .where("biz_status", "=", BIZ_STATUS_ACTIVE)
    .where("id", "in", uniqueIds)
    .execute();

  return new Map(
    rows.map((row) => [Number(row.id), row as MaterialCollectionRow]),
  );
}

export async function requireKbAttachmentMaterial(
  db: Kysely<Database>,
  uid: number,
  materialCollectionId: string,
  attachmentType: KbAttachmentType,
) {
  const materialId = parseKbAttachmentMaterialId(materialCollectionId);

  if (materialId == null) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "素材不存在");
  }

  const materialMap = await findKbAttachmentMaterialsByIds(db, uid, [materialId]);
  const materialRow = materialMap.get(materialId);

  if (!materialRow) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "素材不存在");
  }

  const expectedBizType = resolveMaterialBizTypeForKbAttachment(attachmentType);
  const actualBizType = Number(materialRow.biz_type);

  if (actualBizType !== expectedBizType) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "素材类型不匹配");
  }

  const materialItem = mapMaterialCollectionItem(materialRow);
  const attachmentContent = mapMaterialItemToKbAttachmentContent(materialItem);

  if (!attachmentContent) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "素材数据不完整");
  }

  return {
    attachmentContent,
    materialId,
    materialItem,
  };
}

export async function createKbAttachmentImageMaterial(
  db: Kysely<Database>,
  input: {
    opSubUserId: string;
    request: KbAttachmentImageMaterialCreateRequest;
    subUserNumericId: number;
    uid: number;
  },
) {
  const opSubUserNumericId = parseSubUserId(input.opSubUserId);
  const fileUrl = input.request.fileUrl.trim();
  const resolved = resolveMaterialImageCollectFields(JSON.stringify({ fileUrl }));

  if ("errorMsg" in resolved) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", resolved.errorMsg);
  }

  const content = buildMaterialImageContentJson(null, resolved);
  const sort = Date.now();

  const result = await db
    .insertInto("xy_wap_embed_material_collection")
    .values({
      biz_status: BIZ_STATUS_ACTIVE,
      biz_type: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
      content,
      group_id: 0,
      msg_info_id: 0,
      op_sub_uid: opSubUserNumericId,
      sort,
      source_type: MATERIAL_COLLECTION_SOURCE_TYPE.KNOWLEDGE_BASE,
      sub_uid: 0,
      title: input.request.alt?.trim() || "图片",
      uid: input.uid,
    })
    .executeTakeFirstOrThrow();

  const insertedId = Number(result.insertId);

  if (!Number.isSafeInteger(insertedId) || insertedId <= 0) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "创建素材失败");
  }

  return {
    materialCollectionId: String(insertedId),
  };
}

function parseSubUserId(subUserId: string) {
  const parsed = Number(subUserId.trim());

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "操作人无效");
  }

  return parsed;
}
