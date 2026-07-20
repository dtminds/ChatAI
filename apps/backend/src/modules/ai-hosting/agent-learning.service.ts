import type {
  AiHostingLearningCandidateApproveRequest,
  AiHostingLearningCandidateBatchApproveRequest,
  AiHostingLearningCandidateBatchApproveResponse,
  AiHostingLearningCandidateBatchRejectRequest,
  AiHostingLearningCandidateBatchRejectResponse,
  AiHostingLearningCandidateItem,
  AiHostingLearningCandidateListResponse,
  AiHostingLearningCandidateRejectRequest,
  AiHostingLearningCandidateSearchDetailItem,
  AiHostingLearningCandidateSearchDetailResponse,
  AiHostingLearningCandidateStatus,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import {
  createAgentLearningJavaClient,
  type AgentLearningJavaClient,
  type AgentLearningJavaListItem,
  type AgentLearningJavaSearchDetailItem,
} from "./agent-learning-java-client.js";
import { normalizeIdList, parseMySqlId } from "./ai-hosting-id-utils.js";

type AgentWriteContext = {
  operatorSubUserId: string;
  uid: number;
};

const dbActiveStatus = 1;
const defaultPage = 1;
const defaultPageSize = 10;
const maxPageSize = 100;

const statusToDb: Record<AiHostingLearningCandidateStatus, number> = {
  adopted: 1,
  filtered: 3,
  ignored: 2,
  pending: 0,
};

const dbToStatus: Record<number, AiHostingLearningCandidateStatus> = {
  0: "pending",
  1: "adopted",
  2: "ignored",
  3: "filtered",
};

export class AgentLearningService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly javaClient: AgentLearningJavaClient,
  ) {}

  async listCandidates(
    uid: number,
    agentId: string,
    options: {
      page?: number;
      pageSize?: number;
      status: AiHostingLearningCandidateStatus;
    },
  ): Promise<AiHostingLearningCandidateListResponse> {
    const numericAgentId = parseMySqlId(agentId);
    const pagination = normalizePagination(options);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    await this.assertAgentInScope(uid, numericAgentId);
    const result = await this.javaClient.list({
      agentId: numericAgentId,
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: statusToDb[options.status],
      uid,
    });

    return {
      candidates: result.items
        .map((item) => mapCandidateItem(item))
        .filter((item): item is AiHostingLearningCandidateItem => item != null),
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    };
  }

  async getSearchDetail(
    uid: number,
    agentId: string,
    candidateId: string,
  ): Promise<AiHostingLearningCandidateSearchDetailResponse> {
    const numericAgentId = parseMySqlId(agentId);
    const numericCandidateId = parseMySqlId(candidateId);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (numericCandidateId == null) {
      throw new BadRequestError("INVALID_CANDIDATE", "优化建议不存在");
    }

    await this.assertAgentInScope(uid, numericAgentId);
    await this.assertCandidatesInScope(uid, numericAgentId, [candidateId]);
    const result = await this.javaClient.searchDetail({ id: numericCandidateId, uid });

    return {
      items: result.items
        .map(mapSearchDetailItem)
        .filter((item): item is AiHostingLearningCandidateSearchDetailItem => item != null),
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  async approve(
    context: AgentWriteContext,
    agentId: string,
    candidateId: string,
    payload: AiHostingLearningCandidateApproveRequest,
  ) {
    const { numericAgentId, normalizedCandidateId, operatorId } = this.parseWriteIds(
      context,
      agentId,
      candidateId,
    );
    const targetKbId = parseMySqlId(payload.targetKbId);
    const targetDocId = parseMySqlId(payload.targetDocId);
    const question = payload.question.trim();
    const answer = payload.answer.trim();

    if (targetKbId == null || targetDocId == null) {
      throw new BadRequestError("INVALID_TARGET", "请选择有效的知识库和知识");
    }

    if (!question || !answer) {
      throw new BadRequestError("INVALID_CANDIDATE_CONTENT", "问题和答案不能为空");
    }

    await this.assertAgentInScope(context.uid, numericAgentId);
    await this.assertCandidatesInScope(context.uid, numericAgentId, [normalizedCandidateId]);
    await this.assertKbDocInScope(context.uid, targetKbId, targetDocId);
    await this.javaClient.approve({
      answer,
      id: normalizedCandidateId,
      operatorId,
      question,
      targetDocId,
      targetKbId,
      uid: context.uid,
    });

    return { ok: true as const };
  }

  async reject(
    context: AgentWriteContext,
    agentId: string,
    candidateId: string,
    payload: AiHostingLearningCandidateRejectRequest,
  ) {
    const { numericAgentId, normalizedCandidateId, operatorId } = this.parseWriteIds(
      context,
      agentId,
      candidateId,
    );

    await this.assertAgentInScope(context.uid, numericAgentId);
    await this.assertCandidatesInScope(context.uid, numericAgentId, [normalizedCandidateId]);
    await this.javaClient.reject({
      id: normalizedCandidateId,
      operatorId,
      uid: context.uid,
      userReason: payload.userReason,
    });

    return { ok: true as const };
  }

  async batchApprove(
    context: AgentWriteContext,
    agentId: string,
    payload: AiHostingLearningCandidateBatchApproveRequest,
  ): Promise<AiHostingLearningCandidateBatchApproveResponse> {
    const numericAgentId = parseMySqlId(agentId);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const targetKbId = parseMySqlId(payload.targetKbId);
    const targetDocId = parseMySqlId(payload.targetDocId);
    const ids = normalizeCandidateIds(payload.ids);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (targetKbId == null || targetDocId == null) {
      throw new BadRequestError("INVALID_TARGET", "请选择有效的知识库和知识");
    }

    if (!ids || ids.length === 0) {
      throw new BadRequestError("INVALID_CANDIDATE", "请选择优化建议");
    }

    await this.assertAgentInScope(context.uid, numericAgentId);
    await this.assertCandidatesInScope(context.uid, numericAgentId, ids);
    await this.assertKbDocInScope(context.uid, targetKbId, targetDocId);
    const result = await this.javaClient.batchApprove({
      ids,
      operatorId,
      targetDocId,
      targetKbId,
      uid: context.uid,
    });

    return {
      failDetails: result.failDetails.map((item) => ({
        error: item.error,
        id: String(item.id),
      })),
      successCount: result.successCount,
    };
  }

  async batchReject(
    context: AgentWriteContext,
    agentId: string,
    payload: AiHostingLearningCandidateBatchRejectRequest,
  ): Promise<AiHostingLearningCandidateBatchRejectResponse> {
    const numericAgentId = parseMySqlId(agentId);
    const operatorId = parseMySqlId(context.operatorSubUserId);
    const ids = normalizeCandidateIds(payload.ids);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    if (!ids || ids.length === 0) {
      throw new BadRequestError("INVALID_CANDIDATE", "请选择优化建议");
    }

    await this.assertAgentInScope(context.uid, numericAgentId);
    await this.assertCandidatesInScope(context.uid, numericAgentId, ids);
    const updatedCount = await this.javaClient.batchReject({
      ids,
      operatorId,
      uid: context.uid,
      userReason: payload.userReason,
    });

    return { updatedCount };
  }

  private parseWriteIds(context: AgentWriteContext, agentId: string, candidateId: string) {
    const numericAgentId = parseMySqlId(agentId);
    const normalizedCandidateId = candidateId.trim();
    const operatorId = parseMySqlId(context.operatorSubUserId);

    if (numericAgentId == null) {
      throw new BadRequestError("INVALID_AGENT", "Agent 不存在");
    }

    if (!normalizedCandidateId) {
      throw new BadRequestError("INVALID_CANDIDATE", "优化建议不存在");
    }

    if (operatorId == null) {
      throw new BadRequestError("INVALID_SUB_ACCOUNT", "当前账号无效");
    }

    return { numericAgentId, normalizedCandidateId, operatorId };
  }

  private async assertAgentInScope(uid: number, agentId: number) {
    const agent = await this.db
      .selectFrom("xy_wap_embed_agent")
      .select("id")
      .where("id", "=", agentId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!agent) {
      throw new NotFoundError("AGENT_NOT_FOUND", "Agent 不存在");
    }
  }

  private async assertCandidatesInScope(uid: number, agentId: number, candidateIds: string[]) {
    const numericCandidateIds = normalizeIdList(candidateIds);

    if (!numericCandidateIds || numericCandidateIds.length !== candidateIds.length) {
      throw new BadRequestError("INVALID_CANDIDATE", "优化建议不存在");
    }

    const candidates = await this.db
      .selectFrom("xy_wap_embed_agent_kb_learning_candidate")
      .select("id")
      .where("id", "in", numericCandidateIds)
      .where("uid", "=", uid)
      .where("agent_id", "=", agentId)
      .execute();

    if (candidates.length !== numericCandidateIds.length) {
      throw new BadRequestError("INVALID_CANDIDATE", "优化建议不存在");
    }
  }

  private async assertKbDocInScope(uid: number, kbId: number, docId: number) {
    const doc = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select("id")
      .where("id", "=", docId)
      .where("kb_id", "=", kbId)
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    if (!doc) {
      throw new BadRequestError("INVALID_TARGET", "请选择有效的知识库和知识");
    }
  }
}

export function createAgentLearningService(
  db: Kysely<Database>,
  logger?: AppLogger | RequestAwareLogger,
) {
  return new AgentLearningService(db, createAgentLearningJavaClient(logger));
}

function mapCandidateItem(item: AgentLearningJavaListItem): AiHostingLearningCandidateItem | null {
  const id = normalizeCandidateId(item.id);

  if (!id) {
    return null;
  }

  const status = dbToStatus[Number(item.status)] ?? "pending";

  return {
    answer: item.suggestedAnswer?.trim() ?? "",
    confidence: normalizeConfidence(item.confidence),
    createdAt: toOptionalTimestamp(item.createTime),
    id,
    question: item.suggestedQuestion?.trim() ?? "",
    rationale: resolveRationale(status, item.aiReason, item.userReason),
    searchResults: normalizeSearchResults(item.searchResults),
    seat: normalizePerson(item.seat),
    status,
    targetDocId: normalizeOptionalId(item.targetDocId),
    targetEntryId: normalizeOptionalId(item.targetEntryId),
    targetKbId: normalizeOptionalId(item.targetKbId),
    user: normalizePerson(item.user),
  };
}

function mapSearchDetailItem(
  item: AgentLearningJavaSearchDetailItem,
): AiHostingLearningCandidateSearchDetailItem | null {
  const chunkId = normalizeOptionalId(item.chunkId);
  const docId = normalizeOptionalId(item.docId);
  const kbId = normalizeOptionalId(item.kbId);
  const score = normalizeConfidence(item.score);

  if (!chunkId || !docId || !kbId || score == null) {
    return null;
  }

  return {
    chunkId,
    chunkTitle: item.chunkTitle?.trim() ?? "",
    content: item.content?.trim() ?? "",
    docId,
    docName: item.docName?.trim() ?? "",
    docSuffix: item.docSuffix?.trim() ?? "",
    docType: Number.isFinite(Number(item.docType)) ? Number(item.docType) : 0,
    kbId,
    kbName: item.kbName?.trim() ?? "",
    score,
    volcChunkId: item.volcChunkId?.trim() ?? "",
  };
}

function normalizeConfidence(value: unknown) {
  if (
    value == null ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    return undefined;
  }

  const normalized = typeof value === "number" ? value : Number(value);

  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeOptionalId(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") {
    return undefined;
  }

  const normalized = String(value).trim();

  return /^\d+$/.test(normalized) ? normalized : undefined;
}

function normalizeSearchResults(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const results = value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const kbId = normalizeOptionalId(record.kbId);
    const docId = normalizeOptionalId(record.docId);
    const docName = typeof record.docName === "string" ? record.docName.trim() : "";
    const docSuffix = typeof record.docSuffix === "string" ? record.docSuffix.trim() : "";
    const key = `${kbId}:${docId}`;

    if (!kbId || !docId || !docName || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [{ docId, docName, docSuffix, kbId }];
  });

  return results.length > 0 ? results : undefined;
}

