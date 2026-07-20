import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type AiHostingAgentTestAttachmentMaterial,
  type AiHostingAgentTestReplyItem,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import {
  mapMaterialCollectionItem,
  type MaterialCollectionRow,
} from "../chat/material-collection-mappers.js";
import { findKbAttachmentMaterialsByIds } from "./kb-attachment-material.repository.js";

const dbActiveStatus = 1;

const SUPPORTED_ATTACHMENT_BIZ_TYPES = new Set<number>([
  MATERIAL_COLLECTION_BIZ_TYPE.FILE,
  MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
  MATERIAL_COLLECTION_BIZ_TYPE.H5,
  MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
]);

export async function hydrateAgentTestAttachmentReplies(
  db: Kysely<Database>,
  uid: number,
  reply: AiHostingAgentTestReplyItem[],
): Promise<AiHostingAgentTestReplyItem[]> {
  const attachmentChunkIds = [
    ...new Set(
      reply.flatMap((item) => (item.type === "attachment" ? [Number(item.chunkId)] : [])),
    ),
  ].filter((chunkId) => Number.isSafeInteger(chunkId) && chunkId > 0);

  if (attachmentChunkIds.length === 0) {
    return reply;
  }

  const chunkRows = await db
    .selectFrom("xy_wap_embed_agent_kb_chunk")
    .select(["id", "attachment_ids"])
    .where("uid", "=", uid)
    .where("status", "=", dbActiveStatus)
    .where("id", "in", attachmentChunkIds)
    .execute();

  const materialIdsByChunkId = new Map<number, number[]>();
  const allMaterialIds: number[] = [];

  for (const row of chunkRows) {
    const materialIds = parseAttachmentIds(row.attachment_ids);
    materialIdsByChunkId.set(Number(row.id), materialIds);
    allMaterialIds.push(...materialIds);
  }

  const materialById = await findKbAttachmentMaterialsByIds(db, uid, allMaterialIds);
  const hydrated: AiHostingAgentTestReplyItem[] = [];

  for (const item of reply) {
    if (item.type !== "attachment") {
      hydrated.push(item);
      continue;
    }

    const chunkId = Number(item.chunkId);
    const materialIds = materialIdsByChunkId.get(chunkId) ?? [];
    const attachments = materialIds.flatMap((materialId) => {
      const material = materialById.get(materialId);
      if (!material) {
        return [];
      }

      const attachment = mapMaterialToTestAttachment(material);
      return attachment ? [attachment] : [];
    });

    if (attachments.length === 0) {
      continue;
    }

    hydrated.push({
      type: "attachment",
      chunkId: item.chunkId,
      attachments,
    });
  }

  return hydrated;
}

export function parseAttachmentIds(value: string | null | undefined): number[] {
  if (!value?.trim()) {
    return [];
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return normalizePositiveIds(parsed);
      }
    } catch {
      // Fall through to comma-separated parsing.
    }
  }

  return normalizePositiveIds(trimmed.split(/[,，\s]+/));
}

function mapMaterialToTestAttachment(
  material: MaterialCollectionRow,
): AiHostingAgentTestAttachmentMaterial | undefined {
  if (!SUPPORTED_ATTACHMENT_BIZ_TYPES.has(Number(material.biz_type))) {
    return undefined;
  }

  const type = mapBizTypeToAttachmentType(Number(material.biz_type));
  if (!type) {
    return undefined;
  }

  const materialItem = mapMaterialCollectionItem(material);
  const resolvedTitle =
    materialItem.title.trim()
    || material.title?.trim()
    || defaultTitleForAttachmentType(type);

  return {
    type,
    title: resolvedTitle,
    content: materialItem.content,
  };
}

function mapBizTypeToAttachmentType(
  bizType: number,
): AiHostingAgentTestAttachmentMaterial["type"] | undefined {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
      return "image";
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return "file";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "link";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "mini-program";
    default:
      return undefined;
  }
}

function defaultTitleForAttachmentType(
  type: AiHostingAgentTestAttachmentMaterial["type"],
) {
  switch (type) {
    case "image":
      return "图片";
    case "file":
      return "文件";
    case "link":
      return "链接";
    case "mini-program":
      return "小程序";
  }
}

function normalizePositiveIds(values: unknown[]) {
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const value of values) {
    const id =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value.trim())
          : Number.NaN;

    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}
