export type WorkerLogFieldRow = {
  field: string;
  label: string;
  value: string;
};

export type WorkerLogSection = {
  rows: WorkerLogFieldRow[];
  title: string;
};

export type WorkerLogInterpretation = {
  eventCode?: string;
  pipeline?: string;
  sections: WorkerLogSection[];
  summary: string;
  title: string;
};

type JsonObject = Record<string, unknown>;

const PIPELINE_LABELS: Record<string, string> = {
  analysis: "分析",
  discovery: "消息发现",
  sessionization: "会话切片",
};

const COMMON_SUMMARY_FIELDS: Record<string, string> = {
  durationMaxMs: "单次 tick 最大耗时（毫秒）",
  durationTotalMs: "窗口内 tick 总耗时（毫秒）",
  lastSuccessAt: "窗口内最后一次成功时间",
  ticksFailed: "失败的 tick 次数",
  ticksRun: "实际开始执行的 tick 次数",
  ticksSkippedBusy: "因上一轮未结束而跳过的次数",
  ticksSucceeded: "成功完成的 tick 次数",
  windowSeconds: "汇总窗口秒数",
};

const DISCOVERY_FIELDS: Record<string, string> = {
  cursorAuditId: "全局发现水位 audit id",
  discoveredMessages: "本窗口发现的消息条数",
  discoveredUids: "本窗口发现并入队的 UID 数",
  emptyBatches: "空批次数",
  lockSkipped: "因锁竞争跳过的次数",
};

const SESSIONIZATION_FIELDS: Record<string, string> = {
  claimLost: "claim 丢失次数",
  closedSessions: "关闭的逻辑会话数",
  jobsClaimed: "领取的 sessionize_uid 任务数",
  jobsDeleted: "追平后删除的任务数",
  jobsFailed: "维护失败并重新排队的次数",
  jobsRequeued: "未追平继续 pending 的次数",
  leasesReclaimed: "回收过期租约数",
  liveJobsScheduled: "调度的 Live 分析任务数",
  scannedMessages: "扫描的消息数",
  sessionizedMessages: "写入会话归属的消息数",
};

const ANALYSIS_FIELDS: Record<string, string> = {
  archiveFailures: "终态任务归档失败次数",
  failed: "终态失败任务数",
  jobsClaimed: "领取的分析任务数",
  liveGateSkipped: "Live gate 跳过次数",
  modelFailures: "模型请求失败次数",
  modelRequests: "真实模型 HTTP 请求次数",
  modelRetries: "模型请求重试次数",
  modelTimeouts: "模型请求超时次数",
  optionalStepFailures: "可选步骤失败次数",
  postponedTranscription: "等待转写推迟次数",
  responseFormatFallbacks: "响应格式降级次数",
  retried: "安排重试的任务数",
  skippedInsightDisabled: "因洞察关闭跳过次数",
  skippedInsufficientMessages: "因消息不足跳过次数",
  snapshotsPublished: "发布分析快照数",
  succeeded: "分析成功任务数",
  syncFailed: "sync_messages 失败次数",
  syncSucceeded: "sync_messages 成功次数",
};

const SUMMARY_FAILURE_COUNT_FIELDS = [
  "archiveFailures",
  "failed",
  "jobsFailed",
  "modelFailures",
  "modelTimeouts",
  "optionalStepFailures",
  "syncFailed",
] as const;

const META_FIELDS: Record<string, string> = {
  component: "组件",
  errorCode: "稳定错误码",
  eventCode: "事件码",
  hostname: "主机名",
  level: "日志级别",
  msg: "可读消息",
  pid: "进程 ID",
  pipeline: "管线",
  time: "日志时间",
  uid: "租户 UID",
};

