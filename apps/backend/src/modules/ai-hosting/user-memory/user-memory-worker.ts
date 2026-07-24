import { randomUUID } from "node:crypto";
import { sql, type ExpressionBuilder, type Kysely, type Selectable, type Transaction } from "kysely";
import type { Database, JsonValue } from "../../../db/schema.js";
import type { AppLogger } from "../../../shared/logger.js";
import { applyAiMemoryOperations, emptyUserMemoryDocument, filterActiveUserMemoryDocument, parseUserMemoryDocument } from "./user-memory-domain.js";
import { UserMemoryProviderError, type UserMemoryInputMessage, type UserMemoryProvider } from "./user-memory-provider.js";
import { countUserMemoryRunItems, resolveCandidateSessionLimit, resolveTerminalRunStatus, resolveUserMemoryCustomerLimit, type UserMemoryCustomerLimitResolver } from "./user-memory-service.js";

const LEASE_MS = 5 * 60_000;
const MAX_ITEM_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30_000;
const TERMINAL_ITEM_STATUSES = ["succeeded", "failed", "skipped", "canceled"];

type RunRow = Selectable<Database["xy_wap_embed_agent_user_memory_run"]>;
type ItemRow = Selectable<Database["xy_wap_embed_agent_user_memory_run_item"]>;
type CandidateSession = { id: number; ended_at: number; message_count: number; platform: number; third_external_userid: string };
export type UserMemoryCustomerGroup = { platform: number; thirdExternalUserId: string; sessions: CandidateSession[] };

type Claim = { run: RunRow; token: string };

export class UserMemoryWorker {
  private nextCleanupAt = 0;

  constructor(private readonly input: { db: Kysely<Database>; logger: AppLogger; provider: UserMemoryProvider; workerId: string; customerLimitResolver: UserMemoryCustomerLimitResolver }) {}

  async tick() {
    await this.cleanupTerminalRunsIfDue();
    await this.scheduleOne();
    const claim = await this.claimOne();
    if (!claim) return false;
    this.input.logger.info({ component: "agent-user-memory-worker", eventCode: "agent_user_memory.claimed", phase: claim.run.phase, runId: claim.run.id, uid: claim.run.uid }, "Agent 用户记忆运行已领取");
    try {
      if (claim.run.phase === "selecting") await this.selectCandidates(claim);
      else await this.processNextItem(claim);
    } catch (error) {
      this.input.logger.error({ error, runId: claim.run.id }, "Agent user-memory worker tick failed");
      await this.releaseAfterError(claim, error);
    }
    return true;
  }

