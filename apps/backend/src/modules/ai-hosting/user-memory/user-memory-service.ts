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
} from "@chatai/contracts";
import type { Kysely, Selectable, Transaction } from "kysely";
import type { Database, JsonValue } from "../../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
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
const SCHEDULE = "02:00";
const TIMEZONE = "Asia/Shanghai";

type CustomerKey = { platform: number; thirdExternalUserId: string };
type CustomerSummary = CustomerKey & { avatarUrl?: string; customerName: string };
type DbExecutor = Kysely<Database> | Transaction<Database>;

export class UserMemoryService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly workbenchService?: WorkbenchService,
  ) {}

  async getOverview(uid: number): Promise<AgentUserMemoryOverviewResponse> {
    const config = await this.getConfig(uid);
    const [activeRun, recentRun] = await Promise.all([
      config?.active_run_id ? this.getRunRow(uid, config.active_run_id) : undefined,
      this.db.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("uid", "=", uid).orderBy("id", "desc").executeTakeFirst(),
    ]);
    return {
      enabled: config?.enabled === 1,
      schedule: SCHEDULE,
      timezone: TIMEZONE,
      executionMode: "sync",
      customerLimit: DEFAULT_CUSTOMER_LIMIT,
      ...(config?.next_run_at ? { nextRunAt: config.next_run_at.getTime() } : {}),
      ...(activeRun ? { activeRun: mapRun(activeRun) } : {}),
      ...(recentRun ? { recentRun: mapRun(recentRun) } : {}),
    };
  }

  async updateSettings(uid: number, enabled: boolean): Promise<AgentUserMemoryOverviewResponse> {
    await this.db.transaction().execute(async (trx) => {
      let config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", uid).forUpdate().executeTakeFirst();
      if (!config) {
        await trx.insertInto("xy_wap_embed_agent_user_memory_config").values({ uid }).execute();
        config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", uid).forUpdate().executeTakeFirstOrThrow();
      }
      if ((config.enabled === 1) === enabled) return;
      const now = Date.now();
      if (!enabled && config.active_run_id) {
        await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({ status: "canceled", finished_at: new Date() }).where("run_id", "=", config.active_run_id).where("status", "in", ["prepared", "submitted"]).execute();
        await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ status: "canceled", phase: "completed", finished_at: new Date(), locked_by: null, claim_token: null, lease_until: null }).where("id", "=", config.active_run_id).where("uid", "=", uid).execute();
      }
      await trx.updateTable("xy_wap_embed_agent_user_memory_config").set({
        enabled: enabled ? 1 : 0,
        generation: config.generation + 1,
        enabled_at: enabled ? now : null,
        next_run_at: enabled ? nextShanghaiRunAt(now) : null,
        active_run_id: null,
      }).where("id", "=", config.id).executeTakeFirstOrThrow();
    });
    return this.getOverview(uid);
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
      let resetCount = 0; let skippedCount = 0;
      const quotaDate = dateOnly(run.quota_date);
      for (const item of failed) {
        const memory = await trx.selectFrom("xy_wap_embed_agent_user_memory").select(["last_auto_quota_date"]).where("uid", "=", uid).where("platform", "=", item.platform).where("third_external_userid", "=", item.third_external_userid).executeTakeFirst();
        if (memory?.last_auto_quota_date && dateOnly(memory.last_auto_quota_date) > quotaDate) {
          await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({ status: "skipped", last_error_code: "AGENT_USER_MEMORY_ITEM_SUPERSEDED", finished_at: new Date() }).where("id", "=", item.id).execute();
          skippedCount += 1;
        } else {
          await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({ status: "prepared", attempt_count: 0, next_attempt_at: null, last_error_code: null, finished_at: null }).where("id", "=", item.id).execute();
          resetCount += 1;
        }
      }
      if (resetCount === 0) throw new BadRequestError("AGENT_USER_MEMORY_RUN_NOT_RETRYABLE", "运行没有可重试失败项");
      await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ status: "pending", phase: "inference", run_after: new Date(), finished_at: null, last_error_code: null, locked_by: null, claim_token: null, lease_until: null }).where("id", "=", runId).execute();
      await trx.updateTable("xy_wap_embed_agent_user_memory_config").set({ active_run_id: runId }).where("id", "=", config.id).execute();
      return { resetCount, skippedCount };
    });
  }

  async getEvidence(uid: number, subUserId: string, customer: CustomerSummary, itemId: number) {
    if (!this.workbenchService) throw new Error("Workbench service is required");
    const row = await this.getMemoryRow(this.db, uid, customer);
    const item = row ? parseJsonDocument(row.memories_json).ai.find((entry) => entry.id === itemId) : undefined;
    if (!item) throw new NotFoundError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "记忆条目不存在");
    const session = await this.db.selectFrom("xy_wap_embed_logical_session").select(["conversation_id", "third_external_userid"]).where("uid", "=", uid).where("id", "=", item.sourceSessionId).executeTakeFirst();
    if (!session || session.third_external_userid !== customer.thirdExternalUserId) throw new NotFoundError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "记忆证据不存在");
    const page = await this.workbenchService.getMessagesBySeqs(subUserId, String(session.conversation_id), item.evidenceMessageIds);
    return { messages: page.messages.map((message) => ({ content: JSON.stringify(message.content), messageId: message.seq, occurredAt: message.createdAt ?? 0, senderRole: message.senderType, sessionId: item.sourceSessionId })) };
  }

  async listCustomers(uid: number, subUserId: string, roles: string[], options: { cursor?: string; pageSize?: number; query?: string }): Promise<AgentUserMemoryCustomerListResponse> {
    if (!this.workbenchService) throw new Error("Workbench service is required");
    const page = await this.workbenchService.getCustomers(subUserId, {
      cursor: options.cursor, keyword: options.query, limit: options.pageSize,
      scope: roles.includes("owner") || roles.includes("admin") ? "all" : "mine",
    });
    const memories = await this.listMemoryRows(uid, page.items.map((item) => ({ platform: item.platform, thirdExternalUserId: item.thirdExternalUserId })));
    return {
      items: page.items.map((item) => {
        const memory = memories.get(customerKey(item.platform, item.thirdExternalUserId));
        const document = memory ? parseJsonDocument(memory.memories_json) : emptyUserMemoryDocument();
        return {
          platform: item.platform, thirdExternalUserId: item.thirdExternalUserId,
          customerName: item.name || item.realName || item.thirdExternalUserId,
          ...(item.avatar ? { avatarUrl: item.avatar } : {}), memoryCount: document.manual.length + document.ai.length,
          version: memory?.version ?? 0,
          ...(memory?.last_auto_updated_at ? { lastAutoUpdatedAt: memory.last_auto_updated_at } : {}),
          ...(memory?.update_time ? { updatedAt: memory.update_time.getTime() } : {}),
        };
      }),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async getCustomer(uid: number, customer: CustomerSummary): Promise<AgentUserMemoryCustomerDetailResponse> {
    const row = await this.getMemoryRow(this.db, uid, customer);
    const document = row ? parseJsonDocument(row.memories_json) : emptyUserMemoryDocument();
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
        const document = mutate(row ? parseJsonDocument(row.memories_json) : emptyUserMemoryDocument(), now);
        if (row) {
          await trx.updateTable("xy_wap_embed_agent_user_memory").set({ memories_json: JSON.stringify(document), version: version + 1, manual_updated_at: now }).where("id", "=", row.id).where("version", "=", version).executeTakeFirstOrThrow();
        } else {
          await trx.insertInto("xy_wap_embed_agent_user_memory").values({ uid, platform: customer.platform, third_external_userid: customer.thirdExternalUserId, memories_json: JSON.stringify(document), version: 1, manual_updated_at: now }).execute();
        }
        return { document, version: version + 1, now };
      });
      return mapCustomerDetail(customer, result.version, result.document, { manual_updated_at: result.now });
    } catch (error) {
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
  private async listMemoryRows(uid: number, customers: CustomerKey[]) {
    const result = new Map<string, Awaited<ReturnType<UserMemoryService["getMemoryRow"]>> extends infer T ? NonNullable<T> : never>();
    const platforms = [...new Set(customers.map((item) => item.platform))];
    if (customers.length === 0 || platforms.length === 0) return result;
    const externalIds = [...new Set(customers.map((item) => item.thirdExternalUserId))];
    const rows = await this.db.selectFrom("xy_wap_embed_agent_user_memory").selectAll().where("uid", "=", uid).where("platform", "in", platforms).where("third_external_userid", "in", externalIds).execute();
    for (const row of rows) result.set(customerKey(row.platform, row.third_external_userid), row);
    return result;
  }
}

export function createUserMemoryService(db: Kysely<Database>, workbenchService?: WorkbenchService) { return new UserMemoryService(db, workbenchService); }
export function resolveCandidateSessionLimit(customerLimit: number) { return Math.max(MIN_CANDIDATE_SESSION_LIMIT, customerLimit * CANDIDATE_SESSION_MULTIPLIER); }
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
function parseJsonDocument(value: JsonValue | string) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return parseUserMemoryDocument(parsed);
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
    ].sort((a, b) => b.updatedAt - a.updatedAt),
    ...(row?.manual_updated_at ? { manualUpdatedAt: row.manual_updated_at } : {}),
    ...(row?.last_auto_updated_at ? { lastAutoUpdatedAt: row.last_auto_updated_at } : {}),
    ...(row?.last_auto_quota_date ? { lastAutoQuotaDate: dateOnly(row.last_auto_quota_date) } : {}),
  };
}
