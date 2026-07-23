import type {
  InsightWorkerPipelineRuntimeReport,
} from "./insights-worker.js";

export type InsightsWorkerPipeline = InsightWorkerPipelineRuntimeReport["pipeline"];

export type InsightsWorkerLogger = {
  debug(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
};

type PipelineWindow = {
  counters: Record<string, number>;
  durationMaxMs: number;
  durationTotalMs: number;
  lastSuccessAt?: Date;
  ticksFailed: number;
  ticksRun: number;
  ticksSkippedBusy: number;
  ticksSucceeded: number;
};

type RuntimeState = Omit<InsightWorkerPipelineRuntimeReport, "pipeline" | "reportedBy">;

type ThrottleEntry = {
  lastEmittedAt: number;
  lastSeenAt: number;
  suppressedCount: number;
};

export type InsightsWorkerEventInput = {
  errorCode?: string;
  eventCode: string;
  level: "debug" | "error" | "info" | "warn";
  message: string;
  payload?: Record<string, unknown>;
  pipeline: InsightsWorkerPipeline;
  throttleKey?: string;
  uid?: number;
};

const PIPELINES: InsightsWorkerPipeline[] = [
  "discovery",
  "sessionization",
  "analysis",
];
const PIPELINE_COUNTERS: Record<InsightsWorkerPipeline, readonly string[]> = {
  analysis: [
    "jobsClaimed",
    "succeeded",
    "skippedInsightDisabled",
    "skippedInsufficientMessages",
    "postponedTranscription",
    "liveGateSkipped",
    "retried",
    "failed",
    "snapshotsPublished",
    "modelRequests",
    "modelRetries",
    "modelTimeouts",
    "modelFailures",
    "optionalStepFailures",
    "responseFormatFallbacks",
    "archiveFailures",
    "syncSucceeded",
    "syncFailed",
  ],
  discovery: [
    "discoveredMessages",
    "discoveredUids",
    "emptyBatches",
    "lockSkipped",
  ],
  sessionization: [
    "jobsClaimed",
    "jobsDeleted",
    "jobsRequeued",
    "jobsFailed",
    "scannedMessages",
    "sessionizedMessages",
    "closedSessions",
    "liveJobsScheduled",
    "claimLost",
    "leasesReclaimed",
  ],
};
const ERROR_THROTTLE_MS = 5 * 60_000;
const ERROR_ENTRY_TTL_MS = 30 * 60_000;
const ERROR_ENTRY_LIMIT = 5_000;

export class InsightsWorkerObservability {
  private readonly pipelines = new Map<InsightsWorkerPipeline, PipelineWindow>();
  private readonly runtime = new Map<InsightsWorkerPipeline, RuntimeState>();
  private readonly throttles = new Map<string, ThrottleEntry>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly options: {
      flushIntervalMs?: number;
      logger: InsightsWorkerLogger;
      now?: () => number;
      reportedBy: string;
      repository: {
        upsertWorkerPipelineRuntimeState(
          input: InsightWorkerPipelineRuntimeReport,
        ): Promise<void>;
      };
      traceUids: ReadonlySet<number>;
    },
  ) {
    for (const pipeline of PIPELINES) {
      this.pipelines.set(pipeline, createPipelineWindow(pipeline));
      this.runtime.set(pipeline, {});
    }
  }

  start() {
    this.options.logger.info({
      component: "insights-worker",
      eventCode: "insights_worker.started",
      traceUidCount: this.options.traceUids.size,
    }, "会话洞察 Worker 已启动");
    void this.flushRuntimeStates();
    this.timer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs ?? 60_000);
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.flush();
    this.options.logger.info({
      component: "insights-worker",
      eventCode: "insights_worker.stopped",
    }, "会话洞察 Worker 已停止");
  }

  pipelineStarted(pipeline: InsightsWorkerPipeline) {
    const now = new Date(this.now());
    this.pipelines.get(pipeline)!.ticksRun += 1;
    this.runtime.set(pipeline, {
      ...this.runtime.get(pipeline),
      lastStartedAt: now,
    });
    return now.getTime();
  }

  pipelineSucceeded(pipeline: InsightsWorkerPipeline, startedAt: number) {
    const completedAt = new Date(this.now());
    const durationMs = Math.max(0, completedAt.getTime() - startedAt);
    const window = this.pipelines.get(pipeline)!;
    window.ticksSucceeded += 1;
    window.durationTotalMs += durationMs;
    window.durationMaxMs = Math.max(window.durationMaxMs, durationMs);
    window.lastSuccessAt = completedAt;
    this.runtime.set(pipeline, {
      ...this.runtime.get(pipeline),
      lastDurationMs: durationMs,
      lastSuccessAt: completedAt,
    });
    this.recover(`pipeline:${pipeline}`, pipeline);
  }

  pipelineFailed(
    pipeline: InsightsWorkerPipeline,
    startedAt: number,
    error: unknown,
  ) {
    const completedAt = new Date(this.now());
    const durationMs = Math.max(0, completedAt.getTime() - startedAt);
    const errorCode = getWorkerErrorCode(error);
    const window = this.pipelines.get(pipeline)!;
    window.ticksFailed += 1;
    window.durationTotalMs += durationMs;
    window.durationMaxMs = Math.max(window.durationMaxMs, durationMs);
    this.runtime.set(pipeline, {
      ...this.runtime.get(pipeline),
      lastDurationMs: durationMs,
      lastErrorCode: errorCode,
      lastFailureAt: completedAt,
    });
    this.event({
      errorCode,
      eventCode: "insights_worker.pipeline_tick_failed",
      level: errorCode.startsWith("GLOBAL_SESSIONIZATION_CURSOR_")
        ? "error"
        : "warn",
      message: "会话洞察 Worker 管线执行失败",
      payload: safeErrorPayload(error),
      pipeline,
      throttleKey: `pipeline:${pipeline}`,
    });
  }

  pipelineBusy(pipeline: InsightsWorkerPipeline) {
    this.pipelines.get(pipeline)!.ticksSkippedBusy += 1;
  }

  increment(
    pipeline: InsightsWorkerPipeline,
    counter: string,
    amount = 1,
  ) {
    const counters = this.pipelines.get(pipeline)!.counters;
    counters[counter] = (counters[counter] ?? 0) + amount;
  }

  set(
    pipeline: InsightsWorkerPipeline,
    counter: string,
    value: number,
  ) {
    this.pipelines.get(pipeline)!.counters[counter] = value;
  }

  event(input: InsightsWorkerEventInput) {
    const now = this.now();
    const key = input.throttleKey
      ? `${input.eventCode}:${input.pipeline}:${input.throttleKey}:${input.errorCode ?? ""}`
      : undefined;

    if (key && (input.level === "warn" || input.level === "error")) {
      const existing = this.throttles.get(key);
      if (existing && now - existing.lastEmittedAt < ERROR_THROTTLE_MS) {
        existing.lastSeenAt = now;
        existing.suppressedCount += 1;
        return;
      }

      const suppressedCount = existing?.suppressedCount ?? 0;
      this.throttles.set(key, {
        lastEmittedAt: now,
        lastSeenAt: now,
        suppressedCount: 0,
      });
      input.payload = {
        ...input.payload,
        ...(suppressedCount > 0 ? { suppressedCount } : {}),
      };
      this.pruneThrottles(now);
    }

    const level = input.level === "debug"
      && input.uid != null
      && this.options.traceUids.has(input.uid)
      ? "info"
      : input.level;
    this.options.logger[level]({
      component: "insights-worker",
      errorCode: input.errorCode,
      eventCode: input.eventCode,
      pipeline: input.pipeline,
      uid: input.uid,
      ...input.payload,
    }, input.message);
  }

  recover(
    throttleKey: string,
    pipeline: InsightsWorkerPipeline,
    uid?: number,
  ) {
    const matchingKeys = Array.from(this.throttles.keys()).filter((key) =>
      key.includes(`:${pipeline}:${throttleKey}:`)
    );

    if (matchingKeys.length === 0) {
      return;
    }

    for (const key of matchingKeys) {
      this.throttles.delete(key);
    }
    this.options.logger.info({
      component: "insights-worker",
      eventCode: throttleKey.startsWith("pipeline:")
        ? "insights_worker.pipeline_recovered"
        : "insights_worker.error_recovered",
      pipeline,
      uid,
    }, "会话洞察 Worker 异常已恢复");
  }

  private async flush() {
    const windowSeconds = (this.options.flushIntervalMs ?? 60_000) / 1_000;
    for (const pipeline of PIPELINES) {
      const window = this.pipelines.get(pipeline)!;
      this.options.logger.info({
        component: "insights-worker",
        durationMaxMs: window.durationMaxMs,
        durationTotalMs: window.durationTotalMs,
        eventCode: "insights_worker.pipeline_summary",
        lastSuccessAt: window.lastSuccessAt?.toISOString(),
        pipeline,
        ticksFailed: window.ticksFailed,
        ticksRun: window.ticksRun,
        ticksSkippedBusy: window.ticksSkippedBusy,
        ticksSucceeded: window.ticksSucceeded,
        windowSeconds,
        ...window.counters,
      }, "会话洞察 Worker 管线运行汇总");
      this.pipelines.set(pipeline, createPipelineWindow(pipeline));
    }
    await this.flushRuntimeStates();
  }

  private async flushRuntimeStates() {
    for (const pipeline of PIPELINES) {
      try {
        await this.options.repository.upsertWorkerPipelineRuntimeState({
          ...this.runtime.get(pipeline),
          pipeline,
          reportedBy: this.options.reportedBy,
        });
      } catch (error) {
        this.event({
          errorCode: getWorkerErrorCode(error),
          eventCode: "insights_worker.observability_flush_failed",
          level: "warn",
          message: "会话洞察 Worker 运行状态上报失败",
          payload: safeErrorPayload(error),
          pipeline,
          throttleKey: "observability_flush",
        });
      }
    }
  }

  private pruneThrottles(now: number) {
    for (const [key, entry] of this.throttles) {
      if (now - entry.lastSeenAt > ERROR_ENTRY_TTL_MS) {
        this.throttles.delete(key);
      }
    }
    while (this.throttles.size > ERROR_ENTRY_LIMIT) {
      const oldestKey = this.throttles.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.throttles.delete(oldestKey);
    }
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }
}