  private async cleanupTerminalRunsIfDue() {
    if (Date.now() < this.nextCleanupAt) return;
    try {
      await this.input.db.transaction().execute(async (trx) => {
        const rows = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").select(["id"])
          .where("status", "in", ["succeeded", "partial", "failed", "canceled"])
          .where("finished_at", "<", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
          .orderBy("finished_at", "asc").orderBy("id", "asc").limit(100).forUpdate().skipLocked().execute();
        const ids = rows.map((row) => row.id);
        if (ids.length === 0) return;
        await trx.deleteFrom("xy_wap_embed_agent_user_memory_run_item").where("run_id", "in", ids).execute();
        await trx.deleteFrom("xy_wap_embed_agent_user_memory_run").where("id", "in", ids).execute();
      });
      this.nextCleanupAt = Date.now() + 60 * 60_000;
    } catch (error) {
      this.nextCleanupAt = Date.now() + 30_000;
      this.input.logger.warn({ error }, "Agent user-memory history cleanup failed");
    }
  }

  private async scheduleOne() {
    await this.input.db.transaction().execute(async (trx) => {
      const config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll()
        .where("enabled", "=", 1).where("active_run_id", "is", null).where("next_run_at", "<=", new Date())
        .orderBy("next_run_at", "asc").orderBy("uid", "asc").forUpdate().skipLocked().executeTakeFirst();
      if (!config?.next_run_at) return;
      const scheduledFor = config.next_run_at;
      const quotaDate = previousShanghaiDate(scheduledFor);
      const customerLimit = resolveUserMemoryCustomerLimit(this.input.customerLimitResolver, config.uid);
      const candidateSessionLimit = resolveCandidateSessionLimit(customerLimit);
      let run = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("uid", "=", config.uid).where("quota_date", "=", quotaDate).executeTakeFirst();
      if (!run) {
        try {
          const inserted = await trx.insertInto("xy_wap_embed_agent_user_memory_run").values({
            uid: config.uid, config_generation: config.generation, quota_date: quotaDate,
            scheduled_for: scheduledFor, execution_mode: "sync", status: "pending", phase: "selecting",
            customer_limit: customerLimit, candidate_session_limit: candidateSessionLimit, run_after: new Date(),
          }).executeTakeFirstOrThrow();
          run = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("id", "=", Number(inserted.insertId)).executeTakeFirstOrThrow();
        } catch (error) {
          run = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("uid", "=", config.uid).where("quota_date", "=", quotaDate).executeTakeFirst();
          if (!run) throw error;
        }
      }
      const terminal = ["succeeded", "partial", "failed", "canceled"].includes(run.status);
      await trx.updateTable("xy_wap_embed_agent_user_memory_config").set({
        active_run_id: !terminal && run.config_generation === config.generation ? run.id : null,
        next_run_at: new Date(scheduledFor.getTime() + 24 * 60 * 60 * 1000),
      }).where("id", "=", config.id).execute();
    });
  }

  private async claimOne(): Promise<Claim | undefined> {
    return this.input.db.transaction().execute(async (trx) => {
      const now = new Date();
      const candidate = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll()
        .where((eb) => claimableRunExpression(eb, now))
        .orderBy("scheduled_for", "asc").orderBy("id", "asc").executeTakeFirst();
      if (!candidate) return undefined;
      const config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", candidate.uid).forUpdate().executeTakeFirst();
      const run = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("id", "=", candidate.id).forUpdate().executeTakeFirst();
      if (!run || !isRunClaimable(run, now)) return undefined;
      if (!config || config.enabled !== 1 || config.generation !== run.config_generation || config.active_run_id !== run.id) {
        await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ status: "canceled", phase: "completed", finished_at: now, locked_by: null, claim_token: null, lease_until: null }).where("id", "=", run.id).execute();
        return undefined;
      }
      const token = randomUUID();
      const leaseUntil = new Date(Date.now() + LEASE_MS);
      await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ status: "running", locked_by: this.input.workerId, claim_token: token, lease_until: leaseUntil, started_at: run.started_at ?? now }).where("id", "=", run.id).execute();
      return { run: { ...run, status: "running", locked_by: this.input.workerId, claim_token: token, lease_until: leaseUntil, started_at: run.started_at ?? now }, token };
    });
  }

  private async selectCandidates(claim: Claim) {
    const config = await this.input.db.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", claim.run.uid).executeTakeFirstOrThrow();
    const range = shanghaiDayRange(claim.run.quota_date);
    const sessions = await buildCandidateSessionQuery(this.input.db, {
      uid: claim.run.uid,
      start: range.start,
      end: range.end,
      enabledAt: config.enabled_at ?? Number.MAX_SAFE_INTEGER,
      limit: claim.run.candidate_session_limit,
    }).execute() as CandidateSession[];
    const groups = groupCandidateSessions(sessions).slice(0, claim.run.customer_limit);
    await this.input.db.transaction().execute(async (trx) => {
      await assertClaim(trx, claim);
      if (groups.length > 0) {
        await trx.insertInto("xy_wap_embed_agent_user_memory_run_item").values(groups.map((group) => ({
          run_id: claim.run.id, uid: claim.run.uid, platform: group.platform, third_external_userid: group.thirdExternalUserId,
          session_ids_json: JSON.stringify(group.sessions.map((s) => s.id)),
          session_count: group.sessions.length, status: "prepared", next_attempt_at: new Date(),
        }))).onDuplicateKeyUpdate({ id: sql<number>`id` }).execute();
      }
      if (sessions.length === 0) {
        await finishRun(trx, claim, "succeeded", { success: 0, failure: 0, skipped: 0 });
      } else {
        await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({
          candidate_session_count: sessions.length, candidate_customer_count: groupCandidateSessions(sessions).length,
          selected_customer_count: groups.length, phase: "inference", status: "pending", run_after: new Date(), locked_by: null, claim_token: null, lease_until: null,
        }).where("id", "=", claim.run.id).where("claim_token", "=", claim.token).executeTakeFirstOrThrow();
      }
    });
    this.input.logger.info({
      component: "agent-user-memory-worker", eventCode: "agent_user_memory.selection_completed",
      candidateCustomerCount: groupCandidateSessions(sessions).length, candidateSessionCount: sessions.length,
      candidateSessionLimit: claim.run.candidate_session_limit, runId: claim.run.id, selectedCustomerCount: groups.length, uid: claim.run.uid,
    }, "Agent 用户记忆候选选择完成");
  }

  private async processNextItem(claim: Claim) {
    const item = await this.input.db.selectFrom("xy_wap_embed_agent_user_memory_run_item").selectAll().where("run_id", "=", claim.run.id)
      .where("status", "in", ["prepared", "submitted"]).where((eb) => eb.or([eb("next_attempt_at", "is", null), eb("next_attempt_at", "<=", new Date())]))
      .orderBy("id", "asc").executeTakeFirst();
    if (!item) { await this.aggregateOrRelease(claim); return; }
    if (item.attempt_count >= MAX_ITEM_ATTEMPTS) {
      await this.failItem(claim, item, new Error(item.last_error_code ?? "AGENT_USER_MEMORY_ATTEMPTS_EXHAUSTED"), { forceTerminal: true });
      return;
    }
    let providerUsage: ProviderUsage | undefined;
    try {
      const prepared = await this.prepareInput(claim, item);
      if (!prepared) return;
      const submitted = await this.input.db.transaction().execute(async (trx) => {
        await assertClaim(trx, claim);
        const result = await trx.updateTable("xy_wap_embed_agent_user_memory_run_item")
          .set({ status: "submitted", attempt_count: item.attempt_count + 1, base_memory_version: prepared.version, base_manual_updated_at: prepared.manualUpdatedAt, message_count: prepared.messages.length, last_error_code: null })
          .where("id", "=", item.id).where("run_id", "=", claim.run.id).where("attempt_count", "=", item.attempt_count)
          .where("status", "in", ["prepared", "submitted"]).executeTakeFirst();
        return result.numUpdatedRows > 0n;
      });
      if (!submitted) {
        await this.aggregateOrRelease(claim);
        return;
      }
      const result = await this.input.provider.complete({ document: prepared.document, messages: prepared.messages, now: Date.now() });
      providerUsage = result;
      await this.mergeResult(claim, item, prepared, result);
    } catch (error) {
      const usage = providerUsage ?? providerUsageFromError(error);
      await this.failItem(claim, item, error, {
        usage,
        code: isDuplicateKeyError(error) ? "AGENT_USER_MEMORY_VERSION_CONFLICT" : undefined,
        retryImmediately: isDuplicateKeyError(error),
      });
    }
  }

  private async prepareInput(claim: Claim, item: ItemRow) {
    const memory = await this.input.db.selectFrom("xy_wap_embed_agent_user_memory").selectAll().where("uid", "=", item.uid).where("platform", "=", item.platform).where("third_external_userid", "=", item.third_external_userid).executeTakeFirst();
    if (memory?.last_auto_quota_date && formatShanghaiDate(memory.last_auto_quota_date) > formatShanghaiDate(claim.run.quota_date)) {
      await this.skipItem(claim, item, "AGENT_USER_MEMORY_ITEM_SUPERSEDED"); return undefined;
    }
    const document = memory ? filterActiveUserMemoryDocument(parseDocument(memory.memories_json), Date.now()) : emptyUserMemoryDocument();
    const sessionIds = parseNumberArray(item.session_ids_json);
    const range = shanghaiDayRange(claim.run.quota_date);
    const sessions = await this.input.db.selectFrom("xy_wap_embed_logical_session as session")
      .innerJoin("xy_wap_embed_conversation as conversation", (join) => join.onRef("conversation.id", "=", "session.conversation_id").onRef("conversation.uid", "=", "session.uid"))
      .select(["session.id", "session.ended_at"])
      .where("session.uid", "=", item.uid).where("session.id", "in", sessionIds).where("session.third_external_userid", "=", item.third_external_userid)
      .where("session.ended_at", ">=", range.start).where("session.ended_at", "<", range.end).where("session.message_count", ">=", 5)
      .where("conversation.chat_type", "=", 1).where("conversation.platform", "=", item.platform)
      .orderBy("session.ended_at", "asc").orderBy("session.id", "asc").execute();
    const eligible = sessions.filter((session) => session.ended_at != null && (memory?.manual_updated_at == null || session.ended_at > memory.manual_updated_at));
    const eligibleSessionIds = eligible.map((session) => session.id);
    const messages: UserMemoryInputMessage[] = [];
    if (eligibleSessionIds.length > 0) {
      const rows = await buildUserMemoryMessagesQuery(this.input.db, item.uid, eligibleSessionIds).execute();
      const rowsBySession = new Map<number, typeof rows>();
      for (const row of rows) {
        const sessionRows = rowsBySession.get(row.session_id) ?? [];
        sessionRows.push(row);
        rowsBySession.set(row.session_id, sessionRows);
      }
      for (const session of eligible) {
        for (const row of rowsBySession.get(session.id) ?? []) {
          const text = readableMessageText(row.msgtype, row.content);
          if (text) messages.push({ sourceMessageId: row.source_message_id, sessionId: row.session_id, senderRole: row.sender_role, occurredAt: row.source_message_time, text });
        }
      }
    }
    if (messages.length === 0) { await this.skipItem(claim, item, "AGENT_USER_MEMORY_ITEM_NO_READABLE_MESSAGES"); return undefined; }
    return { document, messages, sessionIds: eligible.map((s) => s.id), version: memory?.version ?? 0, manualUpdatedAt: memory?.manual_updated_at ?? null };
  }

  private async mergeResult(claim: Claim, item: ItemRow, prepared: Awaited<ReturnType<UserMemoryWorker["prepareInput"]>> & {}, result: Awaited<ReturnType<UserMemoryProvider["complete"]>>) {
    await this.input.db.transaction().execute(async (trx) => {
      const { run } = await assertClaim(trx, claim);
      const currentItem = await trx.selectFrom("xy_wap_embed_agent_user_memory_run_item").selectAll().where("id", "=", item.id).forUpdate().executeTakeFirstOrThrow();
      if (currentItem.status !== "submitted") throw new Error("ITEM_NOT_SUBMITTED");
      const itemUsage = accumulatedUsage(currentItem, result);
      await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ input_tokens: run.input_tokens + result.inputTokens, output_tokens: run.output_tokens + result.outputTokens, phase: "merging" }).where("id", "=", claim.run.id).where("claim_token", "=", claim.token).execute();
      const memory = await trx.selectFrom("xy_wap_embed_agent_user_memory").selectAll().where("uid", "=", item.uid).where("platform", "=", item.platform).where("third_external_userid", "=", item.third_external_userid).forUpdate().executeTakeFirst();
      if ((memory?.version ?? 0) !== currentItem.base_memory_version || (memory?.manual_updated_at ?? null) !== currentItem.base_manual_updated_at) {
        const terminal = currentItem.attempt_count >= MAX_ITEM_ATTEMPTS;
        await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({
          ...itemUsage,
          status: terminal ? "failed" : "prepared",
          next_attempt_at: terminal ? null : new Date(),
          last_error_code: terminal ? "AGENT_USER_MEMORY_ATTEMPTS_EXHAUSTED" : "AGENT_USER_MEMORY_VERSION_CONFLICT",
          ...(terminal ? { finished_at: new Date() } : {}),
        }).where("id", "=", item.id).execute();
        await aggregateRun(trx, claim); return;
      }
      if (memory?.last_auto_quota_date && formatShanghaiDate(memory.last_auto_quota_date) > formatShanghaiDate(claim.run.quota_date)) {
        await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({ ...itemUsage, status: "skipped", last_error_code: "AGENT_USER_MEMORY_ITEM_SUPERSEDED", finished_at: new Date() }).where("id", "=", item.id).execute();
        await aggregateRun(trx, claim); return;
      }
      const merged = applyAiMemoryOperations(memory ? parseDocument(memory.memories_json) : emptyUserMemoryDocument(), result.operations, {
        now: Date.now(), sessionIds: prepared.sessionIds, evidence: prepared.messages.map((m) => ({ messageId: m.sourceMessageId, sessionId: m.sessionId, senderRole: m.senderRole })),
      });
      if (memory) {
        await trx.updateTable("xy_wap_embed_agent_user_memory").set({
          ...(merged.changed ? { memories_json: JSON.stringify(merged.document), version: memory.version + 1 } : {}),
          last_auto_quota_date: claim.run.quota_date, last_auto_updated_at: Date.now(),
        }).where("id", "=", memory.id).where("version", "=", memory.version).executeTakeFirstOrThrow();
      } else {
        await trx.insertInto("xy_wap_embed_agent_user_memory").values({ uid: item.uid, platform: item.platform, third_external_userid: item.third_external_userid, memories_json: JSON.stringify(merged.document), version: merged.changed ? 1 : 0, last_auto_quota_date: claim.run.quota_date, last_auto_updated_at: Date.now() }).execute();
      }
      await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({ ...itemUsage, status: "succeeded", finished_at: new Date(), last_error_code: null }).where("id", "=", item.id).execute();
      await aggregateRun(trx, claim);
    });
  }

  private async skipItem(claim: Claim, item: ItemRow, code: string) {
    await this.input.db.transaction().execute(async (trx) => { await assertClaim(trx, claim); await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({ status: "skipped", last_error_code: code, finished_at: new Date() }).where("id", "=", item.id).execute(); await aggregateRun(trx, claim); });
  }
  private async failItem(claim: Claim, item: ItemRow, error: unknown, options: { usage?: ProviderUsage; code?: string; retryImmediately?: boolean; forceTerminal?: boolean } = {}) {
    const terminal = await this.input.db.transaction().execute(async (trx) => {
      const { run } = await assertClaim(trx, claim);
      const current = await trx.selectFrom("xy_wap_embed_agent_user_memory_run_item").selectAll().where("id", "=", item.id).forUpdate().executeTakeFirstOrThrow();
      const attempts = options.forceTerminal ? current.attempt_count : current.status === "submitted" ? current.attempt_count : current.attempt_count + 1;
      const terminal = options.forceTerminal === true || attempts >= MAX_ITEM_ATTEMPTS;
      const usage = options.usage ?? EMPTY_PROVIDER_USAGE;
      await trx.updateTable("xy_wap_embed_agent_user_memory_run_item").set({
        ...accumulatedUsage(current, usage), attempt_count: attempts, status: terminal ? "failed" : "prepared",
        next_attempt_at: terminal ? null : new Date(Date.now() + (options.retryImmediately ? 0 : RETRY_DELAY_MS)),
        last_error_code: terminal && options.code === "AGENT_USER_MEMORY_VERSION_CONFLICT" ? "AGENT_USER_MEMORY_ATTEMPTS_EXHAUSTED" : options.code ?? errorCode(error),
        ...(terminal ? { finished_at: new Date() } : {}),
      }).where("id", "=", item.id).execute();
      if (usage.inputTokens > 0 || usage.outputTokens > 0) {
        await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ input_tokens: run.input_tokens + usage.inputTokens, output_tokens: run.output_tokens + usage.outputTokens }).where("id", "=", claim.run.id).where("claim_token", "=", claim.token).execute();
      }
      await aggregateRun(trx, claim);
      return terminal;
    }).catch((fenceError) => { this.input.logger.warn({ error: fenceError, runId: claim.run.id }, "Failed to record user-memory item error"); return false; });
    if (terminal) this.input.logger.warn({ component: "agent-user-memory-worker", eventCode: "agent_user_memory.item_failed", errorCode: options.code ?? errorCode(error), itemId: item.id, runId: claim.run.id, uid: claim.run.uid }, "Agent 用户记忆运行项达到最大尝试次数");
  }
  private async aggregateOrRelease(claim: Claim) { await this.input.db.transaction().execute(async (trx) => { await assertClaim(trx, claim); await aggregateRun(trx, claim); }); }
  private async releaseAfterError(claim: Claim, error: unknown) {
    await this.input.db.updateTable("xy_wap_embed_agent_user_memory_run").set({ status: "pending", run_after: new Date(Date.now() + RETRY_DELAY_MS), last_error_code: errorCode(error), locked_by: null, claim_token: null, lease_until: null }).where("id", "=", claim.run.id).where("claim_token", "=", claim.token).where("locked_by", "=", this.input.workerId).execute().catch(() => undefined);
  }
}

