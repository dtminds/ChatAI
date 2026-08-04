import type {
  AgentUserMemoryCustomerDetailResponse,
  AgentUserMemoryCustomerListResponse,
  AgentUserMemoryManualCreateRequest,
  AgentUserMemoryManualDeleteRequest,
  AgentUserMemoryManualUpdateRequest,
  AgentUserMemoryOverviewResponse,
  AgentUserMemoryRun,
  AgentUserMemoryRunDetailResponse,
  AgentUserMemoryRunListResponse,
  AgentUserMemorySettingsRequest,
} from "@chatai/contracts";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";
import type { Database, JsonValue } from "../../../db/schema.js";
import { BadRequestError, InternalServerError, NotFoundError } from "../../../shared/errors.js";
import type { WorkbenchService } from "../../chat/workbench.service.js";
import {
  createManualMemory,
  deleteManualMemory,
  emptyUserMemoryDocument,
  parseUserMemoryDocument,
  updateManualMemory,
  UserMemoryDomainError,
} from "./user-memory-domain.js";

const DEFAULT_CUSTOMER_LIMIT = 100;
const CANDIDATE_SESSION_MULTIPLIER = 2;
const MIN_CANDIDATE_SESSION_LIMIT = 200;
export const USER_MEMORY_SCHEDULE = "02:00" as const;
export const USER_MEMORY_TIMEZONE = "Asia/Shanghai" as const;
const SUPPORTED_CUSTOMER_LIMITS = new Set([100, 200, 500]);

export interface UserMemoryCustomerLimitResolver { resolve(uid: number): number }
export const DEFAULT_USER_MEMORY_CUSTOMER_LIMIT_RESOLVER: UserMemoryCustomerLimitResolver = { resolve: () => DEFAULT_CUSTOMER_LIMIT };

type CustomerKey = { platform: number; thirdExternalUserId: string };
type CustomerSummary = CustomerKey & { avatarUrl?: string; customerName: string };
type DbExecutor = Kysely<Database> | Transaction<Database>;