export function getWorkerErrorCode(error: unknown) {
  if (error instanceof Error) {
    const candidateCode = (error as Error & { code?: unknown }).code;
    if (isStableErrorCode(candidateCode)) {
      return candidateCode;
    }
    const stableCode = error.message.match(/^([A-Z][A-Z0-9_]{2,})(?::|$)/)?.[1];
    if (stableCode) {
      return stableCode;
    }
    if (error.name === "AbortError" || error.name === "LlmTimeoutError") {
      return "LLM_TIMEOUT";
    }
    if (error.name === "LlmRequestError") {
      return "LLM_REQUEST_FAILED";
    }
  }
  return "UNKNOWN";
}

export function safeErrorPayload(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownError" };
  }

  const candidate = error as Error & {
    failedStep?: unknown;
    status?: unknown;
    statusCode?: unknown;
    timeoutMs?: unknown;
  };
  const httpStatus = typeof candidate.status === "number"
    ? candidate.status
    : typeof candidate.statusCode === "number"
      ? candidate.statusCode
      : undefined;
  return {
    errorName: error.name,
    ...(isLlmStep(candidate.failedStep)
      ? { failedStep: candidate.failedStep }
      : {}),
    ...(httpStatus == null ? {} : { httpStatus }),
    ...(typeof candidate.timeoutMs === "number"
      ? { timeoutMs: candidate.timeoutMs }
      : {}),
  };
}

function isStableErrorCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{2,}$/.test(value);
}

function isLlmStep(value: unknown): value is string {
  return value === "classification"
    || value === "live_gate"
    || value === "qa"
    || value === "single"
    || value === "summary";
}

function createPipelineWindow(
  pipeline: InsightsWorkerPipeline,
): PipelineWindow {
  return {
    counters: Object.fromEntries(
      PIPELINE_COUNTERS[pipeline].map((counter) => [counter, 0]),
    ),
    durationMaxMs: 0,
    durationTotalMs: 0,
    ticksFailed: 0,
    ticksRun: 0,
    ticksSkippedBusy: 0,
    ticksSucceeded: 0,
  };
}