export function buildCandidateSessionQuery(db: Kysely<Database>, input: { uid: number; start: number; end: number; enabledAt: number; limit: number }) {
  return db.selectFrom("xy_wap_embed_logical_session as session")
    .innerJoin("xy_wap_embed_conversation as conversation", (join) => join.onRef("conversation.id", "=", "session.conversation_id").onRef("conversation.uid", "=", "session.uid"))
    .select(["session.id", "session.ended_at", "session.message_count", "conversation.platform", "session.third_external_userid"])
    .where("session.uid", "=", input.uid).where("session.ended_at", ">=", input.start).where("session.ended_at", "<", input.end)
    .where("session.ended_at", ">", input.enabledAt).where("session.message_count", ">=", 5)
    .where("session.third_external_userid", "!=", "").where("conversation.chat_type", "=", 1).where("conversation.platform", ">", 0)
    .whereRef("conversation.third_external_userid", "=", "session.third_external_userid")
    .orderBy("session.message_count", "desc").orderBy("session.ended_at", "desc").orderBy("session.id", "desc")
    .limit(input.limit);
}

export function buildUserMemoryMessagesQuery(db: Kysely<Database>, uid: number, sessionIds: number[]) {
  const ranked = db.selectFrom("xy_wap_embed_logical_session_message as ownership")
    .innerJoin("xy_wap_embed_msg_audit_info as message", (join) => join.onRef("message.id", "=", "ownership.source_message_id").onRef("message.uid", "=", "ownership.uid"))
    .select(["ownership.session_id", "ownership.source_message_id", "ownership.source_message_time", "ownership.sender_role", "message.content", "message.msgtype", sql<number>`row_number() over (partition by ownership.session_id order by ownership.source_message_time desc, ownership.source_message_id desc)`.as("row_number")])
    .where("ownership.uid", "=", uid).where("ownership.session_id", "in", sessionIds).where("ownership.included_for_ai", "=", 1);
  return db.selectFrom(ranked.as("ranked_messages")).selectAll().where("row_number", "<=", 50)
    .orderBy("source_message_time", "asc").orderBy("source_message_id", "asc");
}

