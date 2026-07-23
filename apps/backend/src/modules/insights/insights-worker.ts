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
import {
  getWorkerErrorCode,
  safeErrorPayload,
  type InsightsWorkerObservability,
} from "./insights-worker-observability.js";

type WorkerLogger = {
  error(payload: Record<string, unknown>, message: string): void;
  debug?(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
  warn?(payload: Record<string, unknown>, message: string): void;
};

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
  closeReason: "hard_max_duration" | "idle_timeout";
  endedAt: number;
  sessionId: string;
};

export type FinalizeOpenSessionInput = CloseSessionInput & {
  analysisDelayMinutes: number;
  uid: number;
};

export type ClaimedSessionizationUidJob = {
  claimToken: string;
  jobId: string;
  uid: number;
};

export type DiscoverMessageUidsResult = {
  cursorAuditId: number;
  discoveredMessages: number;
  discoveredUids: number;
  skipped: boolean;
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
  inputReadinessPostponed?: boolean;
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

export type InsightWorkerPipelineRuntimeReport = {
  lastDurationMs?: number;
  lastErrorCode?: string;
  lastFailureAt?: Date;
  lastStartedAt?: Date;
  lastSuccessAt?: Date;
  pipeline: "analysis" | "discovery" | "sessionization";
  reportedBy: string;
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
  reclaimExpiredRunningJobs?(input: {
    now: Date;
  }): Promise<number>;
  reclaimExpiredSessionizationUidJobs?(input: {
    now: Date;
  }): Promise<number>;
  renewSessionizationUidJobLease(input: ClaimedSessionizationUidJob): Promise<boolean>;
  claimNextAnalyzeJob(): Promise<ClaimedAnalyzeJob | undefined>;
  claimNextSessionizationUidJob(input?: {
    excludeJobIds?: string[];
  }): Promise<ClaimedSessionizationUidJob | undefined>;
  claimNextSyncMessagesJob(): Promise<ClaimedSyncMessagesJob | undefined>;
  completeSessionizationUidJob(input: ClaimedSessionizationUidJob): Promise<"deleted" | "pending">;
  createAnalyzeJob(input: CreateAnalyzeJobInput): Promise<string>;
  createLogicalSession(input: CreateLogicalSessionInput): Promise<string>;
  discoverMessageUids(input: { batchSize: number; now: Date }): Promise<DiscoverMessageUidsResult>;
  enqueueClosableSessionUids(input: { limit: number; now: number }): Promise<number>;
  finalizeOpenSession(input: FinalizeOpenSessionInput): Promise<boolean>;
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
  hasPendingMessages(input: {
    cursorAuditId: number;
    cursorMsgtime: number;
    uid: number;
  }): Promise<boolean>;
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
    activeUids: Set<number>;
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
  markAnalysisJobFailed(jobId: string, error: unknown): Promise<void>;
  retryAnalysisJob(jobId: string, error: unknown, input: { delayMs: number }): Promise<void>;
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
  markSessionizationUidJobFailed(
    input: ClaimedSessionizationUidJob,
    error: unknown,
  ): Promise<void>;
  postponeAnalysisJobForInputReadiness(
    jobId: string,
    input: { delayMs: number; reason: string },
  ): Promise<void>;
  reopenSession(input: {
    sessionId: string;
    uid: number;
  }): Promise<boolean>;
  saveAnalysisResult(input: SaveAnalysisResultInput): Promise<string>;
  skipAutomaticAnalysisJob(job: ClaimedAnalyzeJob): Promise<void>;
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
  upsertWorkerPipelineRuntimeState?(
    input: InsightWorkerPipelineRuntimeReport,
  ): Promise<void>;
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
const UID_MAINTENANCE_JOBS_PER_TICK = 10;
const SESSIONIZATION_CLAIM_HEARTBEAT_MS = 60_000;
const ANALYSIS_RETRY_DELAY_MS = 60_000;

export class InsightsWorkerService {
  private readonly batchSize: number;
  private readonly model?: InsightSessionAnalyzer;

  constructor(
    private readonly repository: InsightWorkerRepositoryPort,
    options: {
      batchSize?: number;
      logger?: WorkerLogger;
      model?: InsightSessionAnalyzer;
      now?: () => number;
      observability?: InsightsWorkerObservability;
    } = {},
  ) {
    this.batchSize = options.batchSize ?? 200;
    this.logger = options.logger;
    this.model = options.model;
    this.now = options.now ?? Date.now;
    this.observability = options.observability;
  }

  private readonly logger?: WorkerLogger;
  private readonly now: () => number;
  private readonly observability?: InsightsWorkerObservability;

  async runOnce() {
    await this.runDiscoveryOnce();
    await this.runSessionizationOnce();
    await this.runAnalysisOnce();
  }

  async runDiscoveryOnce() {
    const result = await this.repository.discoverMessageUids({
      batchSize: this.batchSize,
      now: new Date(this.now()),
    });
    this.observability?.increment(
      "discovery",
      "discoveredMessages",
      result.discoveredMessages,
    );
    this.observability?.increment(
      "discovery",
      "discoveredUids",
      result.discoveredUids,
    );
    this.observability?.set("discovery", "cursorAuditId", result.cursorAuditId);
    if (result.skipped) {
      this.observability?.increment("discovery", "lockSkipped");
    } else if (result.discoveredMessages === 0) {
      this.observability?.increment("discovery", "emptyBatches");
    }
    this.observability?.event({
      eventCode: "insights_worker.discovery_batch",
      level: "debug",
      message: "会话洞察 Worker 完成消息发现批次",
      payload: result,
      pipeline: "discovery",
    });

    return result;
  }

  async runSessionizationOnce() {
    const reclaimed = await this.repository.reclaimExpiredSessionizationUidJobs?.({
      now: new Date(this.now()),
    }) ?? 0;
    if (reclaimed > 0) {
      this.observability?.increment("sessionization", "leasesReclaimed", reclaimed);
      this.observability?.event({
        eventCode: "insights_worker.lease_reclaimed",
        level: "warn",
        message: "会话洞察 Worker 回收过期切片租约",
        payload: { reclaimed },
        pipeline: "sessionization",
        throttleKey: "lease_reclaimed",
      });
    }
    await this.repository.enqueueClosableSessionUids({
      limit: this.batchSize,
      now: this.now(),
    });
    await this.runUidMaintenanceJobs();
  }

  async runAnalysisOnce() {
    const reclaimed = await this.repository.reclaimExpiredRunningJobs?.({
      now: new Date(this.now()),
    }) ?? 0;
    if (reclaimed > 0) {
      this.observability?.event({
        eventCode: "insights_worker.lease_reclaimed",
        level: "warn",
        message: "会话洞察 Worker 回收过期分析租约",
        payload: { reclaimed },
        pipeline: "analysis",
        throttleKey: "lease_reclaimed",
      });
    }
    await this.runSyncMessagesJob();
    if (this.model) {
      await this.runAnalyzeJobs(3);
    }
    await this.archiveTerminalJobs();
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
      this.observability?.recover("archive", "analysis");
    } catch (error) {
      this.observability?.increment("analysis", "archiveFailures");
      if (this.observability) {
        this.observability.event({
          errorCode: getWorkerErrorCode(error),
          eventCode: "insights_worker.archive_failed",
          level: "warn",
          message: "会话洞察 Worker 归档终态任务失败",
          payload: safeErrorPayload(error),
          pipeline: "analysis",
          throttleKey: "archive",
        });
      } else {
        this.logger?.error({ err: error }, "会话洞察 worker 归档终态任务失败");
      }
    }
  }

  private async scheduleLiveAnalysisForOpenSessions(activeUids: Set<number>) {
    const sessions = await this.repository.listOpenSessionsForLiveAnalysis({
      activeUids,
      limit: this.batchSize,
    });
    let scheduledJobs = 0;
    const scheduledJobsByUid = new Map<number, number>();

    for (const session of sessions) {
      if (await this.createLiveAnalyzeJobIfNeeded({
        occurredAt: Date.now(),
        sessionId: session.sessionId,
        uid: session.uid,
      })) {
        scheduledJobs += 1;
        scheduledJobsByUid.set(
          session.uid,
          (scheduledJobsByUid.get(session.uid) ?? 0) + 1,
        );
      }
    }

    if (scheduledJobs > 0) {
      this.observability?.increment(
        "sessionization",
        "liveJobsScheduled",
        scheduledJobs,
      );
      if (this.observability) {
        for (const [uid, uidScheduledJobs] of scheduledJobsByUid) {
          this.observability.event({
            eventCode: "insights_worker.live_analysis_scheduled",
            level: "debug",
            message: "会话洞察 Worker 已调度实时分析",
            payload: { scheduledJobs: uidScheduledJobs },
            pipeline: "sessionization",
            uid,
          });
        }
      } else {
        this.logger?.info(
          { checkedOpenSessions: sessions.length, scheduledJobs },
          "会话洞察 worker 已创建未完结会话提前分析任务",
        );
      }
    }
  }

  private async runUidMaintenanceJobs(limit = UID_MAINTENANCE_JOBS_PER_TICK) {
    const claimedJobIds = new Set<string>();

    for (let i = 0; i < limit; i += 1) {
      const job = await this.repository.claimNextSessionizationUidJob({
        excludeJobIds: Array.from(claimedJobIds),
      });

      if (!job) {
        break;
      }

      claimedJobIds.add(job.jobId);
      this.observability?.increment("sessionization", "jobsClaimed");
      await this.runUidMaintenanceJob(job);
    }
  }

  private async runUidMaintenanceJob(job: ClaimedSessionizationUidJob) {
    const heartbeat = this.startSessionizationClaimHeartbeat(job);

    try {
      const { scannedMessages, sessionizedMessages } = await this.maintainUid(
        job.uid,
        heartbeat.assertActive,
      );

      this.observability?.increment(
        "sessionization",
        "scannedMessages",
        scannedMessages,
      );
      this.observability?.increment(
        "sessionization",
        "sessionizedMessages",
        sessionizedMessages,
      );
      if (scannedMessages > 0 && !this.observability) {
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

      await heartbeat.renewNow();
      await heartbeat.stop();
      heartbeat.assertActive();
      const result = await this.repository.completeSessionizationUidJob(job);
      this.observability?.increment(
        "sessionization",
        result === "deleted" ? "jobsDeleted" : "jobsRequeued",
      );
      this.observability?.event({
        eventCode: "insights_worker.sessionization_uid_completed",
        level: "debug",
        message: "会话洞察 Worker 完成 UID 切片维护",
        payload: {
          jobId: job.jobId,
          result,
          scannedMessages,
          sessionizedMessages,
        },
        pipeline: "sessionization",
        uid: job.uid,
      });
      this.observability?.recover(`uid:${job.uid}`, "sessionization", job.uid);
    } catch (error) {
      await heartbeat.stop();
      await this.repository.markSessionizationUidJobFailed(job, error);
      this.observability?.increment("sessionization", "jobsFailed");
      const errorCode = getWorkerErrorCode(error);
      if (this.observability) {
        this.observability.event({
          errorCode,
          eventCode: errorCode === "SESSIONIZATION_UID_CLAIM_LOST"
            ? "insights_worker.claim_lost"
            : "insights_worker.sessionization_uid_failed",
          level: "warn",
          message: "会话洞察 Worker UID 维护任务失败",
          payload: {
            jobId: job.jobId,
            ...safeErrorPayload(error),
          },
          pipeline: "sessionization",
          throttleKey: errorCode === "SESSIONIZATION_UID_CLAIM_LOST"
            ? `claim_lost:${job.uid}`
            : `uid:${job.uid}`,
          uid: job.uid,
        });
        if (errorCode === "SESSIONIZATION_UID_CLAIM_LOST") {
          this.observability.increment("sessionization", "claimLost");
        }
      } else {
        this.logger?.error(
          { err: error, jobId: job.jobId, uid: job.uid },
          "会话洞察 worker UID 维护任务失败",
        );
      }
    }
  }

  private startSessionizationClaimHeartbeat(job: ClaimedSessionizationUidJob) {
    let failure: unknown;
    let renewal: Promise<void> | undefined;
    let stopped = false;

    const assertActive = () => {
      if (failure) {
        throw failure;
      }
    };
    const renew = () => {
      if (renewal) {
        return renewal;
      }

      renewal = this.repository.renewSessionizationUidJobLease(job)
        .then((renewed) => {
          if (!renewed) {
            throw new Error("SESSIONIZATION_UID_CLAIM_LOST");
          }
        })
        .catch((error: unknown) => {
          failure ??= error;
        })
        .finally(() => {
          renewal = undefined;
        });
      return renewal;
    };
    const timer = setInterval(() => {
      if (!stopped) {
        void renew();
      }
    }, SESSIONIZATION_CLAIM_HEARTBEAT_MS);

    return {
      assertActive,
      async renewNow() {
        if (renewal) {
          await renewal;
        }
        assertActive();
        await renew();
        assertActive();
      },
      async stop() {
        if (stopped) {
          return;
        }
        stopped = true;
        clearInterval(timer);
        if (renewal) {
          await renewal;
        }
      },
    };
  }

  private async maintainUid(uid: number, assertClaimActive: () => void) {
    const featureConfig = await this.repository.getFeatureConfig(uid);
    const sessionizationConfig = await this.repository.getSessionizationConfig(uid);

    const cursor = await this.repository.getCursor(uid);
    const messages = await this.repository.listIncrementalMessages({
      cursorAuditId: cursor.cursorAuditId,
      cursorMsgtime: cursor.cursorMsgtime,
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
      assertClaimActive();
      if (existingByMessageId.has(message.id)) {
        continue;
      }

      if (await this.sessionizeMessage(message, { config: sessionizationConfig })) {
        sessionizedMessages += 1;
      }
      assertClaimActive();
    }

    const lastMessage = messages.at(-1);

    if (lastMessage) {
      assertClaimActive();
      await this.repository.updateCursor({
        cursorAuditId: Number(lastMessage.id),
        cursorMsgtime: lastMessage.msgtime,
        uid,
      });
    }

    const activeUids = new Set([uid]);
    if (featureConfig.insightEnabled) {
      assertClaimActive();
      await this.scheduleLiveAnalysisForOpenSessions(activeUids);
    }
    assertClaimActive();
    const latestCursor = lastMessage
      ? {
          cursorAuditId: Number(lastMessage.id),
          cursorMsgtime: lastMessage.msgtime,
        }
      : cursor;
    const hasPendingMessages = messages.length >= this.batchSize
      || await this.repository.hasPendingMessages({
        ...latestCursor,
        uid,
      });

    if (!hasPendingMessages) {
      assertClaimActive();
      await this.closeTimedOutOpenSessions(activeUids);
    }

    return {
      scannedMessages: messages.length,
      sessionizedMessages,
    };
  }

  private async runSyncMessagesJob() {
    const job = await this.repository.claimNextSyncMessagesJob();

    if (!job) {
      return;
    }

    if (this.observability) {
      this.observability.event({
        eventCode: "insights_worker.rescan_started",
        level: "info",
        message: "会话洞察 Worker 开始历史重刷",
        payload: {
          jobId: job.jobId,
          rescanTaskId: job.rescanTaskId,
        },
        pipeline: "analysis",
        uid: job.uid,
      });
    } else {
      this.logger?.info(
        { cursorMsgtime: job.cursorMsgtime, jobId: job.jobId, uid: job.uid },
        "会话洞察 worker 开始历史重刷",
      );
    }

    try {
      if (job.rescanTaskId) {
        await this.repository.updateRescanTaskRunning(job.rescanTaskId);
      }

      let cursorAuditId = 0;
      let cursorMsgtime = job.cursorMsgtime;
      let scannedMessages = 0;
      let sessionizedMessages = 0;
      let scanCompleted = false;
      const sessionizationConfig = await this.repository.getSessionizationConfig(job.uid);
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

          const sessionizedMessage = await this.sessionizeMessage(message, {
            config: sessionizationConfig,
            skipLiveAnalysis: true,
          });

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
      this.observability?.increment("analysis", "syncSucceeded");
      if (this.observability) {
        this.observability.event({
          eventCode: "insights_worker.rescan_completed",
          level: "info",
          message: "会话洞察 Worker 历史重刷完成",
          payload: {
            jobId: job.jobId,
            reanalyzeSessions: queuedFinalSessions,
            rescanTaskId: job.rescanTaskId,
            scannedMessages,
            sessionizedMessages,
          },
          pipeline: "analysis",
          uid: job.uid,
        });
      } else {
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
      }
    } catch (error) {
      await this.repository.markSyncMessagesJobFailed(job.jobId, error);
      this.observability?.increment("analysis", "syncFailed");
      if (this.observability) {
        this.observability.event({
          errorCode: getWorkerErrorCode(error),
          eventCode: "insights_worker.rescan_failed",
          level: "error",
          message: "会话洞察 Worker 历史重刷失败",
          payload: {
            jobId: job.jobId,
            rescanTaskId: job.rescanTaskId,
            ...safeErrorPayload(error),
          },
          pipeline: "analysis",
          uid: job.uid,
        });
      } else {
        this.logger?.error(
          { err: error, jobId: job.jobId, uid: job.uid },
          "会话洞察 worker 历史重刷失败",
        );
      }
    }
  }

  private async closeTimedOutOpenSessions(activeUids: Set<number>) {
    const sessions = await this.repository.listClosableOpenSessions({
      activeUids,
      limit: this.batchSize,
      now: Date.now(),
    });

    const closedSessionIdsByUid = new Map<number, string[]>();
    for (const session of sessions) {
      const finalized = await this.repository.finalizeOpenSession({
        analysisDelayMinutes: session.analysisDelayMinutes,
        closeReason: session.closeReason,
        endedAt: session.endedAt,
        sessionId: session.sessionId,
        uid: session.uid,
      });
      if (finalized) {
        const closedSessionIds = closedSessionIdsByUid.get(session.uid) ?? [];
        closedSessionIds.push(session.sessionId);
        closedSessionIdsByUid.set(session.uid, closedSessionIds);
      }
    }

    const closedSessions = Array.from(closedSessionIdsByUid.values())
      .reduce((total, sessionIds) => total + sessionIds.length, 0);
    if (closedSessions > 0) {
      this.observability?.increment(
        "sessionization",
        "closedSessions",
        closedSessions,
      );
      if (this.observability) {
        for (const [uid, sessionIds] of closedSessionIdsByUid) {
          this.observability.event({
            eventCode: "insights_worker.sessions_closed",
            level: "debug",
            message: "会话洞察 Worker 已关闭超时逻辑会话",
            payload: {
              closedSessions: sessionIds.length,
              sessionIdSamples: sessionIds.slice(0, 10),
            },
            pipeline: "sessionization",
            uid,
          });
        }
      } else {
        this.logger?.info(
          {
            closedSessions,
            sessionIds: Array.from(closedSessionIdsByUid.values()).flat(),
          },
          "会话洞察 worker 已关闭超时逻辑会话",
        );
      }
    }
  }

  private async sessionizeMessage(
    message: InsightWorkerMessage,
    options: {
      config?: InsightWorkerSessionizationConfig;
      skipLiveAnalysis?: boolean;
    } = {},
  ): Promise<SessionizedMessageResult | undefined> {
    const conversation = await this.repository.findPlatformConversation(message);

    if (!conversation) {
      return undefined;
    }

    const input = buildInsightMessageInput(toMessageSourceRow(message, conversation.conversationId));

    const config = options.config
      ?? await this.repository.getSessionizationConfig(conversation.uid);

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
    const featureConfig = await this.repository.getFeatureConfig(input.uid);
    if (!featureConfig.insightEnabled) {
      return false;
    }

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
      await this.repository.finalizeOpenSession({
        analysisDelayMinutes: config.analysisDelayMinutes,
        closeReason,
        endedAt: occurredAt,
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
      this.observability?.increment("analysis", "jobsClaimed");
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

    if (this.observability) {
      this.observability.event({
        eventCode: "insights_worker.analysis_started",
        level: "debug",
        message: "会话洞察 Worker 开始分析任务",
        payload: {
          analysisScope: job.analysisScope,
          attempt: job.attemptCount,
          jobId: job.jobId,
          maxAttempts: job.maxAttempts,
          mode: job.mode,
          sessionId: job.sessionId,
        },
        pipeline: "analysis",
        uid: job.uid,
      });
    } else {
      this.logger?.info(
        {
          jobId: job.jobId,
          mode: job.mode,
          sessionId: job.sessionId,
          uid: job.uid,
        },
        "会话洞察 worker 开始分析任务",
      );
    }

    try {
      if (job.mode !== "manual_reanalyze") {
        const featureConfig = await this.repository.getFeatureConfig(job.uid);
        if (!featureConfig.insightEnabled) {
          await this.repository.skipAutomaticAnalysisJob(job);
          this.observability?.increment("analysis", "skippedInsightDisabled");
          this.observability?.event({
            eventCode: "insights_worker.analysis_skipped",
            level: "debug",
            message: "会话洞察 Worker 已跳过自动分析",
            payload: {
              jobId: job.jobId,
              mode: job.mode,
              reason: "insight_disabled",
              sessionId: job.sessionId,
            },
            pipeline: "analysis",
            uid: job.uid,
          });
          return;
        }
      }

      const sourceRows = await this.repository.listSessionMessagesForAnalysis(job.sessionId);
      const messages = sourceRows.map((row) =>
        buildInsightMessageInput(toAnalysisMessageSourceRow(row)),
      );
      const sourceMessageIds = messages.map((message) => message.sourceMessageId);
      const pendingTranscriptionCount = messages.filter((message) =>
        message.contentStatus === "pending_transcription"
      ).length;

      if (
        pendingTranscriptionCount > 0
        && !job.inputReadinessPostponed
        && job.attemptCount <= INPUT_READINESS_MAX_POSTPONES
      ) {
        await this.repository.postponeAnalysisJobForInputReadiness(job.jobId, {
          delayMs: INPUT_READINESS_RETRY_DELAY_MS,
          reason: "pending_transcription",
        });
        this.observability?.increment("analysis", "postponedTranscription");
        if (this.observability) {
          this.observability.event({
            eventCode: "insights_worker.analysis_skipped",
            level: "debug",
            message: "会话洞察 Worker 延后分析任务",
            payload: {
              jobId: job.jobId,
              pendingTranscriptionCount,
              reason: "pending_transcription",
              sessionId: job.sessionId,
            },
            pipeline: "analysis",
            uid: job.uid,
          });
        } else {
          this.logger?.info(
            {
              jobId: job.jobId,
              pendingTranscriptionCount,
              sessionId: job.sessionId,
              uid: job.uid,
            },
            "会话洞察 worker 延后分析任务，等待语音转写",
          );
        }
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
          this.observability?.increment("analysis", "snapshotsPublished");
        }

        await this.finishAnalyzeJobSucceeded(job);
        this.observability?.increment("analysis", "skippedInsufficientMessages");
        if (this.observability) {
          this.observability.event({
            eventCode: "insights_worker.analysis_skipped",
            level: "debug",
            message: "会话洞察 Worker 跳过模型分析",
            payload: {
              jobId: job.jobId,
              messageCount: modelMessages.length,
              minAnalysisMessages: policy.minAnalysisMessages,
              mode: job.mode,
              reason: "insufficient_messages",
              sessionId: job.sessionId,
            },
            pipeline: "analysis",
            uid: job.uid,
          });
        } else {
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
        }
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
          if (this.observability) {
            this.observability.event({
              errorCode: getWorkerErrorCode(error),
              eventCode: "insights_worker.live_gate_degraded",
              level: "warn",
              message: "会话洞察 Worker 实时分析 gate 降级",
              payload: {
                jobId: job.jobId,
                messageCount: modelMessages.length,
                sessionId: job.sessionId,
                ...safeErrorPayload(error),
              },
              pipeline: "analysis",
              throttleKey: "provider",
              uid: job.uid,
            });
          } else {
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
          }
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
          this.observability?.increment("analysis", "liveGateSkipped");
          if (this.observability) {
            this.observability.event({
              eventCode: "insights_worker.analysis_skipped",
              level: "debug",
              message: "会话洞察 Worker 跳过实时分析",
              payload: {
                changeType: gateDecision.changeType,
                jobId: job.jobId,
                messageCount: modelMessages.length,
                reason: "live_gate_no_material_change",
                sessionId: job.sessionId,
              },
              pipeline: "analysis",
              uid: job.uid,
            });
          } else {
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
          }
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
      this.observability?.increment("analysis", "succeeded");
      this.observability?.increment("analysis", "snapshotsPublished");
      if (this.observability) {
        this.observability.event({
          eventCode: "insights_worker.analysis_completed",
          level: "debug",
          message: "会话洞察 Worker 分析任务完成",
          payload: {
            durationMs: Date.now() - startedAt,
            jobId: job.jobId,
            messageCount: messages.length,
            mode: job.mode,
            sessionId: job.sessionId,
            snapshotId,
            validationWarningCount: validationWarnings.length,
          },
          pipeline: "analysis",
          uid: job.uid,
        });
      } else {
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
      }
    } catch (error) {
      if (runId) {
        await this.repository.markAnalysisRunFailed(runId, error);
      }

      const willRetry = job.mode === "final" && job.attemptCount < job.maxAttempts;
      if (willRetry) {
        await this.repository.retryAnalysisJob(job.jobId, error, {
          delayMs: ANALYSIS_RETRY_DELAY_MS,
        });
      } else {
        await this.repository.markAnalysisJobFailed(job.jobId, error);
      }
      if (job.rescanTaskId && !willRetry) {
        await this.repository.updateRescanTaskAfterAnalysis({
          failedSessions: 1,
          rescanTaskId: job.rescanTaskId,
          succeededSessions: 0,
        });
      }
      const errorCode = getWorkerErrorCode(error);
      const errorPayload = safeErrorPayload(error);
      if (this.observability) {
        this.observability.increment(
          "analysis",
          willRetry ? "retried" : "failed",
        );
        this.observability.event({
          errorCode,
          eventCode: willRetry
            ? "insights_worker.analysis_retry_scheduled"
            : "insights_worker.analysis_failed",
          level: willRetry ? "warn" : "error",
          message: willRetry
            ? "会话洞察 Worker 分析失败，已安排重试"
            : "会话洞察 Worker 分析任务终态失败",
          payload: {
            attempt: job.attemptCount,
            durationMs: Date.now() - startedAt,
            jobId: job.jobId,
            maxAttempts: job.maxAttempts,
            mode: job.mode,
            sessionId: job.sessionId,
            willRetry,
            ...errorPayload,
          },
          pipeline: "analysis",
          throttleKey: errorPayload.failedStep
            ? "provider"
            : "analysis_job",
          uid: job.uid,
        });
      } else {
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
    this.observability?.recover("analysis_job", "analysis", job.uid);
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

export function startInsightsWorkerPipelines(options: {
  analysis: () => Promise<void>;
  discovery: () => Promise<void>;
  intervalMs?: number;
  logger: WorkerLogger;
  observability?: InsightsWorkerObservability;
  sessionization: () => Promise<void>;
}) {
  const intervalMs = options.intervalMs ?? 3_000;
  const pipelines = [
    ["discovery", options.discovery],
    ["sessionization", options.sessionization],
    ["analysis", options.analysis],
  ] as const;
  const runtimes = pipelines.map(([name, run]) => {
    const trackedRun = async () => {
      const startedAt = options.observability?.pipelineStarted(name);
      try {
        await run();
        if (startedAt != null) {
          options.observability?.pipelineSucceeded(name, startedAt);
        }
      } catch (error) {
        if (startedAt != null) {
          options.observability?.pipelineFailed(name, startedAt, error);
        }
        throw error;
      }
    };
    const ticker = createNonOverlappingTicker(trackedRun);
    const timer = setInterval(() => {
      void ticker.tick()
        .then((accepted) => {
          if (!accepted) {
            options.observability?.pipelineBusy(name);
          }
        })
        .catch((error: unknown) => {
          if (!options.observability) {
            options.logger.error(
              { err: error, pipeline: name },
              "会话洞察 worker pipeline tick 失败",
            );
          }
        });
    }, intervalMs);

    return { name, ticker, timer };
  });

  if (!options.observability) {
    options.logger.info({ intervalMs }, "会话洞察 worker 已启动独立处理管线");
  }

  return {
    async stop() {
      for (const runtime of runtimes) {
        clearInterval(runtime.timer);
      }
      await Promise.all(runtimes.map((runtime) => runtime.ticker.waitForIdle()));
      await options.observability?.stop();
    },
    tickers: Object.fromEntries(
      runtimes.map((runtime) => [runtime.name, runtime.ticker]),
    ) as Record<(typeof pipelines)[number][0], NonOverlappingTicker>,
  };
}
