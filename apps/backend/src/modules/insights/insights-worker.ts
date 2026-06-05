import type { InsightRescanAnalysisScope } from "@chatai/contracts";
import { buildInsightMessageInput } from "./insight-message-input-builder.js";
import type {
  InsightPreviousSessionContext,
  InsightPromptContext,
} from "./insight-prompt-builder.js";
import type { AiMessageInput, InsightMessageSourceRow } from "./insights.types.js";

type WorkerLogger = {
  error(payload: Record<string, unknown>, message: string): void;
  debug?(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
};

export type InsightWorkerCursor = {
  cursorAuditId: number;
  cursorMsgtime: number;
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
  uid: number;
};

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
  uid: number;
};

export type AppendSessionMessageInput = {
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
  uid: number;
};

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
    entityId: string;
    entityName: string;
    entityType: string;
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
    intentCode: string;
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
    severity: "high" | "low" | "medium";
  }>;
  sentiment: Array<{
    confidence: number;
    evidenceMessageIds: string[];
    polarity: "mixed" | "negative" | "neutral" | "positive" | "unknown";
    reason: string;
  }>;
  summary: {
    confidence: number;
    customerIntent: string;
    followUp?: string;
    processSummary: string;
    resultSummary: string;
  };
  tags: Array<{
    confidence: number;
    evidenceMessageIds: string[];
    tagCode: string;
    tagName: string;
  }>;
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
  runId: string;
  sourceMessageHighWatermark: string | null;
  validationWarnings: string[];
};

export type InsightWorkerAnalysisPolicy = {
  lowConfidenceThreshold: number;
};

export type InsightSessionAnalyzer = {
  analyzeSession(input: {
    context: InsightPromptContext;
    job: ClaimedAnalyzeJob;
    messages: AiMessageInput[];
    previousSessionContexts: InsightPreviousSessionContext[];
    previousOutput?: InsightAnalysisOutput;
  }): Promise<InsightAnalyzerOutput>;
};

