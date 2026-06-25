import type {
  KbChunkListResponse,
  KbDocDetail,
  KbDocListResponse,
  KbDocType,
  KbListResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { NotFoundError } from "../../shared/errors.js";
import type { RequestAwareLogger } from "../../shared/logger.js";
import {
  mapDocType,
  mapDocTypeToDb,
  mapKbChunkListItem,
  mapKbDocDetail,
  mapKbDocListItem,
  mapKbListItem,
} from "./kb-read-mappers.js";
import { parsePositiveInteger, resolveAgentKbUid } from "./kb-tenant-utils.js";

const dbActiveStatus = 1;
const defaultPage = 1;
const defaultPageSize = 10;
const maxPageSize = 100;

export class KbReadService {
  constructor(private readonly db: Kysely<Database>) {}

  async listKbs(
    subUserId: string,
    options: { page?: number; pageSize?: number; query?: string } = {},
  ): Promise<KbListResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const pagination = normalizePagination(options);
    const normalizedQuery = options.query?.trim();

    let query = this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .selectAll()
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus);

    if (normalizedQuery) {
      query = query.where((eb) =>
        eb.or([
          eb("name", "like", `%${normalizedQuery}%`),
          eb("remark", "like", `%${normalizedQuery}%`),
        ]),
      );
    }

    const rows = await query
      .orderBy("update_time", "desc")
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize)
      .execute();

    return {
      kbs: rows.map(mapKbListItem),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: await this.countKbs(uid, normalizedQuery),
      },
    };
  }

  async getKb(subUserId: string, kbId: string): Promise<KbListResponse["kbs"][number]> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const kbNumericId = parsePositiveInteger(kbId);

    if (kbNumericId == null) {
      throw new NotFoundError("KB_NOT_FOUND", "知识库不存在");
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .selectAll()
      .where("id", "=", kbNumericId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError("KB_NOT_FOUND", "知识库不存在");
    }

    return mapKbListItem(row);
  }

  async listKbDocs(
    subUserId: string,
    kbId: string,
    options: {
      docType?: KbDocType;
      page?: number;
      pageSize?: number;
      query?: string;
    } = {},
  ): Promise<KbDocListResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const kbNumericId = parsePositiveInteger(kbId);

    if (kbNumericId == null) {
      throw new NotFoundError("KB_NOT_FOUND", "知识库不存在");
    }

    await this.assertKbExists(uid, kbNumericId);

    const pagination = normalizePagination(options);
    const normalizedQuery = options.query?.trim();

    let query = this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .selectAll()
      .where("uid", "=", uid)
      .where("kb_id", "=", kbNumericId)
      .where("status", "=", dbActiveStatus);

    if (options.docType) {
      query = query.where("doc_type", "=", mapDocTypeToDb(options.docType));
    }

    if (normalizedQuery) {
      query = query.where("name", "like", `%${normalizedQuery}%`);
    }

    const rows = await query
      .orderBy("update_time", "desc")
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize)
      .execute();

    return {
      docs: rows.map(mapKbDocListItem),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: await this.countKbDocs(uid, kbNumericId, normalizedQuery, options.docType),
      },
    };
  }

  async getKbDoc(subUserId: string, docId: string): Promise<KbDocDetail> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const docNumericId = parsePositiveInteger(docId);

    if (docNumericId == null) {
      throw new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
    }

    const row = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .selectAll()
      .where("id", "=", docNumericId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
    }

    return mapKbDocDetail(row);
  }

  async listKbDocChunks(
    subUserId: string,
    docId: string,
    options: { page?: number; pageSize?: number; query?: string } = {},
  ): Promise<KbChunkListResponse> {
    const uid = await resolveAgentKbUid(this.db, subUserId);
    const docNumericId = parsePositiveInteger(docId);

    if (docNumericId == null) {
      throw new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
    }

    const doc = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(["doc_type", "id"])
      .where("id", "=", docNumericId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!doc) {
      throw new NotFoundError("KB_DOC_NOT_FOUND", "知识不存在");
    }

    const docType = mapDocType(doc.doc_type);
    const pagination = normalizePagination(options);
    const normalizedQuery = options.query?.trim();

    let query = this.db
      .selectFrom("xy_wap_embed_agent_kb_chunk")
      .selectAll()
      .where("uid", "=", uid)
      .where("doc_id", "=", docNumericId)
      .where("status", "=", dbActiveStatus);

    if (normalizedQuery) {
      query = query.where((eb) =>
        eb.or([
          eb("title", "like", `%${normalizedQuery}%`),
          eb("content", "like", `%${normalizedQuery}%`),
        ]),
      );
    }

    const rows = await query
      .orderBy("update_time", "desc")
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize)
      .execute();

    return {
      chunks: rows.map((row) => mapKbChunkListItem(row, docType)),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: await this.countKbDocChunks(uid, docNumericId, normalizedQuery),
      },
    };
  }

  private async countKbs(uid: number, query?: string) {
    let countQuery = this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus);

    if (query) {
      countQuery = countQuery.where((eb) =>
        eb.or([eb("name", "like", `%${query}%`), eb("remark", "like", `%${query}%`)]),
      );
    }

    const result = await countQuery.executeTakeFirst();

    return Number(result?.total ?? 0);
  }

  private async countKbDocChunks(uid: number, docId: number, query?: string) {
    let countQuery = this.db
      .selectFrom("xy_wap_embed_agent_kb_chunk")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("uid", "=", uid)
      .where("doc_id", "=", docId)
      .where("status", "=", dbActiveStatus);

    if (query) {
      countQuery = countQuery.where((eb) =>
        eb.or([eb("title", "like", `%${query}%`), eb("content", "like", `%${query}%`)]),
      );
    }

    const result = await countQuery.executeTakeFirst();

    return Number(result?.total ?? 0);
  }

  private async countKbDocs(
    uid: number,
    kbId: number,
    query?: string,
    docType?: KbDocType,
  ) {
    let countQuery = this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("uid", "=", uid)
      .where("kb_id", "=", kbId)
      .where("status", "=", dbActiveStatus);

    if (docType) {
      countQuery = countQuery.where("doc_type", "=", mapDocTypeToDb(docType));
    }

    if (query) {
      countQuery = countQuery.where("name", "like", `%${query}%`);
    }

    const result = await countQuery.executeTakeFirst();

    return Number(result?.total ?? 0);
  }

  private async assertKbExists(uid: number, kbId: number) {
    const row = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select(["id"])
      .where("id", "=", kbId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError("KB_NOT_FOUND", "知识库不存在");
    }
  }
}

export function createKbReadService(db: Kysely<Database>, _logger?: RequestAwareLogger) {
  return new KbReadService(db);
}

function normalizePagination(input: { page?: number; pageSize?: number }) {
  const page =
    Number.isInteger(input.page) && input.page && input.page > 0 ? input.page : defaultPage;
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize && input.pageSize > 0
      ? Math.min(input.pageSize, maxPageSize)
      : defaultPageSize;

  return { page, pageSize };
}
