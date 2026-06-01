import { buildInsightMessageInput } from "./insight-message-input-builder.js";
import type { AiMessageInput, InsightMessageSourceRow } from "./insights.types.js";

type WorkerLogger = {
  error(payload: Record<string, unknown>, message: string): void;
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

export type InsightWorkerSessionizationConfig = {
  analysisDelayMinutes: number;
  hardMaxDurationHours: number;
  idleTimeoutMinutes: number;
  lateArrivalWindowMinutes: number;
  ruleVersion: string;
};

export type InsightWorkerOpenSession = {
  lastMeaningfulMessageAt: number | null;
  sessionId: string;
  startedAt: number;
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
  analysisScope: "all";
  jobType: "analyze_session" | "reanalyze_session";
  mode: "final" | "live";
  runAfter: Date;
  sessionId: string;
  uid: number;
};

export type ClaimedAnalyzeJob = {
  analysisScope: "all";
  jobId: string;
  mode: "final" | "live" | "manual_reanalyze";
  sessionId: string;
  uid: number;
};

export type InsightAnalysisRunInput = {
  analysisScope: "all";
  jobId: string;
  mode: ClaimedAnalyzeJob["mode"];
  sessionId: string;
  sourceMessageFrom: string | null;
  sourceMessageTo: string | null;
};

export type InsightAnalysisOutput = {
  actionItems: Array<{
    actionType: string;
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
  risks: Array<{
    confidence: number;
    evidenceMessageIds: string[];
    reason: string;
    riskLevel: "high" | "low" | "medium";
    riskType: string;
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

export type SaveAnalysisResultInput = {
  job: ClaimedAnalyzeJob;
  output: InsightAnalysisOutput;
  runId: string;
  sourceMessageHighWatermark: string | null;
  validationWarnings: string[];
};

export type InsightSessionAnalyzer = {
  analyzeSession(input: {
    job: ClaimedAnalyzeJob;
    messages: AiMessageInput[];
  }): Promise<InsightAnalysisOutput>;
};

export type InsightWorkerRepositoryPort = {
  appendSessionMessage(input: AppendSessionMessageInput): Promise<void>;
  claimNextAnalyzeJob(): Promise<ClaimedAnalyzeJob | undefined>;
  closeSession(input: CloseSessionInput): Promise<void>;
  createAnalyzeJob(input: CreateAnalyzeJobInput): Promise<string>;
  createLogicalSession(input: CreateLogicalSessionInput): Promise<string>;
  findOpenSession(input: {
    conversationId: string;
    uid: number;
  }): Promise<InsightWorkerOpenSession | undefined>;
  findPlatformConversation(message: InsightWorkerMessage): Promise<InsightWorkerConversation | undefined>;
  getCursor(): Promise<InsightWorkerCursor>;
  getSessionizationConfig(uid: number): Promise<InsightWorkerSessionizationConfig>;
  listIncrementalMessages(input: {
    cursorAuditId: number;
    cursorMsgtime: number;
    limit: number;
  }): Promise<InsightWorkerMessage[]>;
  listSessionMessagesForAnalysis(sessionId: string): Promise<InsightAnalysisMessageRow[]>;
  markAnalysisJobFailed(jobId: string, error: unknown): Promise<void>;
  markAnalysisJobSucceeded(jobId: string): Promise<void>;
  markAnalysisRunFailed(runId: string, error: unknown): Promise<void>;
  saveAnalysisResult(input: SaveAnalysisResultInput): Promise<string>;
  startAnalysisRun(input: InsightAnalysisRunInput): Promise<string>;
  updateCursor(cursor: InsightWorkerCursor): Promise<void>;
};

export type NonOverlappingTicker = {
  tick(): Promise<boolean>;
};

export class InsightsWorkerService {
  private readonly batchSize: number;
  private readonly model?: InsightSessionAnalyzer;

  constructor(
    private readonly repository: InsightWorkerRepositoryPort,
    options: { batchSize?: number; model?: InsightSessionAnalyzer } = {},
  ) {
    this.batchSize = options.batchSize ?? 200;
    this.model = options.model;
  }

  async runOnce() {
    const cursor = await this.repository.getCursor();
    const messages = await this.repository.listIncrementalMessages({
      cursorAuditId: cursor.cursorAuditId,
      cursorMsgtime: cursor.cursorMsgtime,
      limit: this.batchSize,
    });

    for (const message of messages) {
      await this.sessionizeMessage(message);
    }

    const lastMessage = messages.at(-1);

    if (lastMessage) {
      await this.repository.updateCursor({
        cursorAuditId: Number(lastMessage.id),
        cursorMsgtime: lastMessage.msgtime,
      });
    }

    if (this.model) {
      await this.runAnalyzeJob();
    }
  }

  private async sessionizeMessage(message: InsightWorkerMessage) {
    const conversation = await this.repository.findPlatformConversation(message);

    if (!conversation) {
      return;
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

    if (input.includedForAi) {
      await this.repository.createAnalyzeJob({
        analysisScope: "all",
        jobType: "analyze_session",
        mode: "live",
        runAfter: new Date(Date.now()),
        sessionId,
        uid: conversation.uid,
      });
    }
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

    try {
      const sourceRows = await this.repository.listSessionMessagesForAnalysis(job.sessionId);
      const messages = sourceRows.map((row) =>
        buildInsightMessageInput(toAnalysisMessageSourceRow(row)),
      );
      const sourceMessageIds = messages.map((message) => message.sourceMessageId);
      runId = await this.repository.startAnalysisRun({
        analysisScope: job.analysisScope,
        jobId: job.jobId,
        mode: job.mode,
        sessionId: job.sessionId,
        sourceMessageFrom: sourceMessageIds.at(0) ?? null,
        sourceMessageTo: sourceMessageIds.at(-1) ?? null,
      });

      const output = normalizeEvidenceIds(
        await this.model.analyzeSession({ job, messages }),
        new Set(sourceMessageIds),
      );

      await this.repository.saveAnalysisResult({
        job,
        output: output.output,
        runId,
        sourceMessageHighWatermark: sourceMessageIds.at(-1) ?? null,
        validationWarnings: output.validationWarnings,
      });
      await this.repository.markAnalysisJobSucceeded(job.jobId);
    } catch (error) {
      if (runId) {
        await this.repository.markAnalysisRunFailed(runId, error);
      }

      await this.repository.markAnalysisJobFailed(job.jobId, error);
    }
  }
}

export function createNonOverlappingTicker(run: () => Promise<void>): NonOverlappingTicker {
  let running = false;

  return {
    async tick() {
      if (running) {
        return false;
      }

      running = true;

      try {
        await run();

        return true;
      } finally {
        running = false;
      }
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
        evidenceMessageIds: clean(
          "problem_resolution",
          output.problemResolution.evidenceMessageIds,
        ),
      },
      qaFindings: output.qaFindings.map((item) => ({
        ...item,
        evidenceMessageIds: clean("qa_finding", item.evidenceMessageIds),
      })),
      risks: output.risks.map((item) => ({
        ...item,
        evidenceMessageIds: clean("risk", item.evidenceMessageIds),
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
    },
    ticker,
  };
}
