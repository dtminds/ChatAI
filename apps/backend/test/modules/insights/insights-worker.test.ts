import { describe, expect, it, vi } from "vitest";
import {
  createNonOverlappingTicker,
  InsightsWorkerService,
  startInsightsWorker,
  type InsightWorkerRepositoryPort,
} from "../../../src/modules/insights/insights-worker";

const defaultConfig = {
  analysisDelayMinutes: 10,
  hardMaxDurationHours: 8,
  idleTimeoutMinutes: 120,
  lateArrivalWindowMinutes: 30,
  ruleVersion: "insights-v1",
};

function createRepository(
  overrides: Partial<InsightWorkerRepositoryPort> = {},
): InsightWorkerRepositoryPort {
  return {
    appendSessionMessage: vi.fn(async () => undefined),
    archiveTerminalJobs: vi.fn(async () => ({ archivedJobs: 0, deletedJobs: 0 })),
    closeSession: vi.fn(async () => undefined),
    createAnalyzeJob: vi.fn(async () => "job-1"),
    claimNextAnalyzeJob: vi.fn(async () => undefined),
    claimNextSyncMessagesJob: vi.fn(async () => undefined),
    createLogicalSession: vi.fn(async () => "501"),
    findOpenSession: vi.fn(async () => undefined),
    findSessionBySourceMessage: vi.fn(async () => undefined),
    listSessionsBySourceMessages: vi.fn(async () => []),
    findPlatformConversation: vi.fn(async () => ({
      conversationId: "301",
      uid: 9001,
    })),
    getCursor: vi.fn(async () => ({ cursorAuditId: 0, cursorMsgtime: 0 })),
    getPromptContext: vi.fn(async () => ({
      entityDictionary: [],
      intentConfigs: [],
      labelConfigs: [],
      qaRuleConfigs: [],
    })),
    listPreviousSessionContexts: vi.fn(async () => []),
    getAnalysisPolicy: vi.fn(async () => ({
      lowConfidenceThreshold: 0.6,
    })),
    getSessionizationConfig: vi.fn(async () => defaultConfig),
    listClosableOpenSessions: vi.fn(async () => []),
    listIncrementalMessages: vi.fn(async () => [
      {
        chatType: 1,
        content: JSON.stringify({ content: "物流不更新" }),
        fromType: 2,
        id: "9001",
        msgtime: 1_780_244_000_000,
        msgtype: "text",
        platform: 5,
        uid: 9001,
        thirdExternalId: "external-1",
        thirdGroupId: "",
        thirdUserId: "user-1",
      },
      {
        chatType: 1,
        content: JSON.stringify({ content: "帮您催一下快递" }),
        fromType: 1,
        id: "9002",
        msgtime: 1_780_244_060_000,
        msgtype: "text",
        platform: 5,
        uid: 9001,
        thirdExternalId: "external-1",
        thirdGroupId: "",
        thirdUserId: "user-1",
      },
    ]),
    listOpenSessionsForLiveAnalysis: vi.fn(async () => []),
    listSessionMessagesForAnalysis: vi.fn(async () => []),
    getCurrentAnalysisOutput: vi.fn(async () => undefined),
    markAnalysisJobFailed: vi.fn(async () => undefined),
    postponeAnalysisJobForInputReadiness: vi.fn(async () => undefined),
    markAnalysisJobSucceeded: vi.fn(async () => undefined),
    markAnalysisRunFailed: vi.fn(async () => undefined),
    markSyncMessagesJobFailed: vi.fn(async () => undefined),
    markSyncMessagesJobSucceeded: vi.fn(async () => undefined),
    saveAnalysisResult: vi.fn(async () => "7001"),
    shouldCreateLiveAnalyzeJob: vi.fn(async () => true),
    startAnalysisRun: vi.fn(async () => "run-1"),
    updateRescanTaskAfterAnalysis: vi.fn(async () => undefined),
    updateRescanTaskAfterScan: vi.fn(async () => undefined),
    updateRescanTaskRunning: vi.fn(async () => undefined),
    updateCursor: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("InsightsWorkerService", () => {
  it("sessionizes incremental messages and creates a live analysis job", async () => {
    const repository = createRepository();
    const service = new InsightsWorkerService(repository, { batchSize: 50 });

    await service.runOnce();

    expect(repository.listIncrementalMessages).toHaveBeenCalledWith({
      cursorAuditId: 0,
      cursorMsgtime: 0,
      limit: 50,
    });
    expect(repository.createLogicalSession).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "301",
        startedAt: 1_780_244_000_000,
        uid: 9001,
      }),
    );
    expect(repository.appendSessionMessage).toHaveBeenCalledTimes(2);
    expect(repository.createAnalyzeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisScope: "all",
        jobType: "analyze_session",
        mode: "live",
        sessionId: "501",
        uid: 9001,
      }),
    );
    expect(repository.shouldCreateLiveAnalyzeJob).toHaveBeenCalledWith({
      occurredAt: 1_780_244_000_000,
      sessionId: "501",
      uid: 9001,
    });
    expect(repository.updateCursor).toHaveBeenCalledWith({
      cursorAuditId: 9002,
      cursorMsgtime: 1_780_244_060_000,
    });
  });

  it("logs incremental worker activity when messages are scanned", async () => {
    const repository = createRepository();
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const service = new InsightsWorkerService(repository, { batchSize: 50, logger });

    await service.runOnce();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        scannedMessages: 2,
        sessionizedMessages: 2,
        skippedByAllowlist: 0,
      }),
      "会话洞察 worker 已扫描增量消息",
    );
  });

  it("archives old terminal jobs after the main worker pass", async () => {
    const repository = createRepository();
    const service = new InsightsWorkerService(repository, { batchSize: 50 });

    await service.runOnce();

    expect(repository.archiveTerminalJobs).toHaveBeenCalledWith({
      before: expect.any(Date),
      limit: 5000,
    });
  });

  it("logs terminal job archive failures without blocking the worker pass", async () => {
    const repository = createRepository({
      archiveTerminalJobs: vi.fn(async () => {
        throw new Error("archive failed");
      }),
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const service = new InsightsWorkerService(repository, { batchSize: 50, logger });

    await service.runOnce();

    expect(repository.updateCursor).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
      }),
      "会话洞察 worker 归档终态任务失败",
    );
  });

  it("does not create a live analysis job before policy thresholds are reached", async () => {
    const repository = createRepository({
      shouldCreateLiveAnalyzeJob: vi.fn(async () => false),
    });
    const service = new InsightsWorkerService(repository);

    await service.runOnce();

    expect(repository.appendSessionMessage).toHaveBeenCalledTimes(2);
    expect(repository.createAnalyzeJob).not.toHaveBeenCalled();
  });

  it("closes timed-out open sessions even when no new message arrives", async () => {
    const repository = createRepository({
      listClosableOpenSessions: vi.fn(async () => [
        {
          analysisDelayMinutes: 10,
          closeReason: "idle_timeout",
          endedAt: 1_780_244_000_000,
          sessionId: "501",
          uid: 9001,
        },
      ]),
      listIncrementalMessages: vi.fn(async () => []),
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const service = new InsightsWorkerService(repository, { logger });

    await service.runOnce();

    expect(repository.createAnalyzeJob).toHaveBeenCalled();
    expect(repository.closeSession).toHaveBeenCalled();
    expect(vi.mocked(repository.createAnalyzeJob).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.closeSession).mock.invocationCallOrder[0],
    );
    expect(repository.closeSession).toHaveBeenCalledWith({
      closeReason: "idle_timeout",
      endedAt: 1_780_244_000_000,
      sessionId: "501",
    });
    expect(repository.createAnalyzeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "analyze_session",
        mode: "final",
        runAfter: new Date(1_780_244_000_000 + 10 * 60_000),
        sessionId: "501",
        uid: 9001,
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        closedSessions: 1,
        sessionIds: ["501"],
      }),
      "会话洞察 worker 已关闭超时逻辑会话",
    );
  });

  it("creates live analysis jobs for open sessions without waiting for a new message", async () => {
    const repository = createRepository({
      listIncrementalMessages: vi.fn(async () => []),
      listOpenSessionsForLiveAnalysis: vi.fn(async () => [
        {
          sessionId: "24",
          uid: 272,
        },
      ]),
      shouldCreateLiveAnalyzeJob: vi.fn(async () => true),
    });
    const service = new InsightsWorkerService(repository, { batchSize: 50 });

    await service.runOnce();

    expect(repository.shouldCreateLiveAnalyzeJob).toHaveBeenCalledWith({
      occurredAt: expect.any(Number),
      sessionId: "24",
      uid: 272,
    });
    expect(repository.createAnalyzeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "analyze_session",
        mode: "live",
        sessionId: "24",
        uid: 272,
      }),
    );
  });

  it("closes an idle open session before creating a new one", async () => {
    const repository = createRepository({
      findOpenSession: vi.fn(async () => ({
        lastMeaningfulMessageAt: 1_780_235_000_000,
        sessionId: "500",
        startedAt: 1_780_230_000_000,
      })),
    });
    const service = new InsightsWorkerService(repository);

    await service.runOnce();

    expect(repository.closeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        closeReason: "idle_timeout",
        sessionId: "500",
      }),
    );
    expect(repository.createLogicalSession).toHaveBeenCalled();
  });

  it("skips messages that cannot resolve a platform conversation but still advances cursor", async () => {
    const repository = createRepository({
      findPlatformConversation: vi.fn(async () => undefined),
    });
    const service = new InsightsWorkerService(repository);

    await service.runOnce();

    expect(repository.appendSessionMessage).not.toHaveBeenCalled();
    expect(repository.updateCursor).toHaveBeenCalledWith({
      cursorAuditId: 9002,
      cursorMsgtime: 1_780_244_060_000,
    });
  });

  it("skips sessionization and analysis jobs for uids outside the worker allowlist", async () => {
    const repository = createRepository();
    const service = new InsightsWorkerService(repository, {
      uidAllowlist: new Set([9002]),
    });

    await service.runOnce();

    expect(repository.findPlatformConversation).not.toHaveBeenCalled();
    expect(repository.appendSessionMessage).not.toHaveBeenCalled();
    expect(repository.createAnalyzeJob).not.toHaveBeenCalled();
    expect(repository.updateCursor).toHaveBeenCalledWith({
      cursorAuditId: 9002,
      cursorMsgtime: 1_780_244_060_000,
    });
  });

  it("runs one due historical rescan job from the requested time", async () => {
    const firstBatchMessage = {
      chatType: 1,
      content: JSON.stringify({ content: "第一批历史消息" }),
      fromType: 2,
      id: "8001",
      msgtime: 1_780_000_010_000,
      msgtype: "text",
      platform: 5,
      uid: 9001,
      thirdExternalId: "external-1",
      thirdGroupId: "",
      thirdUserId: "user-1",
    };
    const secondBatchMessage = {
      ...firstBatchMessage,
      content: JSON.stringify({ content: "第二批历史消息" }),
      id: "8002",
      msgtime: 1_780_000_020_000,
    };
    const repository = createRepository({
      claimNextSyncMessagesJob: vi.fn(async () => ({
        analysisScope: "classification",
        cursorMsgtime: 1_780_000_000_000,
        jobId: "rescan-job-1",
        rescanTaskId: "9901",
        uid: 9001,
      })),
      listIncrementalMessages: vi.fn(async ({ cursorMsgtime }) => {
        if (cursorMsgtime === 1_780_000_000_000) {
          return [firstBatchMessage];
        }

        if (cursorMsgtime === 1_780_000_010_000) {
          return [secondBatchMessage];
        }

        return [];
      }),
    });
    const service = new InsightsWorkerService(repository, { batchSize: 1 });

    await service.runOnce();

    expect(repository.claimNextSyncMessagesJob).toHaveBeenCalled();
    expect(repository.listIncrementalMessages).toHaveBeenCalledWith({
      cursorAuditId: 0,
      cursorMsgtime: 1_780_000_000_000,
      limit: 1,
      uid: 9001,
    });
    expect(repository.listIncrementalMessages).toHaveBeenCalledWith({
      cursorAuditId: 8001,
      cursorMsgtime: 1_780_000_010_000,
      limit: 1,
      uid: 9001,
    });
    expect(repository.appendSessionMessage).toHaveBeenCalledTimes(2);
    expect(repository.createAnalyzeJob).not.toHaveBeenCalled();
    expect(repository.markSyncMessagesJobSucceeded).toHaveBeenCalledWith("rescan-job-1");
  });

  it("reuses existing logical sessions during historical rescan instead of creating duplicate sessions", async () => {
    const repository = createRepository({
      claimNextSyncMessagesJob: vi.fn(async () => ({
        analysisScope: "classification",
        cursorMsgtime: 1_780_000_000_000,
        jobId: "rescan-job-1",
        rescanTaskId: "9901",
        uid: 9001,
      })),
      findSessionBySourceMessage: vi.fn(async () => undefined),
      listSessionsBySourceMessages: vi.fn(async () => [
        {
          sessionId: "501",
          sourceMessageId: "8001",
          uid: 9001,
        },
      ]),
      listIncrementalMessages: vi.fn(async ({ cursorMsgtime }) => {
        if (cursorMsgtime === 1_780_000_000_000) {
          return [
            {
              chatType: 1,
              content: JSON.stringify({ content: "历史消息" }),
              fromType: 2,
              id: "8001",
              msgtime: 1_780_000_010_000,
              msgtype: "text",
              platform: 5,
              uid: 9001,
              thirdExternalId: "external-1",
              thirdGroupId: "",
              thirdUserId: "user-1",
            },
          ];
        }

        return [];
      }),
    });
    const service = new InsightsWorkerService(repository, { batchSize: 50 });

    await service.runOnce();

    expect(repository.listSessionsBySourceMessages).toHaveBeenCalledWith({
      sourceMessageIds: ["8001"],
      uid: 9001,
    });
    expect(repository.findSessionBySourceMessage).not.toHaveBeenCalled();
    expect(repository.createLogicalSession).not.toHaveBeenCalled();
    expect(repository.appendSessionMessage).not.toHaveBeenCalled();
    expect(repository.createAnalyzeJob).toHaveBeenCalledTimes(1);
    expect(repository.createAnalyzeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisScope: "classification",
        rescanTaskId: "9901",
        jobType: "reanalyze_session",
        mode: "final",
        sessionId: "501",
        uid: 9001,
      }),
    );
    expect(repository.updateRescanTaskRunning).toHaveBeenCalledWith("9901");
    expect(repository.updateRescanTaskAfterScan).toHaveBeenCalledWith({
      queuedSessions: 1,
      rescanTaskId: "9901",
      totalSessions: 1,
    });
    expect(repository.markSyncMessagesJobSucceeded).toHaveBeenCalledWith("rescan-job-1");
  });

  it("runs one due analysis job, validates evidence ids and saves structured result", async () => {
    const promptContext = {
      entityDictionary: [],
      intentConfigs: [
        {
          aliases: ["查快递"],
          description: "物流相关诉求",
          includeInStatistics: true,
          intentCode: "logistics_delay",
          intentName: "物流异常",
          negativeExamples: [],
          positiveExamples: ["物流不更新"],
          weight: 8,
        },
      ],
      labelConfigs: [
        {
          description: "物流相关咨询",
          includeInStatistics: true,
          labelCode: "logistics",
          labelName: "物流咨询",
          negativeExamples: [],
          positiveExamples: ["快递什么时候到"],
        },
      ],
      qaRuleConfigs: [],
    };
    const repository = createRepository({
      claimNextAnalyzeJob: vi.fn(async () => ({
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "live",
        sessionId: "501",
        uid: 9001,
      })),
      getPromptContext: vi.fn(async () => promptContext),
      listIncrementalMessages: vi.fn(async () => []),
      listSessionMessagesForAnalysis: vi.fn(async () => [
        {
          chatType: 1,
          content: JSON.stringify({ content: "物流不更新" }),
          conversationId: "301",
          fromType: 2,
          id: "9001",
          msgtime: 1_780_244_000_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
        {
          chatType: 1,
          content: JSON.stringify({ content: "帮您催一下快递" }),
          conversationId: "301",
          fromType: 1,
          id: "9002",
          msgtime: 1_780_244_060_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
      ]),
    });
    const model = {
      analyzeSession: vi.fn(async () => ({
        actionItems: [
          {
            evidenceMessageIds: ["9002"],
            priority: "high",
            title: "确认快递状态",
          },
        ],
        entities: [
          {
            confidence: 0.8,
            entityId: "ai-service",
            entityName: "AI客服系统",
            entityType: "custom",
            evidenceMessageIds: ["9001"],
          },
        ],
        faqCandidates: [],
        intents: [
          {
            confidence: 0.84,
            evidenceMessageIds: ["9001", "9999"],
            intentCode: "logistics_delay",
            intentLabel: "模型自由名称",
          },
          {
            confidence: 0.7,
            evidenceMessageIds: ["9001"],
            intentCode: "free_text_intent",
            intentLabel: "自由意图",
          },
        ],
        problemResolution: {
          confidence: 0.82,
          evidence: [
            {
              evidenceRole: "customer_problem",
              messageId: "9001",
              reason: "客户反馈物流异常",
            },
            {
              evidenceRole: "unresolved_signal",
              messageId: "9999",
              reason: "非法证据",
            },
          ],
          evidenceMessageIds: ["9001", "9999"],
          problemDetected: true,
          problemSummary: "客户反馈物流异常",
          resolutionStatus: "unresolved",
          unresolvedReason: "物流状态未确认",
        },
        qaFindings: [
          {
            confidence: 0.7,
            evidenceMessageIds: ["9001"],
            passed: false,
            reason: "模型越界输出未配置质检规则",
            ruleCode: "undefined_rule",
            severity: "medium",
          },
        ],
        risks: [
          {
            confidence: 0.6,
            evidenceMessageIds: ["9001"],
            reason: "模型越界输出风险",
            riskLevel: "medium",
            riskType: "custom_risk",
          },
        ],
        sentiment: [],
        summary: {
          confidence: 0.88,
          customerIntent: "查物流",
          processSummary: "客服承诺催快递",
          resultSummary: "尚未确认物流进展",
        },
        tags: [],
      })),
    };
    const service = new InsightsWorkerService(repository, { model });

    await service.runOnce();

    expect(repository.startAnalysisRun).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        sessionId: "501",
      }),
    );
    expect(model.analyzeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        context: promptContext,
        messages: expect.arrayContaining([
          expect.objectContaining({ sourceMessageId: "9001" }),
        ]),
      }),
    );
    expect(repository.saveAnalysisResult).toHaveBeenCalledWith(
      expect.objectContaining({
        validationWarnings: expect.arrayContaining([
          expect.stringContaining("9999"),
          expect.stringContaining("entity ai-service is not configured"),
          expect.stringContaining("intent free_text_intent is not configured"),
          expect.stringContaining("qa rule undefined_rule is not configured"),
          expect.stringContaining("risk custom_risk is not accepted"),
        ]),
        output: expect.objectContaining({
          entities: [],
          intents: [
            expect.objectContaining({
              evidenceMessageIds: ["9001"],
              intentCode: "logistics_delay",
              intentLabel: "物流异常",
            }),
          ],
          problemResolution: expect.objectContaining({
            evidenceMessageIds: ["9001"],
          }),
          qaFindings: [],
          risks: [],
        }),
      }),
    );
    const savedInput = vi.mocked(repository.saveAnalysisResult).mock.calls[0]?.[0];
    expect(savedInput?.validationWarnings).not.toEqual(
      expect.arrayContaining([expect.stringContaining("intent logistics_delay is not configured")]),
    );
    expect(repository.markAnalysisJobSucceeded).toHaveBeenCalledWith("job-1");
  });

  it("marks low-confidence analysis output as partial using tenant policy", async () => {
    const repository = createRepository({
      claimNextAnalyzeJob: vi.fn(async () => ({
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "live",
        sessionId: "501",
        uid: 9001,
      })),
      getAnalysisPolicy: vi.fn(async () => ({
        lowConfidenceThreshold: 0.75,
      })),
      listIncrementalMessages: vi.fn(async () => []),
      listSessionMessagesForAnalysis: vi.fn(async () => [
        {
          chatType: 1,
          content: JSON.stringify({ content: "物流不更新" }),
          conversationId: "301",
          fromType: 2,
          id: "9001",
          msgtime: 1_780_244_000_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
      ]),
    });
    const model = {
      analyzeSession: vi.fn(async () => ({
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.62,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: true,
          problemSummary: "客户反馈物流异常",
          resolutionStatus: "unknown",
        },
        qaFindings: [],
        risks: [],
        sentiment: [],
        summary: {
          confidence: 0.9,
          customerIntent: "物流异常",
          processSummary: "客服已回复",
          resultSummary: "结果不明确",
        },
        tags: [],
      })),
    };
    const service = new InsightsWorkerService(repository, { model });

    await service.runOnce();

    expect(repository.getAnalysisPolicy).toHaveBeenCalledWith(9001);
    expect(repository.saveAnalysisResult).toHaveBeenCalledWith(
      expect.objectContaining({
        validationWarnings: expect.arrayContaining([
          expect.stringContaining("confidence 0.62 is below threshold 0.75"),
        ]),
      }),
    );
  });

  it("merges scoped classification output with the current full analysis before saving", async () => {
    const previousOutput = {
      actionItems: [
        {
          evidenceMessageIds: ["9002"],
          priority: "high" as const,
          title: "确认快递状态",
        },
      ],
      entities: [],
      faqCandidates: [
        {
          answerHint: "先查物流轨迹",
          evidenceMessageIds: ["9001"],
          question: "物流停滞怎么办",
          status: "candidate",
        },
      ],
      intents: [],
      problemResolution: {
        confidence: 0.82,
        evidence: [],
        evidenceMessageIds: ["9001"],
        problemDetected: true,
        problemSummary: "客户反馈物流异常",
        resolutionStatus: "unresolved" as const,
      },
      qaFindings: [
        {
          confidence: 0.8,
          evidenceMessageIds: ["9002"],
          passed: true,
          reason: "客服有回应",
          ruleCode: "reply_quality",
          severity: "high" as const,
        },
      ],
      risks: [],
      sentiment: [
        {
          confidence: 0.75,
          evidenceMessageIds: ["9001"],
          polarity: "negative" as const,
          reason: "客户表达不满",
        },
      ],
      summary: {
        confidence: 0.9,
        customerIntent: "查物流",
        processSummary: "客服承诺处理",
        resultSummary: "尚未解决",
      },
      tags: [
        {
          confidence: 0.6,
          evidenceMessageIds: ["9001"],
          tagCode: "old",
          tagName: "旧标签",
        },
      ],
    };
    const repository = createRepository({
      claimNextAnalyzeJob: vi.fn(async () => ({
        analysisScope: "classification",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "manual_reanalyze",
        rescanTaskId: "9901",
        sessionId: "501",
        uid: 9001,
      })),
      getCurrentAnalysisOutput: vi.fn(async () => previousOutput),
      getPromptContext: vi.fn(async () => ({
        entityDictionary: [
          {
            aliases: ["羽绒服"],
            canonicalName: "白色羽绒服",
            entityId: "sku-1",
            entityType: "product",
            includeInAggregation: true,
          },
        ],
        intentConfigs: [],
        labelConfigs: [
          {
            includeInStatistics: true,
            labelCode: "logistics",
            labelName: "物流咨询",
            negativeExamples: [],
            positiveExamples: ["物流不更新"],
          },
        ],
        qaRuleConfigs: [],
      })),
      listIncrementalMessages: vi.fn(async () => []),
      listSessionMessagesForAnalysis: vi.fn(async () => [
        {
          chatType: 1,
          content: JSON.stringify({ content: "物流不更新" }),
          conversationId: "301",
          fromType: 2,
          id: "9001",
          msgtime: 1_780_244_000_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
      ]),
    });
    const model = {
      analyzeSession: vi.fn(async () => ({
        actionItems: [],
        entities: [
          {
            confidence: 0.8,
            entityId: "sku-1",
            entityName: "白色羽绒服",
            entityType: "product",
            evidenceMessageIds: ["9001"],
          },
        ],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: false,
          problemSummary: "",
          resolutionStatus: "unknown" as const,
        },
        qaFindings: [],
        risks: [],
        sentiment: [],
        summary: {
          confidence: 0,
          customerIntent: "",
          processSummary: "",
          resultSummary: "",
        },
        tags: [
          {
            confidence: 0.9,
            evidenceMessageIds: ["9001"],
            tagCode: "logistics",
            tagName: "物流咨询",
          },
        ],
      })),
    };
    const service = new InsightsWorkerService(repository, { model });

    await service.runOnce();

    expect(repository.getCurrentAnalysisOutput).toHaveBeenCalledWith({
      sessionId: "501",
      uid: 9001,
    });
    expect(model.analyzeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        previousOutput,
      }),
    );
    expect(repository.saveAnalysisResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          actionItems: previousOutput.actionItems,
          entities: [expect.objectContaining({ entityId: "sku-1" })],
          faqCandidates: previousOutput.faqCandidates,
          problemResolution: previousOutput.problemResolution,
          qaFindings: previousOutput.qaFindings,
          sentiment: previousOutput.sentiment,
          summary: previousOutput.summary,
          tags: [expect.objectContaining({ tagCode: "logistics" })],
        }),
      }),
    );
  });

  it("saves analyzer dimension warnings as partial validation warnings", async () => {
    const repository = createRepository({
      claimNextAnalyzeJob: vi.fn(async () => ({
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "final",
        sessionId: "501",
        uid: 9001,
      })),
      listIncrementalMessages: vi.fn(async () => []),
      listSessionMessagesForAnalysis: vi.fn(async () => [
        {
          chatType: 1,
          content: JSON.stringify({ content: "物流不更新" }),
          conversationId: "301",
          fromType: 2,
          id: "9001",
          msgtime: 1_780_244_000_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
      ]),
    });
    const model = {
      analyzeSession: vi.fn(async () => ({
        actionItems: [],
        analysisWarnings: ["qaFindings analysis failed: LLM request failed: 429 rate limited"],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.82,
          evidence: [],
          evidenceMessageIds: ["9001"],
          problemDetected: true,
          problemSummary: "客户反馈物流异常",
          resolutionStatus: "unknown",
        },
        qaFindings: [],
        risks: [],
        sentiment: [],
        summary: {
          confidence: 0.88,
          customerIntent: "查物流",
          processSummary: "客服处理中",
          resultSummary: "待确认",
        },
        tags: [],
      })),
    };
    const service = new InsightsWorkerService(repository, { model });

    await service.runOnce();

    expect(repository.saveAnalysisResult).toHaveBeenCalledWith(
      expect.objectContaining({
        validationWarnings: expect.arrayContaining([
          "qaFindings analysis failed: LLM request failed: 429 rate limited",
        ]),
      }),
    );
    expect(repository.markAnalysisJobSucceeded).toHaveBeenCalledWith("job-1");
  });

  it("passes up to three previous session summaries from the 48 hour lookback to the model", async () => {
    const previousSessionContexts = [
      {
        endedAt: 1_780_100_000_000,
        followUp: "建议关注补发物流",
        problemSummary: "客户反馈上次订单少发",
        processSummary: "客服登记并承诺补寄",
        resolutionStatus: "partially_resolved" as const,
        resultSummary: "已登记补寄，物流未确认",
        sessionId: "200",
        startedAt: 1_780_090_000_000,
        unresolvedReason: "尚未给出补寄单号",
      },
    ];
    const repository = createRepository({
      claimNextAnalyzeJob: vi.fn(async () => ({
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "live",
        sessionId: "501",
        uid: 9001,
      })),
      listIncrementalMessages: vi.fn(async () => []),
      listPreviousSessionContexts: vi.fn(async () => previousSessionContexts),
      listSessionMessagesForAnalysis: vi.fn(async () => [
        {
          chatType: 1,
          content: JSON.stringify({ content: "今天还能发货吗" }),
          conversationId: "301",
          fromType: 2,
          id: "9001",
          msgtime: 1_780_244_000_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
      ]),
    });
    const model = {
      analyzeSession: vi.fn(async () => ({
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.8,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: true,
          problemSummary: "客户询问发货时间",
          resolutionStatus: "unknown",
        },
        qaFindings: [],
        risks: [],
        sentiment: [],
        summary: {
          confidence: 0.8,
          customerIntent: "发货咨询",
          processSummary: "客服未明确回复",
          resultSummary: "待确认",
        },
        tags: [],
      })),
    };
    const service = new InsightsWorkerService(repository, { model });

    await service.runOnce();

    expect(repository.listPreviousSessionContexts).toHaveBeenCalledWith({
      currentSessionId: "501",
      limit: 3,
      lookbackHours: 48,
      uid: 9001,
    });
    expect(model.analyzeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        previousSessionContexts,
      }),
    );
  });

  it("postpones analysis once when voice transcription is still pending", async () => {
    const repository = createRepository({
      claimNextAnalyzeJob: vi.fn(async () => ({
        analysisScope: "all",
        attemptCount: 1,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "live",
        sessionId: "501",
        uid: 9001,
      })),
      listIncrementalMessages: vi.fn(async () => []),
      listSessionMessagesForAnalysis: vi.fn(async () => [
        {
          chatType: 1,
          content: JSON.stringify({ duration: 8, transVoiceText: "" }),
          conversationId: "301",
          fromType: 2,
          id: "9001",
          msgtime: 1_780_244_000_000,
          msgtype: "voice",
          thirdUserId: "user-1",
        },
        {
          chatType: 1,
          content: JSON.stringify({ content: "好的" }),
          conversationId: "301",
          fromType: 1,
          id: "9002",
          msgtime: 1_780_244_060_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
      ]),
    });
    const model = {
      analyzeSession: vi.fn(async () => {
        throw new Error("model should not be called before input is ready");
      }),
    };
    const service = new InsightsWorkerService(repository, { model });

    await service.runOnce();

    expect(repository.startAnalysisRun).not.toHaveBeenCalled();
    expect(model.analyzeSession).not.toHaveBeenCalled();
    expect(repository.postponeAnalysisJobForInputReadiness).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        delayMs: 5 * 60_000,
        reason: "pending_transcription",
      }),
    );
    expect(repository.markAnalysisJobFailed).not.toHaveBeenCalled();
  });

  it("continues analysis with a warning when voice transcription is still pending after postponement", async () => {
    const repository = createRepository({
      claimNextAnalyzeJob: vi.fn(async () => ({
        analysisScope: "all",
        attemptCount: 2,
        jobId: "job-1",
        maxAttempts: 3,
        mode: "live",
        sessionId: "501",
        uid: 9001,
      })),
      listIncrementalMessages: vi.fn(async () => []),
      listSessionMessagesForAnalysis: vi.fn(async () => [
        {
          chatType: 1,
          content: JSON.stringify({ duration: 8, transVoiceText: "" }),
          conversationId: "301",
          fromType: 2,
          id: "9001",
          msgtime: 1_780_244_000_000,
          msgtype: "voice",
          thirdUserId: "user-1",
        },
        {
          chatType: 1,
          content: JSON.stringify({ content: "帮您确认一下" }),
          conversationId: "301",
          fromType: 1,
          id: "9002",
          msgtime: 1_780_244_060_000,
          msgtype: "text",
          thirdUserId: "user-1",
        },
      ]),
    });
    const model = {
      analyzeSession: vi.fn(async () => ({
        actionItems: [],
        entities: [],
        faqCandidates: [],
        intents: [],
        problemResolution: {
          confidence: 0.8,
          evidence: [],
          evidenceMessageIds: [],
          problemDetected: false,
          problemSummary: "",
          resolutionStatus: "no_customer_problem",
        },
        qaFindings: [],
        risks: [],
        sentiment: [],
        summary: {
          confidence: 0.8,
          customerIntent: "寒暄",
          processSummary: "客服已回复",
          resultSummary: "无需处理",
        },
        tags: [],
      })),
    };
    const service = new InsightsWorkerService(repository, { model });

    await service.runOnce();

    expect(repository.postponeAnalysisJobForInputReadiness).not.toHaveBeenCalled();
    expect(model.analyzeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            contentStatus: "ready",
            sourceMessageId: "9002",
          }),
        ],
      }),
    );
    expect(repository.saveAnalysisResult).toHaveBeenCalledWith(
      expect.objectContaining({
        validationWarnings: expect.arrayContaining([
          "存在未完成语音转写",
        ]),
      }),
    );
  });
});

describe("insights worker ticker", () => {
  it("does not overlap ticks when one run is still pending", async () => {
    let resolveCurrent: (() => void) | undefined;
    let runs = 0;
    const ticker = createNonOverlappingTicker(async () => {
      runs += 1;
      await new Promise<void>((resolve) => {
        resolveCurrent = resolve;
      });
    });

    const first = ticker.tick();
    const second = ticker.tick();

    await expect(second).resolves.toBe(false);
    expect(runs).toBe(1);
    resolveCurrent?.();
    await first;

    const third = ticker.tick();
    resolveCurrent?.();
    await expect(third).resolves.toBe(true);
  });

  it("waits for an in-flight tick before stopping", async () => {
    vi.useFakeTimers();
    let resolveRun: (() => void) | undefined;
    let stopped = false;
    const worker = startInsightsWorker({
      intervalMs: 1_000,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
      },
      runOnce: async () => {
        await new Promise<void>((resolve) => {
          resolveRun = resolve;
        });
      },
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const stopPromise = worker.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();

    expect(stopped).toBe(false);
    resolveRun?.();
    await stopPromise;
    expect(stopped).toBe(true);
    vi.useRealTimers();
  });
});