const KNOWN_EVENT_TITLES: Record<string, string> = {
  "insights_worker.analysis_completed": "分析任务成功",
  "insights_worker.analysis_failed": "分析任务终态失败",
  "insights_worker.analysis_retry_scheduled": "分析失败已安排重试",
  "insights_worker.analysis_skipped": "分析任务跳过",
  "insights_worker.analysis_started": "分析任务开始",
  "insights_worker.archive_failed": "终态任务归档失败",
  "insights_worker.claim_lost": "任务 claim 丢失",
  "insights_worker.disabled": "Worker 未启用",
  "insights_worker.discovery_batch": "消息发现单批结果",
  "insights_worker.error_recovered": "异常已恢复",
  "insights_worker.lease_reclaimed": "回收过期租约",
  "insights_worker.live_gate_degraded": "Live gate 降级",
  "insights_worker.llm_optional_step_failed": "可选分析步骤失败",
  "insights_worker.llm_request_completed": "模型请求完成",
  "insights_worker.llm_response_format_fallback": "模型响应格式降级",
  "insights_worker.observability_flush_failed": "观测心跳/汇总写入失败",
  "insights_worker.pipeline_recovered": "管线异常已恢复",
  "insights_worker.pipeline_summary": "管线运行汇总",
  "insights_worker.pipeline_tick_failed": "管线 tick 失败",
  "insights_worker.rescan_completed": "人工重刷完成",
  "insights_worker.rescan_failed": "人工重刷终态失败",
  "insights_worker.rescan_started": "人工重刷开始",
  "insights_worker.sessionization_uid_completed": "UID 切片批次完成",
  "insights_worker.sessionization_uid_failed": "UID 切片维护失败",
  "insights_worker.sessions_closed": "会话关闭批次",
  "insights_worker.started": "Worker 已启动",
  "insights_worker.stopped": "Worker 已停止",
};

export function extractWorkerLogObjects(raw: string): JsonObject[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const objects: JsonObject[] = [];
  const pushIfObject = (value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      objects.push(value as JsonObject);
    }
  };

  try {
    pushIfObject(JSON.parse(trimmed));
    if (objects.length > 0) {
      return objects;
    }
  } catch {
    // Fall through to line / embedded object parsing.
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate) {
      continue;
    }
    try {
      pushIfObject(JSON.parse(candidate));
      continue;
    } catch {
      // Try extracting the first JSON object on the line.
    }

    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) {
      continue;
    }
    try {
      pushIfObject(JSON.parse(candidate.slice(start, end + 1)));
    } catch {
      // Ignore non-JSON fragments.
    }
  }

  return objects;
}

export function interpretWorkerLog(raw: string): WorkerLogInterpretation[] {
  return extractWorkerLogObjects(raw).map(interpretWorkerLogObject);
}

function interpretWorkerLogObject(log: JsonObject): WorkerLogInterpretation {
  const eventCode = asString(log.eventCode);
  const pipeline = asString(log.pipeline);
  const title = eventCode
    ? (KNOWN_EVENT_TITLES[eventCode] ?? eventCode)
    : "未识别的日志对象";

  if (eventCode === "insights_worker.pipeline_summary") {
    return interpretPipelineSummary(log, title, pipeline);
  }

  return {
    ...(eventCode ? { eventCode } : {}),
    ...(pipeline ? { pipeline } : {}),
    sections: [
      {
        rows: toRows(log, {
          ...META_FIELDS,
          ...COMMON_SUMMARY_FIELDS,
          ...DISCOVERY_FIELDS,
          ...SESSIONIZATION_FIELDS,
          ...ANALYSIS_FIELDS,
        }),
        title: "字段说明",
      },
    ],
    summary: buildGenericSummary(log, title, pipeline),
    title,
  };
}

function interpretPipelineSummary(
  log: JsonObject,
  title: string,
  pipeline: string | undefined,
): WorkerLogInterpretation {
  const pipelineFields = pipeline === "discovery"
    ? DISCOVERY_FIELDS
    : pipeline === "sessionization"
      ? SESSIONIZATION_FIELDS
      : pipeline === "analysis"
        ? ANALYSIS_FIELDS
        : {};
  const businessKeys = Object.keys(pipelineFields);
  const sections: WorkerLogSection[] = [
    {
      rows: toRows(pick(log, Object.keys(COMMON_SUMMARY_FIELDS)), COMMON_SUMMARY_FIELDS),
      title: "窗口与健康",
    },
  ];

  if (businessKeys.some((key) => key in log)) {
    sections.push({
      rows: toRows(pick(log, businessKeys), pipelineFields),
      title: "业务计数",
    });
  }

  sections.push({
    rows: toRows(pick(log, Object.keys(META_FIELDS)), META_FIELDS),
    title: "日志元信息",
  });

  return {
    eventCode: "insights_worker.pipeline_summary",
    ...(pipeline ? { pipeline } : {}),
    sections: sections.filter((section) => section.rows.length > 0),
    summary: buildPipelineSummaryVerdict(log, pipeline),
    title,
  };
}