export class UserMemoryService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly workbenchService?: WorkbenchService,
    private readonly customerLimitResolver: UserMemoryCustomerLimitResolver = DEFAULT_USER_MEMORY_CUSTOMER_LIMIT_RESOLVER,
  ) {}

  async getOverview(uid: number, canViewWorkerObservability = false): Promise<AgentUserMemoryOverviewResponse> {
    const config = await this.getConfig(uid);
    const [activeRun, recentRun] = await Promise.all([
      config?.active_run_id ? this.getRunRow(uid, config.active_run_id) : undefined,
      this.db.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("uid", "=", uid).orderBy("id", "desc").executeTakeFirst(),
    ]);
    const customerLimit = resolveUserMemoryCustomerLimit(this.customerLimitResolver, uid);
    return {
      enabled: config?.enabled === 1,
      canViewWorkerObservability,
      schedule: USER_MEMORY_SCHEDULE,
      timezone: USER_MEMORY_TIMEZONE,
      executionMode: "sync",
      extractionInstruction: config?.extraction_instruction ?? "",
      customerLimit,
      ...(config?.next_run_at ? { nextRunAt: config.next_run_at.getTime() } : {}),
      ...(activeRun ? { activeRun: mapRun(activeRun) } : {}),
      ...(recentRun ? { recentRun: mapRun(recentRun) } : {}),
    };
  }

  async updateSettings(uid: number, settings: AgentUserMemorySettingsRequest, canViewWorkerObservability = false): Promise<AgentUserMemoryOverviewResponse> {
    await this.db.transaction().execute(async (trx) => {
      let config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", uid).forUpdate().executeTakeFirst();
      if (!config) {
        await trx.insertInto("xy_wap_embed_agent_user_memory_config").values({ uid })
          .onDuplicateKeyUpdate({ generation: sql<number>`generation` }).execute();
        config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", uid).forUpdate().executeTakeFirstOrThrow();
      }
      const currentEnabled = config.enabled === 1;
      const enabled = settings.enabled ?? currentEnabled;
      const currentInstruction = config.extraction_instruction ?? "";
      const extractionInstruction = settings.extractionInstruction === undefined
        ? currentInstruction
        : settings.extractionInstruction.trim();
      const enabledChanged = currentEnabled !== enabled;
      const instructionChanged = currentInstruction !== extractionInstruction;
      if (!enabledChanged && !instructionChanged) return;
      const now = Date.now();
      if (enabledChanged && !enabled && config.active_run_id) {
        await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({ status: "canceled", finished_at: new Date() }).where("run_id", "=", config.active_run_id).where("status", "in", ["prepared", "submitted"]).execute();
        const items = await trx.selectFrom("xy_wap_embed_agent_user_memory_run_item").select(["status"]).where("run_id", "=", config.active_run_id).execute();
        const counts = countUserMemoryRunItems(items);
        await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({
          status: "canceled", phase: "completed", success_count: counts.success, failure_count: counts.failure,
          skipped_count: counts.skipped, finished_at: new Date(), locked_by: null, claim_token: null, lease_until: null,
        }).where("id", "=", config.active_run_id).where("uid", "=", uid).execute();
      }
      await trx.updateTable("xy_wap_embed_agent_user_memory_config").set({
        ...(instructionChanged ? { extraction_instruction: extractionInstruction } : {}),
        ...(enabledChanged ? {
          enabled: enabled ? 1 : 0,
          generation: config.generation + 1,
          enabled_at: enabled ? now : null,
          next_run_at: enabled ? nextShanghaiRunAt(now) : null,
          active_run_id: null,
        } : {}),
      }).where("id", "=", config.id).executeTakeFirstOrThrow();
    });
    return this.getOverview(uid, canViewWorkerObservability);
  }

  async listRuns(uid: number, options: { cursor?: string; pageSize?: number }): Promise<AgentUserMemoryRunListResponse> {
    const limit = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const cursor = decodeIdCursor(options.cursor);
    let query = this.db.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("uid", "=", uid);
    if (cursor != null) query = query.where("id", "<", cursor);
    const rows = await query.orderBy("id", "desc").limit(limit + 1).execute();
    const items = rows.slice(0, limit);
    return { items: items.map(mapRun), ...(rows.length > limit && items.at(-1) ? { nextCursor: encodeIdCursor(items.at(-1)!.id) } : {}) };
  }

  async getRunDetail(uid: number, runId: number, options: { itemCursor?: string; itemPageSize?: number; status?: string }): Promise<AgentUserMemoryRunDetailResponse> {
    const run = await this.getRunRow(uid, runId);
    if (!run) throw new NotFoundError("AGENT_USER_MEMORY_RUN_NOT_FOUND", "运行不存在");
    const limit = Math.min(100, Math.max(1, options.itemPageSize ?? 20));
    const cursor = decodeIdCursor(options.itemCursor);
    let query = this.db.selectFrom("xy_wap_embed_agent_user_memory_run_item").selectAll().where("run_id", "=", runId).where("uid", "=", uid);
    if (cursor != null) query = query.where("id", "<", cursor);
    if (options.status) query = query.where("status", "=", options.status);
    const rows = await query.orderBy("id", "desc").limit(limit + 1).execute();
    const items = rows.slice(0, limit);
    return {
      run: mapRun(run),
      items: items.map((row) => ({
        id: row.id, platform: row.platform, thirdExternalUserId: row.third_external_userid,
        sessionCount: row.session_count, messageCount: row.message_count, status: row.status as never,
        attemptCount: row.attempt_count, inputTokens: row.input_tokens, outputTokens: row.output_tokens,
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
        ...(row.finished_at ? { finishedAt: row.finished_at.getTime() } : {}),
      })),
      ...(rows.length > limit && items.at(-1) ? { nextItemCursor: encodeIdCursor(items.at(-1)!.id) } : {}),
    };
  }

  async retryFailed(uid: number, runId: number) {
    return this.db.transaction().execute(async (trx) => {
      const config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", uid).forUpdate().executeTakeFirst();
      if (!config || config.enabled !== 1) throw new BadRequestError("AGENT_USER_MEMORY_DISABLED", "用户记忆功能未开启");
      if (config.active_run_id && config.active_run_id !== runId) throw new BadRequestError("AGENT_USER_MEMORY_RUN_ACTIVE", "当前存在其它活动运行");
      const run = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("uid", "=", uid).where("id", "=", runId).forUpdate().executeTakeFirst();
      if (!run || !["partial", "failed"].includes(run.status) || run.config_generation !== config.generation) throw new BadRequestError("AGENT_USER_MEMORY_RUN_NOT_RETRYABLE", "运行不可重试");
      const failed = await trx.selectFrom("xy_wap_embed_agent_user_memory_run_item").selectAll().where("run_id", "=", runId).where("status", "=", "failed").forUpdate().execute();
      const quotaDate = dateOnly(run.quota_date);
      const platforms = [...new Set(failed.map((item) => item.platform))];
      const externalIds = [...new Set(failed.map((item) => item.third_external_userid))];
      const memories = failed.length === 0 ? [] : await trx.selectFrom("xy_wap_embed_agent_user_memory")
        .select(["platform", "third_external_userid", "last_auto_quota_date"])
        .where("uid", "=", uid).where("platform", "in", platforms).where("third_external_userid", "in", externalIds).execute();
      const quotaByCustomer = new Map(memories.map((memory) => [customerKey(memory.platform, memory.third_external_userid), memory.last_auto_quota_date]));
      const skippedIds: number[] = [];
      const resetIds: number[] = [];
      for (const item of failed) {
        const lastQuotaDate = quotaByCustomer.get(customerKey(item.platform, item.third_external_userid));
        (lastQuotaDate && dateOnly(lastQuotaDate) > quotaDate ? skippedIds : resetIds).push(item.id);
      }
      if (skippedIds.length > 0) await trx.updateTable("xy_wap_embed_agent_user_memory_run_item")
        .set({ status: "skipped", last_error_code: "AGENT_USER_MEMORY_ITEM_SUPERSEDED", finished_at: new Date() })
        .where("id", "in", skippedIds).execute();
      if (resetIds.length > 0) await trx.updateTable("xy_wap_embed_agent_user_memory_run_item")
        .set({ status: "prepared", attempt_count: 0, next_attempt_at: null, last_error_code: null, finished_at: null })
        .where("id", "in", resetIds).execute();
      const resetCount = resetIds.length;
      const skippedCount = skippedIds.length;
      if (resetCount === 0) {
        if (skippedCount === 0) throw new BadRequestError("AGENT_USER_MEMORY_RUN_NOT_RETRYABLE", "运行没有可重试失败项");
        const items = await trx.selectFrom("xy_wap_embed_agent_user_memory_run_item").select(["status"]).where("run_id", "=", runId).execute();
        const counts = countUserMemoryRunItems(items);
        const status = resolveTerminalRunStatus(counts);
        await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({
          status, phase: "completed", success_count: counts.success, failure_count: counts.failure, skipped_count: counts.skipped,
          finished_at: new Date(), last_error_code: null, locked_by: null, claim_token: null, lease_until: null,
        }).where("id", "=", runId).execute();
        await trx.updateTable("xy_wap_embed_agent_user_memory_config").set({ active_run_id: null }).where("id", "=", config.id).where("active_run_id", "=", runId).execute();
        return { resetCount, skippedCount };
      }
      await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ status: "pending", phase: "inference", run_after: new Date(), finished_at: null, last_error_code: null, locked_by: null, claim_token: null, lease_until: null }).where("id", "=", runId).execute();
      await trx.updateTable("xy_wap_embed_agent_user_memory_config").set({ active_run_id: runId }).where("id", "=", config.id).execute();
      return { resetCount, skippedCount };
    });
  }

  async getEvidence(uid: number, subUserId: string, customer: CustomerSummary, itemId: number) {
    if (!this.workbenchService) throw new Error("Workbench service is required");
    const row = await this.getMemoryRow(this.db, uid, customer);
    const item = row ? readStoredUserMemoryDocument(row.memories_json).ai.find((entry) => entry.id === itemId) : undefined;
    if (!item) throw new NotFoundError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "记忆条目不存在");
    const session = await this.db.selectFrom("xy_wap_embed_logical_session").select(["conversation_id", "third_external_userid"]).where("uid", "=", uid).where("id", "=", item.sourceSessionId).executeTakeFirst();
    if (!session || session.third_external_userid !== customer.thirdExternalUserId) throw new NotFoundError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "记忆证据不存在");
    const page = await this.workbenchService.getMessagesBySeqs(subUserId, String(session.conversation_id), item.evidenceMessageIds);
    const messagesById = new Map(page.messages.map((message) => [message.seq, message]));
    const messages = item.evidenceMessageIds.flatMap((messageId) => {
      const message = messagesById.get(messageId);
      return message ? [{ content: summarizeEvidenceContent(message.content), messageId: message.seq, occurredAt: message.createdAt ?? 0, senderRole: message.senderType, sessionId: item.sourceSessionId }] : [];
    });
    if (messages.length === 0) throw new NotFoundError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "记忆证据不存在");
    return { messages };
  }

  async listCustomers(uid: number, platform: number, subUserId: string, roles: string[], options: { page?: number; pageSize?: number; query?: string }): Promise<AgentUserMemoryCustomerListResponse> {
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const requestedPage = Math.max(1, options.page ?? 1);
    const canViewAll = roles.includes("owner") || roles.includes("admin");
    const subUserNumericId = Number(subUserId);
    if (!canViewAll && (!Number.isSafeInteger(subUserNumericId) || subUserNumericId <= 0)) {
      return { items: [], page: 1, pageSize, total: 0 };
    }

    const keyword = options.query?.trim();
    const query = buildUserMemoryCustomerListQuery(this.db, {
      keyword,
      platform,
      subUserId: canViewAll ? undefined : subUserNumericId,
      uid,
    });

    const countRow = await query
      .select((eb) => eb.fn.countAll<number | string | bigint>().as("total"))
      .executeTakeFirst();
    const total = Number(countRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const rows = await query
      .select([
        "memory.id",
        "memory.platform",
        "memory.third_external_userid",
        "memory.memories_json",
        "memory.version",
        "memory.last_auto_updated_at",
        "memory.update_time",
        "contact.avatar",
        "contact.name",
        "contact.real_name",
      ])
      .orderBy("memory.update_time", "desc")
      .orderBy("memory.id", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();

    return {
      items: rows.map((row) => {
        const document = readStoredUserMemoryDocument(row.memories_json);
        return {
          platform: row.platform,
          thirdExternalUserId: row.third_external_userid,
          customerName: row.name || row.real_name || row.third_external_userid,
          ...(row.avatar ? { avatarUrl: row.avatar } : {}),
          memoryCount: document.manual.length + document.ai.length,
          version: row.version,
          ...(row.last_auto_updated_at ? { lastAutoUpdatedAt: row.last_auto_updated_at } : {}),
          updatedAt: row.update_time.getTime(),
        };
      }),
      page,
      pageSize,
      total,
    };
  }

  async getCustomer(uid: number, customer: CustomerSummary): Promise<AgentUserMemoryCustomerDetailResponse> {
    const row = await this.getMemoryRow(this.db, uid, customer);
    const document = row ? readStoredUserMemoryDocument(row.memories_json) : emptyUserMemoryDocument();
    return mapCustomerDetail(customer, row?.version ?? 0, document, row);
  }

  async createManual(uid: number, customer: CustomerSummary, actorSubUserId: number, input: AgentUserMemoryManualCreateRequest) {
    return this.mutateManual(uid, customer, input.expectedVersion, actorSubUserId, (doc, now) => createManualMemory(doc, input, actorSubUserId, now).document);
  }
  async updateManual(uid: number, customer: CustomerSummary, itemId: number, actorSubUserId: number, input: AgentUserMemoryManualUpdateRequest) {
    return this.mutateManual(uid, customer, input.expectedVersion, actorSubUserId, (doc, now) => updateManualMemory(doc, itemId, input, actorSubUserId, now));
  }
  async deleteManual(uid: number, customer: CustomerSummary, itemId: number, actorSubUserId: number, input: AgentUserMemoryManualDeleteRequest) {
    return this.mutateManual(uid, customer, input.expectedVersion, actorSubUserId, (doc, now) => deleteManualMemory(doc, itemId, now));
  }

  private async mutateManual(uid: number, customer: CustomerSummary, expectedVersion: number, _actorSubUserId: number, mutate: (doc: unknown, now: number) => ReturnType<typeof emptyUserMemoryDocument>) {
    try {
      const result = await this.db.transaction().execute(async (trx) => {
        const row = await this.getMemoryRow(trx, uid, customer, true);
        const version = row?.version ?? 0;
        if (version !== expectedVersion) throw new BadRequestError("AGENT_USER_MEMORY_VERSION_CONFLICT", "记忆已更新，请刷新后重试");
        const now = Date.now();
        const document = mutate(row ? parseStoredUserMemoryDocument(row.memories_json) : emptyUserMemoryDocument(), now);
        if (row) {
          await trx.updateTable("xy_wap_embed_agent_user_memory").set({ memories_json: JSON.stringify(document), version: version + 1, manual_updated_at: now }).where("id", "=", row.id).where("version", "=", version).executeTakeFirstOrThrow();
        } else {
          await trx.insertInto("xy_wap_embed_agent_user_memory").values({ uid, platform: customer.platform, third_external_userid: customer.thirdExternalUserId, memories_json: JSON.stringify(document), version: 1, manual_updated_at: now }).execute();
        }
        return {
          document,
          version: version + 1,
          now,
          lastAutoQuotaDate: row?.last_auto_quota_date ?? null,
          lastAutoUpdatedAt: row?.last_auto_updated_at ?? null,
        };
      });
      return mapCustomerDetail(customer, result.version, result.document, {
        manual_updated_at: result.now,
        last_auto_quota_date: result.lastAutoQuotaDate,
        last_auto_updated_at: result.lastAutoUpdatedAt,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new BadRequestError("AGENT_USER_MEMORY_VERSION_CONFLICT", "记忆已更新，请刷新后重试");
      if (error instanceof UserMemoryDomainError) throw new BadRequestError(error.code, error.message);
      throw error;
    }
  }

  private getConfig(uid: number) { return this.db.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", uid).executeTakeFirst(); }
  private getRunRow(uid: number, runId: number) { return this.db.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("uid", "=", uid).where("id", "=", runId).executeTakeFirst(); }
  private getMemoryRow(db: DbExecutor, uid: number, customer: CustomerKey, lock = false) {
    let query = db.selectFrom("xy_wap_embed_agent_user_memory").selectAll().where("uid", "=", uid).where("platform", "=", customer.platform).where("third_external_userid", "=", customer.thirdExternalUserId);
    if (lock) query = query.forUpdate();
    return query.executeTakeFirst();
  }
}

export function buildUserMemoryCustomerListQuery(
  db: Kysely<Database>,
  input: { keyword?: string; platform: number; subUserId?: number; uid: number },
) {
  let query = db
    .selectFrom("xy_wap_embed_agent_user_memory as memory")
    .innerJoin("xy_wap_embed_contact as contact", (join) =>
      join
        .onRef("contact.uid", "=", "memory.uid")
        .onRef("contact.platform", "=", "memory.platform")
        .onRef("contact.third_external_userid", "=", "memory.third_external_userid"),
    )
    .where("memory.uid", "=", input.uid)
    .where("memory.platform", "=", input.platform)
    .where(sql<boolean>`(
      COALESCE(JSON_LENGTH(memory.memories_json, '$.manual'), 0) +
      COALESCE(JSON_LENGTH(memory.memories_json, '$.ai'), 0)
    ) > 0`);

  if (input.subUserId != null) {
    query = query.where(sql<boolean>`EXISTS (
      SELECT 1
      FROM xy_wap_embed_customer_bind_relation AS bind
      INNER JOIN xy_wap_embed_user_seat AS seat
        ON seat.uid = bind.uid
        AND seat.platform = bind.platform
        AND seat.third_userid = bind.third_userid
      INNER JOIN xy_wap_embed_user_seat_sub_relation AS relation
        ON relation.user_seat_id = seat.id
        AND relation.uid = seat.uid
        AND relation.platform = seat.platform
      WHERE bind.uid = memory.uid
        AND bind.platform = memory.platform
        AND bind.third_external_userid = memory.third_external_userid
        AND relation.sub_id = ${input.subUserId}
    )`);
  }

  if (input.keyword) {
    const pattern = `%${escapeLikeKeyword(input.keyword)}%`;
    query = query.where((eb) =>
      eb.or([
        eb("contact.name", "like", pattern),
        eb("contact.real_name", "like", pattern),
        eb("contact.third_external_userid", "like", pattern),
      ]),
    );
  }

  return query;
}

export function createUserMemoryService(db: Kysely<Database>, workbenchService?: WorkbenchService, customerLimitResolver?: UserMemoryCustomerLimitResolver) { return new UserMemoryService(db, workbenchService, customerLimitResolver); }
export function resolveUserMemoryCustomerLimit(resolver: UserMemoryCustomerLimitResolver, uid: number) {
  const value = resolver.resolve(uid);
  if (!Number.isSafeInteger(value) || !SUPPORTED_CUSTOMER_LIMITS.has(value)) throw new Error("AGENT_USER_MEMORY_CUSTOMER_LIMIT_UNSUPPORTED");
  return value;
}
export function resolveCandidateSessionLimit(customerLimit: number) { return Math.max(MIN_CANDIDATE_SESSION_LIMIT, customerLimit * CANDIDATE_SESSION_MULTIPLIER); }
export function resolveTerminalRunStatus(counts: { success: number; failure: number; skipped: number }) {
  return counts.failure === 0 ? "succeeded" as const : counts.success > 0 || counts.skipped > 0 ? "partial" as const : "failed" as const;
}
export function countUserMemoryRunItems(items: Array<{ status: string }>) {
  return {
    success: items.filter((item) => item.status === "succeeded").length,
    failure: items.filter((item) => item.status === "failed").length,
    skipped: items.filter((item) => item.status === "skipped").length,
  };
}
export function nextShanghaiRunAt(nowMs: number) {
  const local = new Date(nowMs + 8 * 60 * 60 * 1000);
  const candidate = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 2 - 8, 0, 0, 0);
  return new Date(candidate > nowMs ? candidate : candidate + 24 * 60 * 60 * 1000);
}
function encodeIdCursor(id: number) { return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url"); }
function decodeIdCursor(value?: string) {
  if (!value) return undefined;
  try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); if (Number.isSafeInteger(parsed.id) && parsed.id > 0) return parsed.id as number; } catch {}
  throw new BadRequestError("INVALID_CURSOR", "分页游标无效");
}
function customerKey(platform: number, externalId: string) { return `${platform}:${externalId}`; }
export function parseStoredUserMemoryDocument(value: JsonValue | string) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parseUserMemoryDocument(parsed);
  } catch (error) {
    throw new InternalServerError("AGENT_USER_MEMORY_DATA_INVALID", "用户记忆数据异常");
  }
}
function readStoredUserMemoryDocument(value: JsonValue | string) {
  return parseStoredUserMemoryDocument(value);
}
function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; errno?: unknown };
  return value.code === "ER_DUP_ENTRY" || value.errno === 1062;
}
function escapeLikeKeyword(keyword: string) {
  return keyword.replace(/[\\%_]/g, "\\$&");
}
export function summarizeEvidenceContent(content: Record<string, unknown>) {
  for (const key of ["text", "content", "title", "transVoiceText", "description", "fileName"]) {
    const value = content[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return JSON.stringify(content);
}
function dateOnly(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function mapRun(row: Selectable<Database["xy_wap_embed_agent_user_memory_run"]>): AgentUserMemoryRun {
  return {
    id: row.id, quotaDate: dateOnly(row.quota_date), scheduledFor: row.scheduled_for.getTime(), executionMode: row.execution_mode as never,
    status: row.status as never, phase: row.phase as never, customerLimit: row.customer_limit, candidateSessionLimit: row.candidate_session_limit,
    candidateSessionCount: row.candidate_session_count, candidateCustomerCount: row.candidate_customer_count, selectedCustomerCount: row.selected_customer_count,
    successCount: row.success_count, failureCount: row.failure_count, skippedCount: row.skipped_count, inputTokens: row.input_tokens, outputTokens: row.output_tokens,
    ...(row.started_at ? { startedAt: row.started_at.getTime() } : {}), ...(row.finished_at ? { finishedAt: row.finished_at.getTime() } : {}),
    ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
  };
}
function mapCustomerDetail(customer: CustomerSummary, version: number, document: ReturnType<typeof emptyUserMemoryDocument>, row?: { manual_updated_at?: number | null; last_auto_updated_at?: number | null; last_auto_quota_date?: Date | null }): AgentUserMemoryCustomerDetailResponse {
  return {
    platform: customer.platform, thirdExternalUserId: customer.thirdExternalUserId, customerName: customer.customerName,
    ...(customer.avatarUrl ? { avatarUrl: customer.avatarUrl } : {}), version,
    items: [
      ...document.manual.map((item) => ({ ...item, source: "manual" as const })),
      ...document.ai.map((item) => ({ ...item, source: "ai" as const })),
    ].sort((a, b) => b.id - a.id),
    ...(row?.manual_updated_at ? { manualUpdatedAt: row.manual_updated_at } : {}),
    ...(row?.last_auto_updated_at ? { lastAutoUpdatedAt: row.last_auto_updated_at } : {}),
    ...(row?.last_auto_quota_date ? { lastAutoQuotaDate: dateOnly(row.last_auto_quota_date) } : {}),
  };
}