export function groupCandidateSessions(sessions: CandidateSession[]): UserMemoryCustomerGroup[] {
  const groups = new Map<string, UserMemoryCustomerGroup>();
  for (const session of sessions) {
    const key = `${session.platform}:${session.third_external_userid}`;
    const group = groups.get(key) ?? { platform: session.platform, thirdExternalUserId: session.third_external_userid, sessions: [] };
    group.sessions.push(session); groups.set(key, group);
  }
  for (const group of groups.values()) group.sessions.sort((a, b) => a.ended_at - b.ended_at || a.id - b.id);
  return [...groups.values()];
}

type ProviderUsage = { inputTokens: number; outputTokens: number };
const EMPTY_PROVIDER_USAGE: ProviderUsage = { inputTokens: 0, outputTokens: 0 };
function providerUsageFromError(error: unknown): ProviderUsage {
  return error instanceof UserMemoryProviderError ? error : EMPTY_PROVIDER_USAGE;
}
function accumulatedUsage(item: Pick<ItemRow, "input_tokens" | "output_tokens">, usage: ProviderUsage) {
  return { input_tokens: item.input_tokens + usage.inputTokens, output_tokens: item.output_tokens + usage.outputTokens };
}
function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; errno?: unknown };
  return value.code === "ER_DUP_ENTRY" || value.errno === 1062;
}

