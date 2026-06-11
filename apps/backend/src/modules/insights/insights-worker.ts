import type { InsightRescanAnalysisScope } from "@chatai/contracts";
import {
  buildInsightMessageInput,
  parseInsightMessageContent,
  readInsightContentString,
} from "./insight-message-input-builder.js";
import type {
  InsightPromptExistingActionItem,
  InsightPreviousSessionContext,
  InsightPromptContext,
} from "./insight-prompt-builder.js";
import type { AiMessageInput, InsightMessageSourceRow } from "./insights.types.js";

type WorkerLogger = {
  error(payload: Record<string, unknown>, message: string): void;
  debug?(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
};

const CLEANUP_DISABLED_INSIGHTS_MAX_BATCHES = 1_000;
const SYNC_MESSAGES_MAX_BATCHES = 10_000;

export type InsightWorkerCursor = {
  cursorAuditId: number;
  cursorMsgtime: number;
  uid?: number;
};

export type InsightWorkerFeatureConfig = {
  entityEnabled: boolean;
  insightEnabled: boolean;
  intentEnabled: boolean;
  labelEnabled: boolean;
  lastEnableTime?: number;
  qaEnabled: boolean;
  todoEnabled: boolean;
  uid: number;
};

export type InsightWorkerMessage = {
  chatType: number;
  content: string | null;
  fromType: number | null;
  id: string;
  msgtime: number;
  msgtype: string;
  platform: number;
  uid: number;
  thirdExternalId: string;
  thirdGroupId: string;
  thirdUserId: string;
};

export type InsightAnalysisMessageRow = Omit<
  InsightWorkerMessage,
  "platform" | "uid" | "thirdExternalId" | "thirdGroupId"
> & {
  conversationId: string;
};

export type InsightWorkerConversation = {
  conversationId: string;
  uid: number;
};

export type InsightWorkerExistingSession = {
  sessionId: string;
  sourceMessageId?: string;
  status: "analyzed" | "canceled" | "closed_pending_analysis" | "open";
  uid: number;
};

type SessionizedMessageResult = {
  includedForAi: boolean;
  occurredAt: number;
  sessionId: string;
  uid: number;
};

type LiveAnalyzeCandidate = Omit<SessionizedMessageResult, "includedForAi">;

export type InsightWorkerSessionizationConfig = {
  analysisDelayMinutes: number;
  hardMaxDurationHours: number;
  idleTimeoutMinutes: number;
  lateArrivalWindowMinutes: number;
  ruleVersion: string;
};

export type ShouldCreateLiveAnalyzeJobInput = {
  occurredAt: number;
  sessionId: string;
  uid: number;
};

export type InsightWorkerOpenSession = {
  lastMeaningfulMessageAt: number | null;
  sessionId: string;
  startedAt: number;
  status?: "canceled" | "open";
};

export type CleanupDisabledInsightsJob = {
  enableEpoch: number;
  jobId: string;
  uid: number;
};

export type ClosableOpenSession = {
  analysisDelayMinutes: number;
  closeReason: CloseSessionInput["closeReason"];
  endedAt: number;
  sessionId: string;
  uid: number;
};

export type OpenSessionForLiveAnalysis = {
  sessionId: string;
  uid: number;
};

export type CreateLogicalSessionInput = {
  config: InsightWorkerSessionizationConfig;
  conversationId: string;
  startedAt: number;
  thirdExternalUserId: string;
  thirdUserId: string;
  uid: number;
};

export type AppendSessionMessageInput = {
  asset?: {
    key: string;
    name: string;
    type: "file" | "link" | "miniapp";
  };
  conversationId: string;
  includedForAi: boolean;
  meaningfulForBoundary: boolean;
  messageType: string;
  occurredAt: number;
  senderRole: string;
  sessionId: string;
  sourceMessageId: string;
  sourceMessageTime: number;
  uid: number;
};

export type CloseSessionInput = {
  closeReason: "hard_max_duration" | "idle_timeout" | "insight_disabled";
  endedAt: number;
  sessionId: string;
};

export type CreateAnalyzeJobInput = {
  analysisScope: InsightRescanAnalysisScope;
  jobType: "analyze_session" | "reanalyze_session";
  mode: "final" | "live";
  rescanTaskId?: string;
  runAfter: Date;
  sessionId: string;
  uid: number;
};

export type ClaimedAnalyzeJob = {
  analysisScope: InsightRescanAnalysisScope;
  attemptCount: number;
  jobId: string;
  maxAttempts: number;
  mode: "final" | "live" | "manual_reanalyze";
  rescanTaskId?: string;
  sessionId: string;
  uid: number;
};

export type ClaimedSyncMessagesJob = {
  analysisScope: InsightRescanAnalysisScope;
  cursorMsgtime: number;
  jobId: string;
  rescanTaskId?: string;
  scanUntilMsgtime?: number;
  uid: number;
};

export type ClaimedUidMaintenanceJob = {
  jobId: string;
  uid: number;
};

export type RecentActionItemForPrompt = InsightPromptExistingActionItem;

export type InsightAnalysisRunInput = {
  analysisScope: InsightRescanAnalysisScope;
  jobId: string;
  mode: ClaimedAnalyzeJob["mode"];
  sessionId: string;
  sourceMessageFrom: string | null;
  sourceMessageTo: string | null;
};

export type InsightAnalysisOutput = {
  actionItems: Array<{
    dueHint?: string;
    evidenceMessageIds: string[];
    priority: "high" | "low" | "medium";
    title: string;
  }>;
  entities: Array<{
    confidence: number;
    entityCode?: string;
    entityId?: string;
    entityName: string;
    evidenceMessageIds: string[];
    sentiment?: string;
  }>;
  faqCandidates: Array<{
    answerHint: string;
    evidenceMessageIds: string[];
    question: string;
    status: string;
  }>;
  intents: Array<{
    confidence: number;
    evidenceMessageIds: string[];
    intentCode?: string;
    intentId?: string;
    intentLabel: string;
  }>;
  problemResolution: {
    confidence: number;
    evidence: InsightEvidenceReference[];
    evidenceMessageIds: string[];
    problemDetected: boolean;
    problemSummary: string;
    resolutionStatus: "no_customer_problem" | "partially_resolved" | "resolved" | "unknown" | "unresolved";
    unresolvedReason?: string;
  };
  qaFindings: Array<{
    confidence: number;
    evidenceMessageIds: string[];
    passed: boolean;
    reason: string;
    ruleCode: string;
    ruleName: string;
    severity: "high" | "low" | "medium";
  }>;
  // Session-level sentiment is stored as a 0/1 item array for API compatibility.
  sentiment: Array<{
    confidence: number;
    evidenceMessageIds: string[];
    polarity: "mixed" | "negative" | "neutral" | "positive" | "unknown";
    reason: string;
  }>;
  summary: {
    sessionTitle: string;
    text: string;
  };
  sourceMessageHighWatermark?: string | null;
  tags: Array<{
    confidence: number;
    evidenceMessageIds: string[];
    tagCode?: string;
    tagId?: string;
    tagName: string;
  }>;
};

export type InsightLiveAnalysisGateDecision = {
  changeType:
    | "business_changed"
    | "first_live_snapshot"
    | "material_update"
    | "no_material_change"
    | "risk_escalated";
  reason: string;
  shouldAnalyze: boolean;
};

export type InsightLiveGateSkipRecord = Pick<
  InsightLiveAnalysisGateDecision,
  "changeType" | "reason"
> & {
  sourceMessageTo: string | null;
};

export type InsightAnalyzerOutput = InsightAnalysisOutput & {
  analysisWarnings?: string[];
};

export type InsightEvidenceReference = {
  evidenceRole: string;
  messageId: string;
  reason?: string;
};

export type SaveAnalysisResultInput = {
  job: ClaimedAnalyzeJob;
  output: InsightAnalysisOutput;
  resultKind?: "insufficient_messages" | "model_analysis";
  runId: string;
  sourceMessageHighWatermark: string | null;
  validationWarnings: string[];
};

export type InsightWorkerAnalysisPolicy = {
  lowConfidenceThreshold: number;
  minAnalysisMessages: number;
};

export type InsightSessionAnalyzer = {
  analyzeSession(input: {
    context: InsightPromptContext;
    existingActionItems?: RecentActionItemForPrompt[];
    job: ClaimedAnalyzeJob;
    messages: AiMessageInput[];
    previousSessionContexts: InsightPreviousSessionContext[];
    previousOutput?: InsightAnalysisOutput;
  }): Promise<InsightAnalyzerOutput>;
  evaluateLiveAnalysisGate?(input: {
    context: InsightPromptContext;
    job: ClaimedAnalyzeJob;
    messages: AiMessageInput[];
    previousGateSkip?: InsightLiveGateSkipRecord;
    previousSessionContexts: InsightPreviousSessionContext[];
    previousOutput?: InsightAnalysisOutput;
  }): Promise<InsightLiveAnalysisGateDecision>;
};

export type InsightWorkerRepositoryPort = {
  appendSessionMessage(input: AppendSessionMessageInput): Promise<void>;
  archiveTerminalJobs?(input: {
    before: Date;
    limit: number;
  }): Promise<{ archivedJobs: number; deletedJobs: number }>;
  claimNextCleanupDisabledInsightsJob(): Promise<CleanupDisabledInsightsJob | undefined>;
  claimNextAnalyzeJob(): Promise<ClaimedAnalyzeJob | undefined>;
  claimNextSyncMessagesJob(): Promise<ClaimedSyncMessagesJob | undefined>;
  claimNextUidMaintenanceJob(): Promise<ClaimedUidMaintenanceJob | undefined>;
  closeDisabledOpenSessions(input: {
    endedAt: number;
    limit: number;
    uid: number;
  }): Promise<number>;
  closeSession(input: CloseSessionInput): Promise<void>;
  createAnalyzeJob(input: CreateAnalyzeJobInput): Promise<string>;
  createLogicalSession(input: CreateLogicalSessionInput): Promise<string>;
  findOpenSession(input: {
    conversationId: string;
    uid: number;
  }): Promise<InsightWorkerOpenSession | undefined>;
  findReusableSession(input: {
    conversationId: string;
    uid: number;
  }): Promise<InsightWorkerOpenSession | undefined>;
  findPlatformConversation(message: InsightWorkerMessage): Promise<InsightWorkerConversation | undefined>;
  findSessionBySourceMessage(input: {
    sourceMessageId: string;
    uid: number;
  }): Promise<InsightWorkerExistingSession | undefined>;
  listSessionsBySourceMessages(input: {
    sourceMessageIds: string[];
    uid: number;
  }): Promise<InsightWorkerExistingSession[]>;
  getAnalysisPolicy(uid: number): Promise<InsightWorkerAnalysisPolicy>;
  getFeatureConfig(uid: number): Promise<InsightWorkerFeatureConfig>;
  getCursor(uid?: number): Promise<InsightWorkerCursor>;
  getPromptContext(uid: number): Promise<InsightPromptContext>;
  getSessionizationConfig(uid: number): Promise<InsightWorkerSessionizationConfig>;
  listPreviousSessionContexts(input: {
    currentSessionId: string;
    limit: number;
    lookbackHours: number;
    uid: number;
  }): Promise<InsightPreviousSessionContext[]>;
  listRecentActionItemsForPrompt(input: {
    conversationId: string;
    limit: number;
    uid: number;
  }): Promise<RecentActionItemForPrompt[]>;
  listClosableOpenSessions(input: {
    activeUids?: Set<number>;
    limit: number;
    now: number;
  }): Promise<ClosableOpenSession[]>;
  listIncrementalMessages(input: {
    cursorAuditId: number;
    cursorMsgtime: number;
    limit: number;
    scanUntilMsgtime?: number;
    uid?: number;
  }): Promise<InsightWorkerMessage[]>;
  listOpenSessionsForLiveAnalysis(input: {
    activeUids?: Set<number>;
    limit: number;
  }): Promise<OpenSessionForLiveAnalysis[]>;
  listUnassignedPreContextMessages(input: {
    conversationId: string;
    limit: number;
    occurredBefore: number;
    uid: number;
    windowStart: number;
  }): Promise<InsightAnalysisMessageRow[]>;
  listSessionMessagesForAnalysis(sessionId: string): Promise<InsightAnalysisMessageRow[]>;
  getCurrentAnalysisOutput(input: {
    sessionId: string;
    uid: number;
  }): Promise<InsightAnalysisOutput | undefined>;
  getLatestLiveGateSkip(input: {
    afterSourceMessageId?: string | null;
    sessionId: string;
    uid: number;
  }): Promise<InsightLiveGateSkipRecord | undefined>;
  getActiveFeatureConfigs(input: { limit?: number }): Promise<InsightWorkerFeatureConfig[]>;
  markAnalysisJobFailed(jobId: string, error: unknown): Promise<void>;
  markAnalysisJobSucceeded(jobId: string): Promise<void>;
  markAnalysisRunFailed(runId: string, error: unknown): Promise<void>;
  // The run completed successfully, but model analysis was skipped before publishing a snapshot.
  markAnalysisRunSucceededWithoutSnapshot(input: {
    code?: "INSUFFICIENT_MESSAGES" | "LIVE_GATE_SKIPPED";
    reason: string;
    runId: string;
  }): Promise<void>;
  markSyncMessagesJobFailed(jobId: string, error: unknown): Promise<void>;
  markSyncMessagesJobSucceeded(jobId: string): Promise<void>;
  markCleanupDisabledInsightsJobFailed(jobId: string, error: unknown): Promise<void>;
  markCleanupDisabledInsightsJobSucceeded(jobId: string): Promise<void>;
  deleteUidMaintenanceJob(jobId: string): Promise<void>;
  markUidMaintenanceJobFailed(jobId: string, error: unknown): Promise<void>;
  postponeAnalysisJobForInputReadiness(
    jobId: string,
    input: { delayMs: number; reason: string },
  ): Promise<void>;
  reopenSession(input: {
    sessionId: string;
    uid: number;
  }): Promise<boolean>;
  rescheduleUidMaintenanceJob(
    jobId: string,
    input: { runAfter: Date },
  ): Promise<void>;
  saveAnalysisResult(input: SaveAnalysisResultInput): Promise<string>;
  seedUidMaintenanceJobs(input: {
    limit: number;
    runAfter: Date;
  }): Promise<{ insertedJobs: number; scannedUids: number }>;
  shouldCreateLiveAnalyzeJob(input: ShouldCreateLiveAnalyzeJobInput): Promise<boolean>;
  startAnalysisRun(input: InsightAnalysisRunInput): Promise<string>;
  updateRescanTaskAfterAnalysis(input: {
    failedSessions: number;
    rescanTaskId: string;
    succeededSessions: number;
  }): Promise<void>;
  updateRescanTaskAfterScan(input: {
    queuedSessions: number;
    rescanTaskId: string;
    totalSessions: number;
  }): Promise<void>;
  updateRescanTaskRunning(rescanTaskId: string): Promise<void>;
  updateCursor(cursor: InsightWorkerCursor & { uid?: number }): Promise<void>;
};

export type NonOverlappingTicker = {
  tick(): Promise<boolean>;
  waitForIdle(): Promise<void>;
};

const INPUT_READINESS_RETRY_DELAY_MS = 5 * 60_000;
const INPUT_READINESS_MAX_POSTPONES = 1;
const PREVIOUS_SESSION_LOOKBACK_HOURS = 48;
const PREVIOUS_SESSION_CONTEXT_LIMIT = 3;
const TERMINAL_JOB_ARCHIVE_RETENTION_DAYS = 30;
const TERMINAL_JOB_ARCHIVE_LIMIT = 5_000;
const PRE_CONTEXT_MESSAGE_LIMIT = 10;
const UID_MAINTENANCE_INTERVAL_MS = 10_000;
const UID_MAINTENANCE_JOBS_PER_TICK = 10;

export class InsightsWorkerService {
  private readonly batchSize: number;
  private readonly model?: InsightSessionAnalyzer;
  private uidSessionConfigCache?: Map<number, InsightWorkerSessionizationConfig>;
  private uidFeatureConfigCache?: Map<number, InsightWorkerFeatureConfig>;

  constructor(
    private readonly repository: InsightWorkerRepositoryPort,
    options: {
      batchSize?: number;
      logger?: WorkerLogger;
      model?: InsightSessionAnalyzer;
      now?: () => number;
      startLookbackDays?: number;
    } = {},
  ) {
    this.batchSize = options.batchSize ?? 200;
    this.logger = options.logger;
    this.model = options.model;
    this.now = options.now ?? Date.now;
    this.startLookbackDays = options.startLookbackDays ?? 3;
  }

  private readonly logger?: WorkerLogger;
  private readonly now: () => number;
  private readonly startLookbackDays: number;

  async runOnce() {
    this.uidSessionConfigCache = new Map();
    this.uidFeatureConfigCache = new Map();

    try {
      await this.repository.seedUidMaintenanceJobs({
        limit: this.batchSize,
        runAfter: new Date(),
      });
      await this.runSyncMessagesJob();
      await this.runCleanupDisabledInsightsJob();
      await this.runUidMaintenanceJobs();

      if (this.model) {
        await this.runAnalyzeJobs(3);
      }

      await this.archiveTerminalJobs();
    } finally {
      this.uidSessionConfigCache = undefined;
      this.uidFeatureConfigCache = undefined;
    }
  }

  private resolveIncrementalStart(input: {
    cursor: InsightWorkerCursor;
    lastEnableTime?: number;
  }): InsightWorkerCursor {
    const lookbackMs = this.startLookbackDays * 24 * 60 * 60_000;
    const currentLookbackStart = this.now() - lookbackMs;
    const enableLookbackStart = input.lastEnableTime == null
      ? currentLookbackStart
      : input.lastEnableTime - lookbackMs;
    const cursorMsgtime = Math.max(
      input.cursor.cursorMsgtime,
      enableLookbackStart,
      currentLookbackStart,
    );

    return {
      cursorAuditId: cursorMsgtime === input.cursor.cursorMsgtime ? input.cursor.cursorAuditId : 0,
      cursorMsgtime,
    };
  }

  private async archiveTerminalJobs() {
    if (!this.repository.archiveTerminalJobs) {
      return;
    }

    const before = new Date(Date.now() - TERMINAL_JOB_ARCHIVE_RETENTION_DAYS * 24 * 60 * 60_000);

    try {
      await this.repository.archiveTerminalJobs({
        before,
        limit: TERMINAL_JOB_ARCHIVE_LIMIT,
      });
    } catch (error) {
      this.logger?.error({ err: error }, "会话洞察 worker 归档终态任务失败");
    }
  }

  private async scheduleLiveAnalysisForOpenSessions(activeUids: Set<number>) {
    const sessions = await this.repository.listOpenSessionsForLiveAnalysis({
      activeUids,
      limit: this.batchSize,
    });
    let scheduledJobs = 0;

    for (const session of sessions) {
      if (await this.createLiveAnalyzeJobIfNeeded({
        occurredAt: Date.now(),
        sessionId: session.sessionId,
        uid: session.uid,
      })) {
        scheduledJobs += 1;
      }
    }

    if (scheduledJobs > 0) {
      this.logger?.info(
        { checkedOpenSessions: sessions.length, scheduledJobs },
        "会话洞察 worker 已创建未完结会话提前分析任务",
      );
    }
  }

  private async runUidMaintenanceJobs(limit = UID_MAINTENANCE_JOBS_PER_TICK) {
    const claimedJobIds = new Set<string>();

    for (let i = 0; i < limit; i += 1) {
      const job = await this.repository.claimNextUidMaintenanceJob();

      if (!job || claimedJobIds.has(job.jobId)) {
        break;
      }

      claimedJobIds.add(job.jobId);
      await this.runUidMaintenanceJob(job);
    }
  }

  private async runUidMaintenanceJob(job: ClaimedUidMaintenanceJob) {
    try {
      const { insightEnabled, scannedMessages, sessionizedMessages } = await this.maintainUid(job.uid);

      if (!insightEnabled) {
        await this.repository.deleteUidMaintenanceJob(job.jobId);
        return;
      }

      if (scannedMessages > 0) {
        this.logger?.info(
          {
            activeUids: 1,
            scannedMessages,
            sessionizedMessages,
            uid: job.uid,
          },
          "会话洞察 worker 已扫描增量消息",
        );
      }

      await this.repository.rescheduleUidMaintenanceJob(job.jobId, {
        runAfter: new Date(Date.now() + UID_MAINTENANCE_INTERVAL_MS),
      });
    } catch (error) {
      await this.repository.markUidMaintenanceJobFailed(job.jobId, error);
      this.logger?.error(
        { err: error, jobId: job.jobId, uid: job.uid },
        "会话洞察 worker UID 维护任务失败",
      );
    }
  }

  private async maintainUid(uid: number) {
    const featureConfig = await this.repository.getFeatureConfig(uid);
    this.uidFeatureConfigCache?.set(featureConfig.uid, featureConfig);

    if (!featureConfig.insightEnabled) {
      return {
        insightEnabled: false,
        scannedMessages: 0,
        sessionizedMessages: 0,
      };
    }

    const cursor = await this.repository.getCursor(uid);
    const start = this.resolveIncrementalStart({
      cursor,
      lastEnableTime: featureConfig.lastEnableTime,
    });
    const messages = await this.repository.listIncrementalMessages({
      cursorAuditId: start.cursorAuditId,
      cursorMsgtime: start.cursorMsgtime,
      limit: this.batchSize,
      uid,
    });

    const existingSessions = await this.repository.listSessionsBySourceMessages({
      sourceMessageIds: messages.map((message) => message.id),
      uid,
    });
    const existingByMessageId = new Map(
      existingSessions
        .filter((session) => session.sourceMessageId)
        .map((session) => [session.sourceMessageId, session]),
    );
    let sessionizedMessages = 0;

    for (const message of messages) {
      if (existingByMessageId.has(message.id)) {
        continue;
      }

      if (await this.sessionizeMessage(message)) {
        sessionizedMessages += 1;
      }
    }

    const lastMessage = messages.at(-1);

    if (lastMessage) {
      await this.repository.updateCursor({
        cursorAuditId: Number(lastMessage.id),
        cursorMsgtime: lastMessage.msgtime,
        uid,
      });
    }

    const activeUids = new Set([uid]);
    await this.scheduleLiveAnalysisForOpenSessions(activeUids);
    await this.closeTimedOutOpenSessions(activeUids);

    return {
      insightEnabled: true,
      scannedMessages: messages.length,
      sessionizedMessages,
    };
  }

  private async runSyncMessagesJob() {
    const job = await this.repository.claimNextSyncMessagesJob();

    if (!job) {
      return;
    }

    this.logger?.info(
      { cursorMsgtime: job.cursorMsgtime, jobId: job.jobId, uid: job.uid },
      "会话洞察 worker 开始历史重刷",
    );

    try {
      if (job.rescanTaskId) {
        await this.repository.updateRescanTaskRunning(job.rescanTaskId);
      }

      let cursorAuditId = 0;
      let cursorMsgtime = job.cursorMsgtime;
      let scannedMessages = 0;
      let sessionizedMessages = 0;
      let scanCompleted = false;
      const sessionsToAnalyze = new Map<
        string,
        {
          lastMessageAt: number;
          status: InsightWorkerExistingSession["status"];
          uid: number;
        }
      >();

      for (let batchIndex = 0; batchIndex < SYNC_MESSAGES_MAX_BATCHES; batchIndex += 1) {
        const messages = await this.repository.listIncrementalMessages({
          cursorAuditId,
          cursorMsgtime,
          limit: this.batchSize,
          scanUntilMsgtime: job.scanUntilMsgtime,
          uid: job.uid,
        });

        const existingSessions = await this.repository.listSessionsBySourceMessages({
          sourceMessageIds: messages.map((message) => message.id),
          uid: job.uid,
        });
        const existingSessionsBySourceMessageId = new Map(
          existingSessions
            .filter((session) => session.sourceMessageId)
            .map((session) => [session.sourceMessageId, session]),
        );

        for (const message of messages) {
          const existingSession = existingSessionsBySourceMessageId.get(message.id);

          if (existingSession) {
            sessionsToAnalyze.set(existingSession.sessionId, {
              lastMessageAt: message.msgtime,
              status: existingSession.status,
              uid: existingSession.uid,
            });
            continue;
          }

          const sessionizedMessage = await this.sessionizeMessage(message, { skipLiveAnalysis: true });

          if (sessionizedMessage) {
            sessionizedMessages += 1;
            if (sessionizedMessage.includedForAi) {
              sessionsToAnalyze.set(sessionizedMessage.sessionId, {
                lastMessageAt: sessionizedMessage.occurredAt,
                status: "open",
                uid: sessionizedMessage.uid,
              });
            }
          }
        }
        scannedMessages += messages.length;

        const lastMessage = messages.at(-1);

        if (!lastMessage || messages.length < this.batchSize) {
          scanCompleted = true;
          break;
        }

        const nextCursorAuditId = Number(lastMessage.id);
        const nextCursorMsgtime = lastMessage.msgtime;

        if (
          nextCursorMsgtime < cursorMsgtime
          || (
            nextCursorMsgtime === cursorMsgtime
            && nextCursorAuditId <= cursorAuditId
          )
        ) {
          throw new Error("sync_messages cursor did not advance");
        }

        cursorAuditId = nextCursorAuditId;
        cursorMsgtime = nextCursorMsgtime;
      }

      if (!scanCompleted) {
        throw new Error("sync_messages exceeded batch safety limit");
      }

      let queuedFinalSessions = 0;

      for (const [sessionId, session] of sessionsToAnalyze) {
        if (session.status === "open") {
          continue;
        }

        await this.repository.createAnalyzeJob({
          analysisScope: job.analysisScope,
          jobType: "reanalyze_session",
          mode: "final",
          rescanTaskId: job.rescanTaskId,
          runAfter: new Date(),
          sessionId,
          uid: session.uid,
        });
        queuedFinalSessions += 1;
      }

      if (job.rescanTaskId) {
        await this.repository.updateRescanTaskAfterScan({
          queuedSessions: queuedFinalSessions,
          rescanTaskId: job.rescanTaskId,
          totalSessions: queuedFinalSessions,
        });
      }

      await this.repository.markSyncMessagesJobSucceeded(job.jobId);
      this.logger?.info(
        {
          jobId: job.jobId,
          reanalyzeSessions: queuedFinalSessions,
          scannedMessages,
          sessionizedMessages,
          uid: job.uid,
        },
        "会话洞察 worker 历史重刷完成",
      );
    } catch (error) {
      await this.repository.markSyncMessagesJobFailed(job.jobId, error);
      this.logger?.error(
        { err: error, jobId: job.jobId, uid: job.uid },
        "会话洞察 worker 历史重刷失败",
      );
    }
  }

  private async runCleanupDisabledInsightsJob() {
    const job = await this.repository.claimNextCleanupDisabledInsightsJob();

    if (!job) {
      return;
    }

    try {
      let featureConfig = this.uidFeatureConfigCache?.get(job.uid);
      if (!featureConfig) {
        featureConfig = await this.repository.getFeatureConfig(job.uid);
        this.uidFeatureConfigCache?.set(job.uid, featureConfig);
      }

      if (
        featureConfig.insightEnabled
        || featureConfig.lastEnableTime !== job.enableEpoch
      ) {
        await this.repository.markCleanupDisabledInsightsJobSucceeded(job.jobId);
        return;
      }

      let cleanupCompleted = false;

      for (let batchIndex = 0; batchIndex < CLEANUP_DISABLED_INSIGHTS_MAX_BATCHES; batchIndex += 1) {
        const closedSessions = await this.repository.closeDisabledOpenSessions({
          endedAt: Date.now(),
          limit: this.batchSize,
          uid: job.uid,
        });

        if (closedSessions < this.batchSize) {
          cleanupCompleted = true;
          break;
        }
      }

      if (!cleanupCompleted) {
        throw new Error("cleanup_disabled_insights exceeded batch safety limit");
      }

      await this.repository.markCleanupDisabledInsightsJobSucceeded(job.jobId);
    } catch (error) {
      await this.repository.markCleanupDisabledInsightsJobFailed(job.jobId, error);
      this.logger?.error(
        { err: error, jobId: job.jobId, uid: job.uid },
        "会话洞察 worker 清理已关闭洞察会话失败",
      );
    }
  }

  private async closeTimedOutOpenSessions(activeUids: Set<number>) {
    const sessions = await this.repository.listClosableOpenSessions({
      activeUids,
      limit: this.batchSize,
      now: Date.now(),
    });

    for (const session of sessions) {
      await this.repository.createAnalyzeJob({
        analysisScope: "all",
        jobType: "analyze_session",
        mode: "final",
        runAfter: new Date(session.endedAt + session.analysisDelayMinutes * 60_000),
        sessionId: session.sessionId,
        uid: session.uid,
      });
      await this.repository.closeSession({
        closeReason: session.closeReason,
        endedAt: session.endedAt,
        sessionId: session.sessionId,
      });
    }

    if (sessions.length > 0) {
      this.logger?.info(
        {
          closedSessions: sessions.length,
          sessionIds: sessions.map((session) => session.sessionId),
        },
        "会话洞察 worker 已关闭超时逻辑会话",
      );
    }
  }

  private async sessionizeMessage(
    message: InsightWorkerMessage,
    options: { skipLiveAnalysis?: boolean } = {},
  ): Promise<SessionizedMessageResult | undefined> {
    const conversation = await this.repository.findPlatformConversation(message);

    if (!conversation) {
      return undefined;
    }

    const input = buildInsightMessageInput(toMessageSourceRow(message, conversation.conversationId));

    let config = this.uidSessionConfigCache?.get(conversation.uid);
    if (!config) {
      config = await this.repository.getSessionizationConfig(conversation.uid);
      this.uidSessionConfigCache?.set(conversation.uid, config);
    }

    const openSession = await this.repository.findReusableSession({
      conversationId: conversation.conversationId,
      uid: conversation.uid,
    });
    const session = await this.resolveSessionId({
      config,
      conversation,
      input,
      message,
      openSession,
    });

    if (!session) {
      return undefined;
    }

    if (session.created && input.senderRole === "customer") {
      await this.appendPreContextMessages({
        config,
        conversation,
        occurredAt: input.occurredAt,
        sessionId: session.sessionId,
      });
    }

    await this.repository.appendSessionMessage({
      asset: parseWorkerMessageAsset(message),
      conversationId: conversation.conversationId,
      includedForAi: input.includedForAi,
      meaningfulForBoundary: input.meaningfulForBoundary,
      messageType: input.messageType,
      occurredAt: input.occurredAt,
      senderRole: input.senderRole,
      sessionId: session.sessionId,
      sourceMessageId: input.sourceMessageId,
      sourceMessageTime: input.occurredAt,
      uid: conversation.uid,
    });

    if (!options.skipLiveAnalysis && input.includedForAi) {
      await this.createLiveAnalyzeJobIfNeeded({
        occurredAt: input.occurredAt,
        sessionId: session.sessionId,
        uid: conversation.uid,
      });
    }

    return {
      includedForAi: input.includedForAi,
      occurredAt: input.occurredAt,
      sessionId: session.sessionId,
      uid: conversation.uid,
    };
  }

  private async createLiveAnalyzeJobIfNeeded(input: LiveAnalyzeCandidate) {
    if (
      !await this.repository.shouldCreateLiveAnalyzeJob({
        occurredAt: input.occurredAt,
        sessionId: input.sessionId,
        uid: input.uid,
      })
    ) {
      return false;
    }

    await this.repository.createAnalyzeJob({
      analysisScope: "all",
      jobType: "analyze_session",
      mode: "live",
      runAfter: new Date(),
      sessionId: input.sessionId,
      uid: input.uid,
    });

    return true;
  }

  private async appendPreContextMessages(input: {
    config: InsightWorkerSessionizationConfig;
    conversation: InsightWorkerConversation;
    occurredAt: number;
    sessionId: string;
  }) {
    const rows = await this.repository.listUnassignedPreContextMessages({
      conversationId: input.conversation.conversationId,
      limit: PRE_CONTEXT_MESSAGE_LIMIT,
      occurredBefore: input.occurredAt,
      uid: input.conversation.uid,
      windowStart: input.occurredAt - input.config.idleTimeoutMinutes * 60_000,
    });

    for (const row of rows) {
      const preContext = buildInsightMessageInput(toAnalysisMessageSourceRow(row));

      if (
        !preContext.includedForAi
        || (preContext.senderRole !== "agent" && preContext.senderRole !== "bot")
      ) {
        continue;
      }

      await this.repository.appendSessionMessage({
        asset: parseWorkerMessageAsset(row),
        conversationId: input.conversation.conversationId,
        includedForAi: preContext.includedForAi,
        meaningfulForBoundary: preContext.meaningfulForBoundary,
        messageType: preContext.messageType,
        occurredAt: preContext.occurredAt,
        senderRole: preContext.senderRole,
        sessionId: input.sessionId,
        sourceMessageId: preContext.sourceMessageId,
        sourceMessageTime: preContext.occurredAt,
        uid: input.conversation.uid,
      });
    }
  }

  private async resolveSessionId(input: {
    config: InsightWorkerSessionizationConfig;
    conversation: InsightWorkerConversation;
    input: ReturnType<typeof buildInsightMessageInput>;
    message: InsightWorkerMessage;
    openSession: InsightWorkerOpenSession | undefined;
  }): Promise<{ created: boolean; sessionId: string } | undefined> {
    const { config, conversation, openSession } = input;
    const occurredAt = input.input.occurredAt;
    const canOpenSession = input.input.senderRole === "customer" && input.input.includedForAi;

    if (!openSession) {
      if (!canOpenSession) {
        return undefined;
      }

      return {
        created: true,
        sessionId: await this.repository.createLogicalSession({
          config,
          conversationId: conversation.conversationId,
          startedAt: occurredAt,
          thirdExternalUserId: input.message.thirdExternalId,
          thirdUserId: input.message.thirdUserId,
          uid: conversation.uid,
        }),
      };
    }

    const closeReason = getCloseReason(openSession, config, occurredAt);

    if (!closeReason) {
      if (openSession.status === "canceled") {
        if (!canOpenSession) {
          return undefined;
        }

        await this.repository.reopenSession({
          sessionId: openSession.sessionId,
          uid: conversation.uid,
        });
      }

      return {
        created: false,
        sessionId: openSession.sessionId,
      };
    }

    if (openSession.status !== "canceled") {
      await this.repository.closeSession({
        closeReason,
        endedAt: occurredAt,
        sessionId: openSession.sessionId,
      });
      await this.repository.createAnalyzeJob({
        analysisScope: "all",
        jobType: "analyze_session",
        mode: "final",
        runAfter: new Date(occurredAt + config.analysisDelayMinutes * 60_000),
        sessionId: openSession.sessionId,
        uid: conversation.uid,
      });
    }

    if (!canOpenSession) {
      return undefined;
    }

    return {
      created: true,
      sessionId: await this.repository.createLogicalSession({
        config,
        conversationId: conversation.conversationId,
        startedAt: occurredAt,
        thirdExternalUserId: input.message.thirdExternalId,
        thirdUserId: input.message.thirdUserId,
        uid: conversation.uid,
      }),
    };
  }

  private async runAnalyzeJobs(concurrency = 3) {
    if (!this.model) {
      return;
    }

    const jobs: ClaimedAnalyzeJob[] = [];
    for (let i = 0; i < concurrency; i++) {
      const job = await this.repository.claimNextAnalyzeJob();
      if (!job) break;
      jobs.push(job);
    }

    if (jobs.length === 0) return;

    const jobsBySession = new Map<string, ClaimedAnalyzeJob[]>();
    for (const job of jobs) {
      let list = jobsBySession.get(job.sessionId);
      if (!list) {
        list = [];
        jobsBySession.set(job.sessionId, list);
      }
      list.push(job);
    }

    await Promise.allSettled(
      Array.from(jobsBySession.values()).map(async (sessionJobs) => {
        for (const job of sessionJobs) {
          await this.processAnalyzeJob(job);
        }
      })
    );
  }

  private async processAnalyzeJob(job: ClaimedAnalyzeJob) {
    // 仅作防御性检查以满足 TS 校验，实际外层跑循环前已在 runAnalyzeJobs 中统一拦截
    if (!this.model) {
      return;
    }

    let runId: string | undefined;
    const startedAt = Date.now();

    this.logger?.info(
      {
        jobId: job.jobId,
        mode: job.mode,
        sessionId: job.sessionId,
        uid: job.uid,
      },
      "会话洞察 worker 开始分析任务",
    );

    try {
      const sourceRows = await this.repository.listSessionMessagesForAnalysis(job.sessionId);
      const messages = sourceRows.map((row) =>
        buildInsightMessageInput(toAnalysisMessageSourceRow(row)),
      );
      const sourceMessageIds = messages.map((message) => message.sourceMessageId);
      const pendingTranscriptionCount = messages.filter((message) =>
        message.contentStatus === "pending_transcription"
      ).length;

      if (pendingTranscriptionCount > 0 && job.attemptCount <= INPUT_READINESS_MAX_POSTPONES) {
        await this.repository.postponeAnalysisJobForInputReadiness(job.jobId, {
          delayMs: INPUT_READINESS_RETRY_DELAY_MS,
          reason: "pending_transcription",
        });
        this.logger?.info(
          {
            jobId: job.jobId,
            pendingTranscriptionCount,
            sessionId: job.sessionId,
            uid: job.uid,
          },
          "会话洞察 worker 延后分析任务，等待语音转写",
        );
        return;
      }

      const modelMessages = messages.filter((message) =>
        message.includedForAi !== false && message.contentStatus === "ready"
      );
      const pendingInputWarnings = pendingTranscriptionCount > 0
        ? ["存在未完成语音转写"]
        : [];
      const policy = await this.repository.getAnalysisPolicy(job.uid);
      runId = await this.repository.startAnalysisRun({
        analysisScope: job.analysisScope,
        jobId: job.jobId,
        mode: job.mode,
        sessionId: job.sessionId,
        sourceMessageFrom: sourceMessageIds.at(0) ?? null,
        sourceMessageTo: sourceMessageIds.at(-1) ?? null,
      });
      if (modelMessages.length < policy.minAnalysisMessages) {
        const reason = `AI有效消息数 ${modelMessages.length} 低于最小分析消息数 ${policy.minAnalysisMessages}`;

        if (job.mode === "live") {
          await this.repository.markAnalysisRunSucceededWithoutSnapshot({
            reason,
            runId,
          });
        } else {
          const previousOutput = job.analysisScope === "all"
            ? undefined
            : await this.repository.getCurrentAnalysisOutput({
              sessionId: job.sessionId,
              uid: job.uid,
            });
          const output = mergeScopedAnalysisOutput(
            job.analysisScope,
            previousOutput,
            buildInsufficientMessagesOutput(),
          );
          const policyAdjustedOutput = applyModeOutputPolicy(job.mode, output);

          await this.repository.saveAnalysisResult({
            job,
            output: policyAdjustedOutput,
            resultKind: "insufficient_messages",
            runId,
            sourceMessageHighWatermark: sourceMessageIds.at(-1) ?? null,
            validationWarnings: [],
          });
        }

        await this.finishAnalyzeJobSucceeded(job);
        this.logger?.info(
          {
            jobId: job.jobId,
            messageCount: modelMessages.length,
            minAnalysisMessages: policy.minAnalysisMessages,
            mode: job.mode,
            sessionId: job.sessionId,
            uid: job.uid,
          },
          "会话洞察 worker 跳过模型分析，消息不足",
        );
        return;
      }
      const context = await this.repository.getPromptContext(job.uid);
      const previousSessionContexts = await this.repository.listPreviousSessionContexts({
        currentSessionId: job.sessionId,
        limit: PREVIOUS_SESSION_CONTEXT_LIMIT,
        lookbackHours: PREVIOUS_SESSION_LOOKBACK_HOURS,
        uid: job.uid,
      });
      const previousOutput = job.analysisScope === "all"
        ? undefined
        : await this.repository.getCurrentAnalysisOutput({
          sessionId: job.sessionId,
          uid: job.uid,
        });
      // The live gate is only for full live snapshots; scoped reanalysis already has an explicit target.
      if (job.mode === "live" && job.analysisScope === "all" && this.model.evaluateLiveAnalysisGate) {
        const previousOutputForGate = await this.repository.getCurrentAnalysisOutput({
          sessionId: job.sessionId,
          uid: job.uid,
        });
        const previousGateSkip = await this.repository.getLatestLiveGateSkip({
          afterSourceMessageId: previousOutputForGate?.sourceMessageHighWatermark,
          sessionId: job.sessionId,
          uid: job.uid,
        });
        let gateDecision: InsightLiveAnalysisGateDecision;

        try {
          gateDecision = await this.model.evaluateLiveAnalysisGate({
            context,
            job,
            messages: modelMessages,
            previousGateSkip,
            previousOutput: previousOutputForGate,
            previousSessionContexts,
          });
        } catch (error) {
          this.logger?.error(
            {
              err: error,
              jobId: job.jobId,
              messageCount: modelMessages.length,
              sessionId: job.sessionId,
              uid: job.uid,
            },
            "会话洞察 worker 未完结会话 gate 执行失败，按策略跳过完整分析",
          );
          gateDecision = {
            changeType: "no_material_change",
            reason: `live gate failed: ${formatError(error)}`,
            shouldAnalyze: false,
          };
        }

        if (!gateDecision.shouldAnalyze) {
          await this.repository.markAnalysisRunSucceededWithoutSnapshot({
            code: "LIVE_GATE_SKIPPED",
            reason: gateDecision.reason,
            runId,
          });
          await this.finishAnalyzeJobSucceeded(job);
          this.logger?.info(
            {
              changeType: gateDecision.changeType,
              jobId: job.jobId,
              messageCount: modelMessages.length,
              reason: gateDecision.reason,
              sessionId: job.sessionId,
              uid: job.uid,
            },
            "会话洞察 worker 跳过未完结会话提前分析，未发现实质变化",
          );
          return;
        }
      }
      const actionItemPolicy = await this.resolveActionItemGenerationPolicy({
        job,
        modelMessages,
      });

      const analyzerOutput = await this.model.analyzeSession({
        context,
        existingActionItems: actionItemPolicy.existingActionItems,
        job,
        messages: modelMessages,
        previousOutput,
        previousSessionContexts,
      });
      const { analysisWarnings, output: cleanAnalyzerOutput } = splitAnalyzerOutput(analyzerOutput);
      const configuredOutput = filterConfiguredAnalysisOutput(cleanAnalyzerOutput, context);
      const output = normalizeEvidenceIds(configuredOutput.output, new Set(sourceMessageIds));
      const confidenceAdjustedOutput = applyProblemResolutionConfidencePolicy(policy, output.output);
      const mergedOutput = mergeScopedAnalysisOutput(job.analysisScope, previousOutput, confidenceAdjustedOutput);
      const policyAdjustedOutput = applyModeOutputPolicy(job.mode, mergedOutput, {
        suppressActionItems: actionItemPolicy.suppressActionItems,
      });
      const validationWarnings = [
        ...analysisWarnings,
        ...configuredOutput.validationWarnings,
        ...output.validationWarnings,
        ...pendingInputWarnings,
      ];

      const snapshotId = await this.repository.saveAnalysisResult({
        job,
        output: policyAdjustedOutput,
        resultKind: "model_analysis",
        runId,
        sourceMessageHighWatermark: sourceMessageIds.at(-1) ?? null,
        validationWarnings,
      });
      await this.finishAnalyzeJobSucceeded(job);
      this.logger?.info(
        {
          durationMs: Date.now() - startedAt,
          jobId: job.jobId,
          messageCount: messages.length,
          mode: job.mode,
          sessionId: job.sessionId,
          snapshotId,
          validationWarningCount: validationWarnings.length,
        },
        "会话洞察 worker 分析任务完成",
      );
    } catch (error) {
      if (runId) {
        await this.repository.markAnalysisRunFailed(runId, error);
      }

      await this.repository.markAnalysisJobFailed(job.jobId, error);
      if (job.rescanTaskId) {
        await this.repository.updateRescanTaskAfterAnalysis({
          failedSessions: 1,
          rescanTaskId: job.rescanTaskId,
          succeededSessions: 0,
        });
      }
      this.logger?.error(
        {
          durationMs: Date.now() - startedAt,
          err: error,
          jobId: job.jobId,
          mode: job.mode,
          sessionId: job.sessionId,
          uid: job.uid,
        },
        "会话洞察 worker 分析任务失败",
      );
    }
  }

  private async finishAnalyzeJobSucceeded(job: ClaimedAnalyzeJob) {
    await this.repository.markAnalysisJobSucceeded(job.jobId);
    if (job.rescanTaskId) {
      await this.repository.updateRescanTaskAfterAnalysis({
        failedSessions: 0,
        rescanTaskId: job.rescanTaskId,
        succeededSessions: 1,
      });
    }
  }

  private async resolveActionItemGenerationPolicy(input: {
    job: ClaimedAnalyzeJob;
    modelMessages: AiMessageInput[];
  }): Promise<{
    existingActionItems: RecentActionItemForPrompt[];
    suppressActionItems: boolean;
  }> {
    if (input.job.mode !== "final" || input.job.analysisScope !== "all") {
      return {
        existingActionItems: [],
        suppressActionItems: true,
      };
    }

    const conversationId = input.modelMessages
      .map((message) => message.conversationId)
      .find((value): value is string => Boolean(value));

    if (!conversationId) {
      return {
        existingActionItems: [],
        suppressActionItems: false,
      };
    }

    const recentActionItems = await this.repository.listRecentActionItemsForPrompt({
      conversationId,
      limit: 10,
      uid: input.job.uid,
    });
    const openCount = recentActionItems.filter((item) => item.status === "open").length;

    return {
      existingActionItems: openCount > 5 ? [] : recentActionItems,
      suppressActionItems: openCount > 5,
    };
  }

}

function buildInsufficientMessagesOutput(): InsightAnalysisOutput {
  return {
    actionItems: [],
    entities: [],
    faqCandidates: [],
    intents: [],
    problemResolution: {
      confidence: 0,
      evidence: [],
      evidenceMessageIds: [],
      problemDetected: false,
      problemSummary: "",
      resolutionStatus: "unknown",
      unresolvedReason: "",
    },
    qaFindings: [],
    sentiment: [],
    summary: {
      sessionTitle: "",
      text: "",
    },
    tags: [],
  };
}

function applyProblemResolutionConfidencePolicy(
  policy: InsightWorkerAnalysisPolicy,
  output: InsightAnalysisOutput,
): InsightAnalysisOutput {
  if (output.problemResolution.confidence >= policy.lowConfidenceThreshold) {
    return output;
  }

  return {
    ...output,
    actionItems: [],
    problemResolution: {
      ...output.problemResolution,
      problemDetected: false,
      resolutionStatus: "unknown",
    },
  };
}

function splitAnalyzerOutput(output: InsightAnalyzerOutput) {
  const { analysisWarnings = [], ...cleanOutput } = output;

  return {
    analysisWarnings,
    output: cleanOutput,
  };
}

function mergeScopedAnalysisOutput(
  scope: ClaimedAnalyzeJob["analysisScope"],
  previousOutput: InsightAnalysisOutput | undefined,
  nextOutput: InsightAnalysisOutput,
): InsightAnalysisOutput {
  if (scope === "all" || !previousOutput) {
    return nextOutput;
  }

  if (scope === "qaFindings") {
    return {
      ...previousOutput,
      qaFindings: nextOutput.qaFindings,
    };
  }

  return {
    ...previousOutput,
    entities: nextOutput.entities,
    intents: nextOutput.intents,
    tags: nextOutput.tags,
  };
}

function applyModeOutputPolicy(
  mode: ClaimedAnalyzeJob["mode"],
  output: InsightAnalysisOutput,
  options: { suppressActionItems?: boolean } = {},
): InsightAnalysisOutput {
  if (mode === "final") {
    return {
      ...output,
      actionItems: options.suppressActionItems ? [] : output.actionItems,
      faqCandidates: [],
    };
  }

  return {
    ...output,
    actionItems: [],
    faqCandidates: [],
  };
}

export function createNonOverlappingTicker(run: () => Promise<void>): NonOverlappingTicker {
  let running = false;
  let currentRun: Promise<boolean> | undefined;

  return {
    async tick() {
      if (running) {
        return false;
      }

      running = true;
      currentRun = (async () => {
        try {
          await run();

          return true;
        } finally {
          running = false;
          currentRun = undefined;
        }
      })();

      return currentRun;
    },
    async waitForIdle() {
      await currentRun;
    },
  };
}

function getCloseReason(
  session: InsightWorkerOpenSession,
  config: InsightWorkerSessionizationConfig,
  occurredAt: number,
): CloseSessionInput["closeReason"] | undefined {
  const idleBase = session.lastMeaningfulMessageAt ?? session.startedAt;

  if (occurredAt - session.startedAt > config.hardMaxDurationHours * 60 * 60_000) {
    return "hard_max_duration";
  }

  if (occurredAt - idleBase > config.idleTimeoutMinutes * 60_000) {
    return "idle_timeout";
  }

  return undefined;
}

function toMessageSourceRow(
  message: InsightWorkerMessage,
  conversationId: string,
): InsightMessageSourceRow {
  return {
    chat_type: message.chatType,
    content: message.content,
    conversation_id: conversationId,
    from_type: message.fromType,
    id: message.id,
    msgtime: message.msgtime,
    msgtype: message.msgtype,
    third_from_id: "",
    third_user_id: message.thirdUserId,
  };
}

function toAnalysisMessageSourceRow(row: InsightAnalysisMessageRow): InsightMessageSourceRow {
  return {
    chat_type: row.chatType,
    content: row.content,
    conversation_id: row.conversationId,
    from_type: row.fromType,
    id: row.id,
    msgtime: row.msgtime,
    msgtype: row.msgtype,
    third_from_id: "",
    third_user_id: row.thirdUserId,
  };
}

function normalizeEvidenceIds(output: InsightAnalysisOutput, validIds: Set<string>) {
  const validationWarnings: string[] = [];
  const clean = (dimension: string, evidenceMessageIds: string[]) => {
    const valid: string[] = [];

    for (const id of evidenceMessageIds) {
      if (validIds.has(id)) {
        valid.push(id);
      } else {
        validationWarnings.push(`${dimension} evidence message ${id} is not in current logical session`);
      }
    }

    return Array.from(new Set(valid));
  };
  const cleanEvidence = (dimension: string, evidence: InsightEvidenceReference[]) => {
    const seen = new Set<string>();
    const valid: InsightEvidenceReference[] = [];

    for (const item of evidence) {
      if (!validIds.has(item.messageId)) {
        validationWarnings.push(`${dimension} evidence message ${item.messageId} is not in current logical session`);
        continue;
      }

      const key = `${item.messageId}:${item.evidenceRole}:${item.reason ?? ""}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      valid.push(item);
    }

    return valid;
  };

  return {
    output: {
      ...output,
      actionItems: output.actionItems.map((item) => ({
        ...item,
        evidenceMessageIds: clean("action_item", item.evidenceMessageIds),
      })),
      entities: output.entities.map((item) => ({
        ...item,
        evidenceMessageIds: clean("entity", item.evidenceMessageIds),
      })),
      faqCandidates: output.faqCandidates.map((item) => ({
        ...item,
        evidenceMessageIds: clean("faq_candidate", item.evidenceMessageIds),
      })),
      intents: output.intents.map((item) => ({
        ...item,
        evidenceMessageIds: clean("intent", item.evidenceMessageIds),
      })),
      problemResolution: {
        ...output.problemResolution,
        evidence: cleanEvidence(
          "problem_resolution",
          output.problemResolution.evidence,
        ),
        evidenceMessageIds: clean(
          "problem_resolution",
          output.problemResolution.evidenceMessageIds,
        ),
      },
      qaFindings: output.qaFindings.map((item) => ({
        ...item,
        evidenceMessageIds: clean("qa_finding", item.evidenceMessageIds),
      })),
      sentiment: output.sentiment.map((item) => ({
        ...item,
        evidenceMessageIds: clean("sentiment", item.evidenceMessageIds),
      })),
      tags: output.tags.map((item) => ({
        ...item,
        evidenceMessageIds: clean("tag", item.evidenceMessageIds),
      })),
    },
    validationWarnings,
  };
}

function filterConfiguredAnalysisOutput(
  output: InsightAnalysisOutput,
  context: InsightPromptContext,
): { output: InsightAnalysisOutput; validationWarnings: string[] } {
  const validationWarnings: string[] = [];
  const intentConfigsByCode = new Map(
    context.intentConfigs.map((item) => [normalizeMatchText(item.intentCode), item]),
  );
  const labelConfigsByCode = new Map(
    context.labelConfigs.map((item) => [normalizeMatchText(item.labelCode), item]),
  );
  const qaRuleConfigsByCode = new Map(
    context.qaRuleConfigs.map((item) => [item.ruleCode, item]),
  );
  const entityDictionaryByCode = new Map(
    context.entityDictionary.map((item) => [normalizeMatchText(item.entityCode), item]),
  );
  const entities = output.entities.flatMap((item) => {
    const entityCode = normalizeMatchText(item.entityCode ?? "");
    const matched = entityCode ? entityDictionaryByCode.get(entityCode) : undefined;

    if (!matched) {
      validationWarnings.push(`entity ${item.entityCode ?? item.entityName} is not configured`);
    }

    return matched
      ? [{
        ...item,
        entityCode: matched.entityCode,
        entityId: String(matched.id),
        entityName: matched.entityName,
      }]
      : [];
  });
  const tags = output.tags.flatMap((item) => {
    const tagCode = normalizeMatchText(item.tagCode ?? "");
    const matched = tagCode ? labelConfigsByCode.get(tagCode) : undefined;

    if (!matched) {
      validationWarnings.push(`tag ${item.tagCode ?? item.tagName} is not configured`);
    }

    return matched
      ? [{
        ...item,
        tagCode: matched.labelCode,
        tagId: String(matched.id),
        tagName: matched.labelName,
      }]
      : [];
  });
  const intents = output.intents.flatMap((item) => {
    const intentCode = normalizeMatchText(item.intentCode ?? "");
    const config = intentCode ? intentConfigsByCode.get(intentCode) : undefined;

    if (config) {
      return [{
        ...item,
        intentCode: config.intentCode,
        intentId: String(config.id),
        intentLabel: config.intentName,
      }];
    }

    validationWarnings.push(`intent ${item.intentCode ?? item.intentLabel} is not configured`);
    return [];
  });
  const qaFindingsByRuleCode = new Map<string, InsightAnalysisOutput["qaFindings"][number]>();
  for (const item of output.qaFindings) {
    const config = qaRuleConfigsByCode.get(item.ruleCode);

    if (config) {
      if (!qaFindingsByRuleCode.has(item.ruleCode)) {
        qaFindingsByRuleCode.set(item.ruleCode, {
          ...item,
          ruleName: config.ruleName,
          severity: config.severity,
        });
      }
      continue;
    }

    validationWarnings.push(`qa rule ${item.ruleCode} is not configured`);
  }
  const qaFindings = context.qaRuleConfigs.map((config) =>
    qaFindingsByRuleCode.get(config.ruleCode) ?? {
      confidence: 0,
      evidenceMessageIds: [],
      passed: true,
      reason: "模型未识别出该质检项存在问题，按通过处理",
      ruleCode: config.ruleCode,
      ruleName: config.ruleName,
      severity: config.severity,
    }
  );

  return {
    output: {
      ...output,
      entities,
      intents,
      qaFindings,
      tags,
    },
    validationWarnings,
  };
}

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase();
}

export function parseWorkerMessageAsset(
  message: Pick<InsightWorkerMessage, "content" | "msgtype">,
): AppendSessionMessageInput["asset"] {
  const parsed = parseInsightMessageContent(message.content);

  if (message.msgtype === "link") {
    const rawUrl =
      readInsightContentString(parsed, "url") ||
      readInsightContentString(parsed, "href") ||
      readInsightContentString(parsed, "linkUrl");
    const normalizedUrl = normalizeAssetUrlWithoutQuery(rawUrl);
    const title =
      readInsightContentString(parsed, "title") ||
      readInsightContentString(parsed, "content") ||
      readInsightContentString(parsed, "description") ||
      normalizedUrl ||
      "未知链接";

    return {
      key: normalizedUrl || `link:${title}`,
      name: title,
      type: "link",
    };
  }

  if (message.msgtype === "weapp") {
    const appId =
      readInsightContentString(parsed, "appId") ||
      readInsightContentString(parsed, "appid");
    const rawPath =
      readInsightContentString(parsed, "pagePath") ||
      readInsightContentString(parsed, "pagepath") ||
      readInsightContentString(parsed, "path");
    const normalizedPath = normalizeAssetPathWithoutQuery(rawPath);
    const title =
      readInsightContentString(parsed, "description") ||
      readInsightContentString(parsed, "appName") ||
      readInsightContentString(parsed, "title") ||
      normalizedPath ||
      "未知小程序";
    const key = [appId, normalizedPath].filter(Boolean).join(":");

    return {
      key: key || `miniapp:${title}`,
      name: title,
      type: "miniapp",
    };
  }

  if (message.msgtype === "file") {
    const fileName = readInsightContentString(parsed, "fileName") || "未知文件";
    const fileUrl =
      normalizeAssetUrlWithoutQuery(readInsightContentString(parsed, "fileUrl")) ||
      normalizeAssetUrlWithoutQuery(readInsightContentString(parsed, "url"));
    const stableId =
      readInsightContentString(parsed, "fileSerialNo") ||
      readInsightContentString(parsed, "fileId") ||
      fileUrl ||
      fileName;

    return {
      key: stableId,
      name: fileName,
      type: "file",
    };
  }

  return undefined;
}

function normalizeAssetUrlWithoutQuery(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return stripAssetQueryAndHash(trimmed);
  }
}

function normalizeAssetPathWithoutQuery(value: string) {
  return stripAssetQueryAndHash(value.trim());
}

function stripAssetQueryAndHash(value: string) {
  return value.split("#")[0]?.split("?")[0]?.trim() ?? "";
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function startInsightsWorker(options: {
  intervalMs?: number;
  logger: WorkerLogger;
  runOnce: () => Promise<void>;
}) {
  const intervalMs = options.intervalMs ?? 3_000;
  const ticker = createNonOverlappingTicker(options.runOnce);
  const timer = setInterval(() => {
    void ticker.tick().catch((error: unknown) => {
      options.logger.error({ err: error }, "会话洞察 worker tick 失败");
    });
  }, intervalMs);

  options.logger.info({ intervalMs }, "会话洞察 worker 已启动");

  return {
    async stop() {
      clearInterval(timer);
      await ticker.waitForIdle();
    },
    ticker,
  };
}
