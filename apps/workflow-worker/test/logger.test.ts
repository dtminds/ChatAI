import { describe, expect, it, vi } from "vitest";
import { createWorkflowWorkerLogger } from "../src/logger.js";

describe("workflow worker logger", () => {
  it("writes readable levels and timestamps", () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    vi.spyOn(Date, "now").mockReturnValue(1790063240071);

    try {
      const logger = createWorkflowWorkerLogger();
      logger.info("worker ready");
      logger.warn("worker delayed");

      const records = lines
        .flatMap((chunk) => chunk.split("\n"))
        .filter((line) => line.trim().startsWith("{"))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ level: "INFO", msg: "worker ready", time: "2026-09-22T15:47:20.071+08:00" }),
        expect.objectContaining({ level: "WARN", msg: "worker delayed", time: "2026-09-22T15:47:20.071+08:00" }),
      ]));
    } finally {
      vi.restoreAllMocks();
    }
  });
});
