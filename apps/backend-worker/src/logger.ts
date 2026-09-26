import pino from "pino";

export function createBackendWorkerLogger(level: string) {
  return pino({
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    level,
    timestamp: () => {
      const time = Date.now();
      const formatted = new Date(time + 8 * 60 * 60 * 1000).toISOString().replace("Z", "+08:00");
      return `,"time":${JSON.stringify(formatted)}`;
    },
  });
}