function normalizePerson(person: unknown): { avatar?: string; id?: string; name?: string } | undefined {
  if (!person || typeof person !== "object") {
    return undefined;
  }

  const { avatar, id, name } = person as Record<string, unknown>;
  const normalizedAvatar = typeof avatar === "string" ? avatar.trim() : undefined;
  const normalizedId = typeof id === "string" ? id.trim() : undefined;
  const normalizedName = typeof name === "string" ? name.trim() : undefined;

  if (!normalizedAvatar && !normalizedId && !normalizedName) {
    return undefined;
  }

  return {
    avatar: normalizedAvatar,
    id: normalizedId,
    name: normalizedName,
  };
}

function resolveRationale(
  status: AiHostingLearningCandidateStatus,
  aiReason: string | null | undefined,
  userReason: string | null | undefined,
) {
  const normalizedAiReason = aiReason?.trim() ?? "";
  const normalizedUserReason = userReason?.trim() ?? "";

  if (status === "ignored") {
    return normalizedUserReason || normalizedAiReason;
  }

  return normalizedAiReason;
}

function normalizePagination(options: { page?: number; pageSize?: number }) {
  const page =
    typeof options.page === "number" && Number.isSafeInteger(options.page) && options.page > 0
      ? options.page
      : defaultPage;
  const pageSize =
    typeof options.pageSize === "number" &&
    Number.isSafeInteger(options.pageSize) &&
    options.pageSize > 0
      ? Math.min(options.pageSize, maxPageSize)
      : defaultPageSize;

  return { page, pageSize };
}

function normalizeCandidateIds(ids: string[]) {
  const numericIds = normalizeIdList(ids.map((id) => id.trim()));
  return numericIds?.map(String) ?? null;
}

function normalizeCandidateId(value: string | number | null | undefined) {
  const candidateId = parseMySqlId(value);
  return candidateId == null ? null : String(candidateId);
}

function toOptionalTimestamp(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);

    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}