function claimableRunExpression(eb: ExpressionBuilder<Database, "xy_wap_embed_agent_user_memory_run">, now: Date) {
  return eb.or([
    eb.and([eb("status", "=", "pending"), eb.or([eb("run_after", "is", null), eb("run_after", "<=", now)])]),
    eb.and([eb("status", "=", "running"), eb("lease_until", "<", now)]),
    eb.and([eb("status", "=", "waiting"), eb.or([eb("run_after", "is", null), eb("run_after", "<=", now)])]),
  ]);
}
function isRunClaimable(run: RunRow, now: Date) {
  return (run.status === "pending" && (!run.run_after || run.run_after <= now))
    || (run.status === "running" && Boolean(run.lease_until && run.lease_until < now))
    || (run.status === "waiting" && (!run.run_after || run.run_after <= now));
}
async function assertClaim(trx: Transaction<Database>, claim: Claim) {
  const config = await trx.selectFrom("xy_wap_embed_agent_user_memory_config").selectAll().where("uid", "=", claim.run.uid).forUpdate().executeTakeFirst();
  const run = await trx.selectFrom("xy_wap_embed_agent_user_memory_run").selectAll().where("id", "=", claim.run.id).forUpdate().executeTakeFirst();
  if (!run || run.status !== "running" || run.claim_token !== claim.token || run.locked_by !== claim.run.locked_by || !run.lease_until || run.lease_until.getTime() <= Date.now() || !config || config.enabled !== 1 || config.generation !== run.config_generation || config.active_run_id !== run.id) throw new Error("USER_MEMORY_CLAIM_LOST");
  return { run, config };
}
async function releaseRun(trx: Transaction<Database>, claim: Claim, runAfter: Date) {
  await trx.updateTable("xy_wap_embed_agent_user_memory_run")
    .set({ status: "pending", run_after: runAfter, locked_by: null, claim_token: null, lease_until: null })
    .where("id", "=", claim.run.id).where("claim_token", "=", claim.token).executeTakeFirstOrThrow();
}
async function aggregateRun(trx: Transaction<Database>, claim: Claim) {
  const items = await trx.selectFrom("xy_wap_embed_agent_user_memory_run_item").select(["status", "next_attempt_at"]).where("run_id", "=", claim.run.id).execute();
  const counts = countUserMemoryRunItems(items);
  if (items.length === 0) {
    await finishRun(trx, claim, "succeeded", counts);
  } else if (items.every((i) => TERMINAL_ITEM_STATUSES.includes(i.status))) {
    await finishRun(trx, claim, resolveTerminalRunStatus(counts), counts);
  } else {
    await releaseRun(trx, claim, resolveNextRunAfter(items, Date.now()));
  }
}
export function resolveNextRunAfter(items: Array<{ status: string; next_attempt_at: Date | null }>, nowMs: number) {
  const dueTimes = items
    .filter((item) => !TERMINAL_ITEM_STATUSES.includes(item.status))
    .map((item) => item.next_attempt_at?.getTime() ?? nowMs);
  return new Date(Math.max(nowMs, Math.min(...dueTimes)));
}
async function finishRun(trx: Transaction<Database>, claim: Claim, status: "succeeded" | "partial" | "failed", counts: { success: number; failure: number; skipped: number }) {
  await trx.updateTable("xy_wap_embed_agent_user_memory_run").set({ status, phase: "completed", success_count: counts.success, failure_count: counts.failure, skipped_count: counts.skipped, finished_at: new Date(), locked_by: null, claim_token: null, lease_until: null }).where("id", "=", claim.run.id).where("claim_token", "=", claim.token).executeTakeFirstOrThrow();
  await trx.updateTable("xy_wap_embed_agent_user_memory_config").set({ active_run_id: null }).where("uid", "=", claim.run.uid).where("active_run_id", "=", claim.run.id).execute();
}
function parseNumberArray(value: JsonValue | string) { const parsed = typeof value === "string" ? JSON.parse(value) : value; if (!Array.isArray(parsed) || parsed.some((v) => !Number.isSafeInteger(v) || Number(v) <= 0)) throw new Error("AGENT_USER_MEMORY_DATA_INVALID"); return parsed.map(Number); }
function parseDocument(value: JsonValue | string) { return parseUserMemoryDocument(typeof value === "string" ? JSON.parse(value) : value); }
function readableMessageText(type: string, content: string | null) {
  if (!content || !["text", "markdown", "mixed", "voice", "file", "link", "weapp"].includes(type)) return "";
  try { const parsed = JSON.parse(content); if (typeof parsed === "string") return parsed.trim(); if (parsed && typeof parsed === "object") { for (const key of ["content", "text", "title", "transVoiceText", "description", "fileName"]) { const value = (parsed as Record<string, unknown>)[key]; if (typeof value === "string" && value.trim()) return value.trim(); } } } catch { return content.trim(); }
  return "";
}
function formatShanghaiDate(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function previousShanghaiDate(scheduledFor: Date) { const local = new Date(scheduledFor.getTime() + 8 * 60 * 60 * 1000); return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1, 4)); }
function shanghaiDayRange(quotaDate: Date) { const key = formatShanghaiDate(quotaDate); const [year, month, day] = key.split("-").map(Number); const start = Date.UTC(year!, month! - 1, day!, -8); return { start, end: start + 24 * 60 * 60 * 1000 }; }
function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code.slice(0, 128);
  return error instanceof Error ? error.message.slice(0, 128) : "AGENT_USER_MEMORY_WORKER_FAILED";
}
