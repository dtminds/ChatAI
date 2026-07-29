import { describe, expect, it } from "vitest";
import {
  canViewInsightsWorkerObservability,
  parseInsightsWorkerObserverSubjects,
  parseInsightsWorkerTraceUids,
} from "../../../src/modules/insights/insights-worker-observer-access";

describe("insights worker observer access", () => {
  it("matches the exact uid and subUserId pair", () => {
    const subjects = parseInsightsWorkerObserverSubjects(
      "9001:2001, 9002:operator-a",
    );

    expect(canViewInsightsWorkerObservability(subjects, {
      subUserId: "2001",
      uid: 9001,
    })).toBe(true);
    expect(canViewInsightsWorkerObservability(subjects, {
      subUserId: "operator-a",
      uid: 9001,
    })).toBe(false);
    expect(canViewInsightsWorkerObservability(subjects, {
      subUserId: "2001",
      uid: 9002,
    })).toBe(false);
  });

  it("defaults observer and trace lists to empty", () => {
    expect(parseInsightsWorkerObserverSubjects(undefined).size).toBe(0);
    expect(parseInsightsWorkerTraceUids("").size).toBe(0);
  });

  it("rejects malformed observer entries", () => {
    for (const value of [
      "0:2001",
      "+9001:2001",
      "1e3:2001",
      "9001:",
      "9001",
      "9001:2001:extra",
      "x:2001",
    ]) {
      expect(() => parseInsightsWorkerObserverSubjects(value)).toThrow(
        "INSIGHTS_WORKER_OBSERVER_SUBJECTS",
      );
    }
  });

  it("parses and validates trace uids", () => {
    expect(Array.from(parseInsightsWorkerTraceUids("9001,9002,9001"))).toEqual([
      9001,
      9002,
    ]);
    expect(() => parseInsightsWorkerTraceUids("9001,0")).toThrow(
      "INSIGHTS_WORKER_TRACE_UID_ALLOWLIST must be a comma-separated list of positive UID entries",
    );
    expect(() => parseInsightsWorkerTraceUids("1e3")).toThrow(
      "INSIGHTS_WORKER_TRACE_UID_ALLOWLIST",
    );
  });
});
