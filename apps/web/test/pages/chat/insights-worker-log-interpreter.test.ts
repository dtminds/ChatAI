import { describe, expect, it } from "vitest";
import {
  extractWorkerLogObjects,
  interpretWorkerLog,
} from "@/pages/chat/insights/insights-worker-log-interpreter";

const sampleSummary = {
  component: "insights-worker",
  durationMaxMs: 2007,
  durationTotalMs: 7060,
  eventCode: "insights_worker.pipeline_summary",
  failed: 0,
  jobsClaimed: 0,
  lastSuccessAt: "2026-07-23T12:21:10.304Z",
  level: 30,
  modelRequests: 0,
  msg: "会话洞察 Worker 管线运行汇总",
  pipeline: "analysis",
  succeeded: 0,
  ticksFailed: 0,
  ticksRun: 20,
  ticksSkippedBusy: 0,
  ticksSucceeded: 20,
  windowSeconds: 60,
};

describe("insights worker log interpreter", () => {
  it("extracts a single JSON object and line-delimited objects", () => {
    expect(extractWorkerLogObjects(JSON.stringify(sampleSummary))).toHaveLength(1);
    expect(extractWorkerLogObjects([
      JSON.stringify(sampleSummary),
      JSON.stringify({ ...sampleSummary, pipeline: "discovery" }),
    ].join("\n"))).toHaveLength(2);
  });

  it("interprets pipeline summary into health and business sections", () => {
    const [result] = interpretWorkerLog(JSON.stringify(sampleSummary));

    expect(result).toMatchObject({
      eventCode: "insights_worker.pipeline_summary",
      pipeline: "analysis",
      title: "管线运行汇总",
    });
    expect(result.summary).toContain("健康空闲");
    expect(result.sections.map((section) => section.title)).toEqual([
      "窗口与健康",
      "业务计数",
      "日志元信息",
    ]);
    expect(result.sections[0]?.rows).toContainEqual({
      field: "ticksSucceeded",
      label: "成功完成的 tick 次数",
      value: "20",
    });
    expect(result.sections[1]?.rows).toContainEqual({
      field: "jobsClaimed",
      label: "领取的分析任务数",
      value: "0",
    });
  });

  it("flags failed ticks in the summary verdict", () => {
    const [result] = interpretWorkerLog(JSON.stringify({
      ...sampleSummary,
      ticksFailed: 2,
      ticksSucceeded: 18,
    }));

    expect(result.summary).toContain("tick 失败");
  });

  it("does not let zero failed hide later failure counters", () => {
    const [result] = interpretWorkerLog(JSON.stringify({
      ...sampleSummary,
      failed: 0,
      syncFailed: 1,
    }));

    expect(result.summary).toContain("业务推进或失败计数");
    expect(result.summary).not.toContain("健康空闲");
  });

  it("treats model failure counters as failed pipeline activity", () => {
    const [result] = interpretWorkerLog(JSON.stringify({
      ...sampleSummary,
      failed: 0,
      modelFailures: 1,
      modelTimeouts: 1,
    }));

    expect(result.summary).toContain("业务推进或失败计数");
    expect(result.summary).not.toContain("健康空闲");
  });
});
