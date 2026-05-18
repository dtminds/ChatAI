export type AppLogger = {
  debug(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
};

export type RequestAwareLogger = AppLogger & {
  requestId?: string;
};

export const noopLogger: AppLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

export function withRequestId(
  logger: AppLogger,
  requestId: string,
): RequestAwareLogger {
  return {
    debug(payload, message) {
      logger.debug(payload, message);
    },
    error(payload, message) {
      logger.error(payload, message);
    },
    info(payload, message) {
      logger.info(payload, message);
    },
    requestId,
    warn(payload, message) {
      logger.warn(payload, message);
    },
  };
}

export function getLoggerRequestId(
  logger: AppLogger | RequestAwareLogger,
): string | undefined {
  if (!logger || typeof logger !== "object") {
    return undefined;
  }

  const requestId = (logger as { requestId?: unknown }).requestId;

  return typeof requestId === "string" && requestId.trim() ? requestId.trim() : undefined;
}