export type InsightWorkerRepositoryPort = {
  appendSessionMessage(input: AppendSessionMessageInput): Promise<void>;
  archiveTerminalJobs?(input: {
    before: Date;
    limit: number;
  }): Promise<{ archivedJobs: number; deletedJobs: number }>;
  claimNextAnalyzeJob(): Promise<ClaimedAnalyzeJob | undefined>;
  claimNextSyncMessagesJob(input: {
    uidAllowlist?: Set<number>;
  }): Promise<ClaimedSyncMessagesJob | undefined>;
  closeSession(input: CloseSessionInput): Promise<void>;
  createAnalyzeJob(input: CreateAnalyzeJobInput): Promise<string>;
  createLogicalSession(input: CreateLogicalSessionInput): Promise<string>;
  findOpenSession(input: {
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
  getCursor(): Promise<InsightWorkerCursor>;
  getPromptContext(uid: number): Promise<InsightPromptContext>;
  getSessionizationConfig(uid: number): Promise<InsightWorkerSessionizationConfig>;
  listPreviousSessionContexts(input: {
    currentSessionId: string;
    limit: number;
    lookbackHours: number;
    uid: number;
  }): Promise<InsightPreviousSessionContext[]>;
  listClosableOpenSessions(input: {
    limit: number;
    now: number;
    uidAllowlist?: Set<number>;
  }): Promise<ClosableOpenSession[]>;
  listIncrementalMessages(input: {
    cursorAuditId: number;
    cursorMsgtime: number;
    limit: number;
    uid?: number;
  }): Promise<InsightWorkerMessage[]>;
  listOpenSessionsForLiveAnalysis(input: {
    limit: number;
    uidAllowlist?: Set<number>;
  }): Promise<OpenSessionForLiveAnalysis[]>;
  listSessionMessagesForAnalysis(sessionId: string): Promise<InsightAnalysisMessageRow[]>;
  getCurrentAnalysisOutput(input: {
    sessionId: string;
    uid: number;
  }): Promise<InsightAnalysisOutput | undefined>;
  markAnalysisJobFailed(jobId: string, error: unknown): Promise<void>;
  markAnalysisJobSucceeded(jobId: string): Promise<void>;
  markAnalysisRunFailed(runId: string, error: unknown): Promise<void>;
  markSyncMessagesJobFailed(jobId: string, error: unknown): Promise<void>;
  markSyncMessagesJobSucceeded(jobId: string): Promise<void>;
  postponeAnalysisJobForInputReadiness(
    jobId: string,
    input: { delayMs: number; reason: string },
  ): Promise<void>;
  saveAnalysisResult(input: SaveAnalysisResultInput): Promise<string>;
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
  updateCursor(cursor: InsightWorkerCursor): Promise<void>;
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

export class InsightsWorkerService {
  private readonly batchSize: number;
  private readonly model?: InsightSessionAnalyzer;
  private readonly uidAllowlist?: Set<number>;

  constructor(
    private readonly repository: InsightWorkerRepositoryPort,
    options: {
      batchSize?: number;
      logger?: WorkerLogger;
      model?: InsightSessionAnalyzer;
      uidAllowlist?: Set<number>;
    } = {},
  ) {
    this.batchSize = options.batchSize ?? 200;
    this.logger = options.logger;
    this.model = options.model;
    this.uidAllowlist = options.uidAllowlist;
  }

  private readonly logger?: WorkerLogger;

  async runOnce() {
    await this.runSyncMessagesJob();

    const cursor = await this.repository.getCursor();
    const messages = await this.repository.listIncrementalMessages({
      cursorAuditId: cursor.cursorAuditId,
      cursorMsgtime: cursor.cursorMsgtime,
      limit: this.batchSize,
    });
    let sessionizedMessages = 0;
    let skippedByAllowlist = 0;

    for (const message of messages) {
      if (this.uidAllowlist && !this.uidAllowlist.has(message.uid)) {
        skippedByAllowlist += 1;
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
      });
    }

    if (messages.length > 0) {
      this.logger?.info(
        {
          cursorAuditId: lastMessage ? Number(lastMessage.id) : cursor.cursorAuditId,
          cursorMsgtime: lastMessage?.msgtime ?? cursor.cursorMsgtime,
          scannedMessages: messages.length,
          sessionizedMessages,
          skippedByAllowlist,
        },
        "会话洞察 worker 已扫描增量消息",
      );
    }

    if (this.model) {
      await this.runAnalyzeJob();
    }

    await this.scheduleLiveAnalysisForOpenSessions();
    await this.closeTimedOutOpenSessions();
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
    } catch (error) {
      this.logger?.error({ err: error }, "会话洞察 worker 归档终态任务失败");
    }
  }

  private async scheduleLiveAnalysisForOpenSessions() {
    const sessions = await this.repository.listOpenSessionsForLiveAnalysis({
      limit: this.batchSize,
      uidAllowlist: this.uidAllowlist,
    });
    let scheduledJobs = 0;

    for (const session of sessions) {
      if (
        await this.repository.shouldCreateLiveAnalyzeJob({
          occurredAt: Date.now(),
          sessionId: session.sessionId,
          uid: session.uid,
        })
      ) {
        await this.repository.createAnalyzeJob({
          analysisScope: "all",
          jobType: "analyze_session",
          mode: "live",
          runAfter: new Date(),
          sessionId: session.sessionId,
          uid: session.uid,
        });
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

  private async runSyncMessagesJob() {
    const job = await this.repository.claimNextSyncMessagesJob({
      uidAllowlist: this.uidAllowlist,
    });

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
      const sessionsToReanalyze = new Map<string, number>();

      while (true) {
        const messages = await this.repository.listIncrementalMessages({
          cursorAuditId,
          cursorMsgtime,
          limit: this.batchSize,
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
            sessionsToReanalyze.set(existingSession.sessionId, existingSession.uid);
            continue;
          }

          if (await this.sessionizeMessage(message, { skipLiveAnalysis: true })) {
            sessionizedMessages += 1;
          }
        }
        scannedMessages += messages.length;

        const lastMessage = messages.at(-1);

        if (!lastMessage || messages.length < this.batchSize) {
          break;
        }

        cursorAuditId = Number(lastMessage.id);
        cursorMsgtime = lastMessage.msgtime;
      }

      for (const [sessionId, uid] of sessionsToReanalyze) {
        await this.repository.createAnalyzeJob({
          analysisScope: job.analysisScope,
          jobType: "reanalyze_session",
          mode: "final",
          rescanTaskId: job.rescanTaskId,
          runAfter: new Date(),
          sessionId,
          uid,
        });
      }

      if (job.rescanTaskId) {
        await this.repository.updateRescanTaskAfterScan({
          queuedSessions: sessionsToReanalyze.size,
          rescanTaskId: job.rescanTaskId,
          totalSessions: sessionsToReanalyze.size,
        });
      }

      await this.repository.markSyncMessagesJobSucceeded(job.jobId);
      this.logger?.info(
        {
          jobId: job.jobId,
          reanalyzeSessions: sessionsToReanalyze.size,
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

  private async closeTimedOutOpenSessions() {
    const sessions = await this.repository.listClosableOpenSessions({
      limit: this.batchSize,
      now: Date.now(),
      uidAllowlist: this.uidAllowlist,
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
  ) {
    const conversation = await this.repository.findPlatformConversation(message);

    if (!conversation) {
      return false;
    }

    const input = buildInsightMessageInput(toMessageSourceRow(message, conversation.conversationId));
    const config = await this.repository.getSessionizationConfig(conversation.uid);
    const openSession = await this.repository.findOpenSession({
      conversationId: conversation.conversationId,
      uid: conversation.uid,
    });
    const sessionId = await this.resolveSessionId({
      config,
      conversation,
      input,
      message,
      openSession,
    });

    await this.repository.appendSessionMessage({
      conversationId: conversation.conversationId,
      includedForAi: input.includedForAi,
      meaningfulForBoundary: input.meaningfulForBoundary,
      messageType: input.messageType,
      occurredAt: input.occurredAt,
      senderRole: input.senderRole,
      sessionId,
      sourceMessageId: input.sourceMessageId,
      sourceMessageTime: input.occurredAt,
      uid: conversation.uid,
    });

    if (
      !options.skipLiveAnalysis
      && input.includedForAi
      && await this.repository.shouldCreateLiveAnalyzeJob({
        occurredAt: input.occurredAt,
        sessionId,
        uid: conversation.uid,
      })
    ) {
      await this.repository.createAnalyzeJob({
        analysisScope: "all",
        jobType: "analyze_session",
        mode: "live",
        runAfter: new Date(Date.now()),
        sessionId,
        uid: conversation.uid,
      });
    }

    return true;
  }

  private async resolveSessionId(input: {
    config: InsightWorkerSessionizationConfig;
    conversation: InsightWorkerConversation;
    input: ReturnType<typeof buildInsightMessageInput>;
    message: InsightWorkerMessage;
    openSession: InsightWorkerOpenSession | undefined;
  }) {
    const { config, conversation, openSession } = input;
    const occurredAt = input.input.occurredAt;

    if (!openSession) {
      return await this.repository.createLogicalSession({
        config,
        conversationId: conversation.conversationId,
        startedAt: occurredAt,
        uid: conversation.uid,
      });
    }

    const closeReason = getCloseReason(openSession, config, occurredAt);

    if (!closeReason) {
      return openSession.sessionId;
    }

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

    return await this.repository.createLogicalSession({
      config,
      conversationId: conversation.conversationId,
      startedAt: occurredAt,
      uid: conversation.uid,
    });
  }

  private async runAnalyzeJob() {
    const job = await this.repository.claimNextAnalyzeJob();

    if (!job || !this.model) {
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
      runId = await this.repository.startAnalysisRun({
        analysisScope: job.analysisScope,
        jobId: job.jobId,
        mode: job.mode,
        sessionId: job.sessionId,
        sourceMessageFrom: sourceMessageIds.at(0) ?? null,
        sourceMessageTo: sourceMessageIds.at(-1) ?? null,
      });
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

      const analyzerOutput = await this.model.analyzeSession({
        context,
        job,
        messages: modelMessages,
        previousOutput,
        previousSessionContexts,
      });
      const { analysisWarnings, output: cleanAnalyzerOutput } = splitAnalyzerOutput(analyzerOutput);
      const configuredOutput = filterConfiguredAnalysisOutput(cleanAnalyzerOutput, context);
      const output = normalizeEvidenceIds(configuredOutput.output, new Set(sourceMessageIds));
      const mergedOutput = mergeScopedAnalysisOutput(job.analysisScope, previousOutput, output.output);
      const validationWarnings = [
        ...analysisWarnings,
        ...configuredOutput.validationWarnings,
        ...output.validationWarnings,
        ...pendingInputWarnings,
        ...await this.getConfidenceWarnings(job.uid, mergedOutput),
      ];

      const snapshotId = await this.repository.saveAnalysisResult({
        job,
        output: mergedOutput,
        runId,
        sourceMessageHighWatermark: sourceMessageIds.at(-1) ?? null,
        validationWarnings,
      });
      await this.repository.markAnalysisJobSucceeded(job.jobId);
      if (job.rescanTaskId) {
        await this.repository.updateRescanTaskAfterAnalysis({
          failedSessions: 0,
          rescanTaskId: job.rescanTaskId,
          succeededSessions: 1,
        });
      }
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

  private async getConfidenceWarnings(uid: number, output: InsightAnalysisOutput) {
    const policy = await this.repository.getAnalysisPolicy(uid);
    const confidence = Math.min(output.summary.confidence, output.problemResolution.confidence);

    if (confidence >= policy.lowConfidenceThreshold) {
      return [];
    }

    return [`confidence ${confidence} is below threshold ${policy.lowConfidenceThreshold}`];
  }
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
) {
  const validationWarnings: string[] = [];
  const intentConfigsByCode = new Map(
    context.intentConfigs.map((item) => [item.intentCode, item]),
  );
  const labelCodes = new Set(context.labelConfigs.map((item) => item.labelCode));
  const qaRuleCodes = new Set(context.qaRuleConfigs.map((item) => item.ruleCode));
  const configuredEntities = context.entityDictionary.map((item) => ({
    aliases: new Set([item.canonicalName, ...item.aliases].map(normalizeMatchText)),
    canonicalName: item.canonicalName,
    entityType: item.entityType,
  }));
  const entities = output.entities.filter((item) => {
    const matched = configuredEntities.some((entity) => {
      const entityId = normalizeMatchText(item.entityId);
      const entityName = normalizeMatchText(item.entityName);

      return entity.entityType === item.entityType
        && (entity.aliases.has(entityId) || entity.aliases.has(entityName));
    });

    if (!matched) {
      validationWarnings.push(`entity ${item.entityId} is not configured`);
    }

    return matched;
  });
  const tags = output.tags.filter((item) => {
    if (labelCodes.has(item.tagCode)) {
      return true;
    }

    validationWarnings.push(`tag ${item.tagCode} is not configured`);
    return false;
  });
  const intents = output.intents.flatMap((item) => {
    const config = intentConfigsByCode.get(item.intentCode);

    if (config) {
      return [{
        ...item,
        intentLabel: config.intentName,
      }];
    }

    validationWarnings.push(`intent ${item.intentCode} is not configured`);
    return [];
  });
  const qaFindings = output.qaFindings.filter((item) => {
    if (qaRuleCodes.has(item.ruleCode)) {
      return true;
    }

    validationWarnings.push(`qa rule ${item.ruleCode} is not configured`);
    return false;
  });

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
