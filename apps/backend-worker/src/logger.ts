import pino from "pino";

export function createBackendWorkerLogger(level: string) {
  return pino({
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    level,
  });
}
