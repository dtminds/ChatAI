export type AppLogger = {
  debug(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
};

export const noopLogger: AppLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};
