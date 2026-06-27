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
import type { AgentKbJavaClient } from "./agent-kb-java-client.js";
import { createAgentKbJavaClient } from "./agent-kb-java-client.js";
import { mapJavaChunkPageItem } from "./kb-chunk-java-mappers.js";
import {
  mapDocType,
  mapDocTypeToDb,
  mapKbDocDetail,
  mapKbDocListItem,
  mapKbListItem,
} from "./kb-read-mappers.js";
import { type AgentKbTenant, parsePositiveInteger } from "./kb-tenant-utils.js";
import { buildContainsLikePattern } from "./sql-like-utils.js";

const dbActiveStatus = 1;
const defaultPage = 1;
const defaultPageSize = 10;
const maxPageSize = 100;
const maxKbListPageSize = 200;

export class KbReadService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly agentKbJavaClient: AgentKbJavaClient,
  ) {}

  async listKbs(
    tenant: AgentKbTenant,
    options: { page?: number; pageSize?: number; query?: string } = {},
  ): Promise<KbListResponse> {
    const uid = tenant.uid;
    const pagination = normalizePagination(options, maxKbListPageSize);
    const normalizedQuery = options.query?.trim();

    let query = this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .selectAll()
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus);

    if (normalizedQuery) {
      query = query.where("name", "like", buildContainsLikePattern(normalizedQuery));
    }

    const [rows, total] = await Promise.all([
      query
        .orderBy("id", "desc")
        .limit(pagination.pageSize)
        .offset((pagination.page - 1) * pagination.pageSize)
        .execute(),
      this.countKbs(uid, normalizedQuery),
    ]);

    return {
      kbs: rows.map(mapKbListItem),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
      },
    };
  }

  async getKb(tenant: AgentKbTenant, kbId: string): Promise<KbListResponse["kbs"][number]> {
    const uid = tenant.uid;
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
    tenant: AgentKbTenant,
    kbId: string,
    options: {
      docType?: KbDocType;
      page?: number;
      pageSize?: number;
      query?: string;
    } = {},
  ): Promise<KbDocListResponse> {
    const uid = tenant.uid;
    const kbNumericId = parsePositiveInteger(kbId);

    if (kbNumericId == null) {
      throw new NotFoundError("KB_NOT_FOUND", "知识库不存在");
    }

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
      query = query.where("name", "like", buildContainsLikePattern(normalizedQuery));
    }

    const [rows, total] = await Promise.all([
      query
        .orderBy("id", "desc")
        .limit(pagination.pageSize)
        .offset((pagination.page - 1) * pagination.pageSize)
        .execute(),
      this.countKbDocs(uid, kbNumericId, normalizedQuery, options.docType),
    ]);

    return {
      docs: rows.map(mapKbDocListItem),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
      },
    };
  }

  async getKbDoc(tenant: AgentKbTenant, docId: string): Promise<KbDocDetail> {
    const uid = tenant.uid;
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
    tenant: AgentKbTenant,
    docId: string,
    options: { page?: number; pageSize?: number; title?: string } = {},
  ): Promise<KbChunkListResponse> {
    const uid = tenant.uid;
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
    const normalizedTitle = options.title?.trim();

    const response = await this.agentKbJavaClient.listKbChunks({
      docId: docNumericId,
      page: pagination.page,
      pageSize: pagination.pageSize,
      title: normalizedTitle,
      uid,
    });

    const chunks = response.list.map((item) => mapJavaChunkPageItem(item, docType));

    return {
      chunks,
      pagination: {
        page: response.page,
        pageSize: response.pageSize,
        total: response.count,
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
      countQuery = countQuery.where("name", "like", buildContainsLikePattern(query));
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
      countQuery = countQuery.where("name", "like", buildContainsLikePattern(query));
    }

    const result = await countQuery.executeTakeFirst();

    return Number(result?.total ?? 0);
  }

}

export function createKbReadService(db: Kysely<Database>, logger?: RequestAwareLogger) {
  return new KbReadService(db, createAgentKbJavaClient(logger));
}

function normalizePagination(input: { page?: number; pageSize?: number }, maxSize = maxPageSize) {
  const page =
    Number.isInteger(input.page) && input.page && input.page > 0 ? input.page : defaultPage;
  const pageSize =
    Number.isInteger(input.pageSize) && input.pageSize && input.pageSize > 0
      ? Math.min(input.pageSize, maxSize)
      : defaultPageSize;

  return { page, pageSize };
}
