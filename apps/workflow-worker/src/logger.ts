import pino from "pino";

export function createWorkflowWorkerLogger(level = "info") {
  return pino({
    base: { service: "workflow-worker" },
    level,
    redact: {
      censor: "[REDACTED]",
      paths: [
        "token",
        "*.token",
        "password",
        "*.password",
        "triggerPayload",
        "*.triggerPayload",
        "messageText",
        "*.messageText",
      ],
    },
  });
}
