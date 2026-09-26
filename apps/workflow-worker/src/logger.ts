import pino from "pino";

export function createWorkflowWorkerLogger(level = "info") {
  return pino({
    base: { service: "workflow-worker" },
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    level,
    timestamp: () => {
      const time = Date.now();
      const formatted = new Date(time + 8 * 60 * 60 * 1000).toISOString().replace("Z", "+08:00");
      return `,"time":${JSON.stringify(formatted)}`;
    },
    redact: {
      censor: "[REDACTED]",
      paths: [
        "token",
        "*.token",
        "password",
        "*.password",
        "payload",
        "*.payload",
        "messageText",
        "*.messageText",
      ],
    },
  });
}
