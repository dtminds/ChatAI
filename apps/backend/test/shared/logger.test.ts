import { describe, expect, it, vi } from "vitest";
import { getLoggerRequestId, withRequestId } from "../../src/shared/logger.js";

describe("withRequestId", () => {
  it("keeps request id on the wrapped logger without mutating the source logger", () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const firstLogger = withRequestId(logger, "req-001");
    const secondLogger = withRequestId(logger, "req-002");

    expect(getLoggerRequestId(firstLogger)).toBe("req-001");
    expect(getLoggerRequestId(secondLogger)).toBe("req-002");
    expect(getLoggerRequestId(logger)).toBeUndefined();

    firstLogger.info({ operation: "first" }, "first message");
    secondLogger.error({ operation: "second" }, "second message");

    expect(logger.info).toHaveBeenCalledWith({ operation: "first" }, "first message");
    expect(logger.error).toHaveBeenCalledWith({ operation: "second" }, "second message");
  });
});
