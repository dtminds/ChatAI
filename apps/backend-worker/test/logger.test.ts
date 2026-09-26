import { describe, expect, it, vi } from "vitest";
import { createBackendWorkerLogger } from "../src/logger.js";

describe("backend worker logger", () => {
  it("writes readable levels and millisecond timestamps", () => {
    const lines: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    try {
      const logger = createBackendWorkerLogger("info");
      logger.info("worker ready");
      logger.warn("worker delayed");

      const records = lines
        .flatMap((chunk) => chunk.split("\n"))
        .filter((line) => line.trim().startsWith("{"))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ level: "INFO", msg: "worker ready", time: expect.any(Number) }),
        expect.objectContaining({ level: "WARN", msg: "worker delayed", time: expect.any(Number) }),
      ]));
    } finally {
      write.mockRestore();
    }
  });
});