function buildPipelineSummaryVerdict(
  log: JsonObject,
  pipeline: string | undefined,
): string {
  const pipelineLabel = pipeline
    ? (PIPELINE_LABELS[pipeline] ?? pipeline)
    : "未知";
  const ticksRun = asNumber(log.ticksRun) ?? 0;
  const ticksSucceeded = asNumber(log.ticksSucceeded) ?? 0;
  const ticksFailed = asNumber(log.ticksFailed) ?? 0;
  const ticksSkippedBusy = asNumber(log.ticksSkippedBusy) ?? 0;
  const jobsClaimed = asNumber(log.jobsClaimed)
    ?? asNumber(log.discoveredUids)
    ?? 0;
  const failureCount = sumPositiveCounts(log, SUMMARY_FAILURE_COUNT_FIELDS);

  if (ticksFailed > 0) {
    return `${pipelineLabel}管线近一分钟有 ${ticksFailed} 次 tick 失败，需要结合 WARN/ERROR 排查`;
  }
  if (ticksSkippedBusy > 0 && ticksSkippedBusy >= ticksSucceeded) {
    return `${pipelineLabel}管线近一分钟频繁跳过 tick，可能存在长耗时任务压住节奏`;
  }
  if (ticksRun > 0 && ticksSucceeded === ticksRun && jobsClaimed === 0 && failureCount === 0) {
    return `${pipelineLabel}管线近一分钟健康空闲：ticker 正常，没有领到或处理业务任务`;
  }
  if (jobsClaimed > 0 || failureCount > 0) {
    return `${pipelineLabel}管线近一分钟有业务推进或失败计数，请对照业务计数字段查看`;
  }
  return `${pipelineLabel}管线近一分钟汇总已解析`;
}

function buildGenericSummary(
  log: JsonObject,
  title: string,
  pipeline: string | undefined,
): string {
  const pipelineLabel = pipeline
    ? (PIPELINE_LABELS[pipeline] ?? pipeline)
    : undefined;
  const uid = asNumber(log.uid);
  const parts = [title];
  if (pipelineLabel) {
    parts.push(`管线 ${pipelineLabel}`);
  }
  if (uid != null) {
    parts.push(`UID ${uid}`);
  }
  if (asString(log.errorCode)) {
    parts.push(`错误码 ${asString(log.errorCode)}`);
  }
  return parts.join(" · ");
}

function toRows(
  source: JsonObject,
  labels: Record<string, string>,
): WorkerLogFieldRow[] {
  return Object.entries(source)
    .filter(([key]) => key in labels || !isNoiseField(key))
    .map(([field, value]) => ({
      field,
      label: labels[field] ?? field,
      value: formatValue(value),
    }))
    .sort((left, right) => left.field.localeCompare(right.field));
}

function pick(source: JsonObject, keys: string[]): JsonObject {
  const next: JsonObject = {};
  for (const key of keys) {
    if (key in source) {
      next[key] = source[key];
    }
  }
  return next;
}

function isNoiseField(key: string) {
  return key === "v" || key === "name";
}

function formatValue(value: unknown): string {
  if (value == null) {
    return "—";
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value;
    }
    return value;
  }
  if (typeof value === "number") {
    if (value > 1_000_000_000_000 && value < 10_000_000_000_000) {
      try {
        return `${value}（${new Date(value).toISOString()}）`;
      } catch {
        return String(value);
      }
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumPositiveCounts(log: JsonObject, fields: readonly string[]) {
  return fields.reduce((total, field) => {
    const value = asNumber(log[field]);
    return value != null && value > 0 ? total + value : total;
  }, 0);
}
