import {
  extractWorkflowNodeDraftConfig,
  getWorkflowNodeContract,
  normalizeWorkflowEntryPolicy,
  WORKFLOW_WAIT_EVENT_COLLECT_WINDOW_SECONDS,
  type WorkflowNodeKind,
  type WorkflowType,
} from "@chatai/contracts";

export class WorkflowNodeProjectionError extends Error {
  constructor(
    readonly nodeKind: WorkflowNodeKind,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowNodeProjectionError";
  }
}

export function projectWorkflowNodeExecutionConfig({
  data,
  kind,
  workflowType,
}: {
  data: Record<string, unknown>;
  kind: WorkflowNodeKind;
  workflowType?: WorkflowType;
}): Record<string, unknown> {
  const contract = getWorkflowNodeContract(kind);
  if (contract.maturity === "placeholder" || contract.executionConfigSchema === null) {
    throw new WorkflowNodeProjectionError(
      kind,
      `Placeholder node cannot be projected: ${kind}`,
    );
  }

  const draftConfig = extractWorkflowNodeDraftConfig(kind, data);

  if (kind === "start") {
    const resolvedWorkflowType = workflowType ?? ("seatIds" in draftConfig
      ? "chatai_sop"
      : "wecom_sop");
    return cloneJsonRecord(resolvedWorkflowType === "chatai_sop"
      ? {
          entryPolicy: normalizeWorkflowEntryPolicy(draftConfig.entryPolicy),
          seatIds: draftConfig.seatIds,
          triggers: draftConfig.triggers,
        }
      : {
          entryPolicy: normalizeWorkflowEntryPolicy(draftConfig.entryPolicy),
          triggers: draftConfig.triggers,
          workUserIds: draftConfig.workUserIds,
        });
  }

  if (kind === "wait") {
    return cloneJsonRecord(draftConfig.mode === "fixed-time"
      ? {
          dayOffset: draftConfig.dayOffset,
          mode: draftConfig.mode,
          time: draftConfig.time,
        }
      : {
          duration: draftConfig.duration,
          mode: draftConfig.mode,
          unit: draftConfig.unit,
        });
  }

  if (kind === "wait-event") {
    const event = isRecord(draftConfig.event) ? draftConfig.event : {};
    return cloneJsonRecord({
      event: {
        capabilityKey: "event.message.received",
        collectWindowSeconds: WORKFLOW_WAIT_EVENT_COLLECT_WINDOW_SECONDS,
        contractVersion: 1,
        type: event.type,
      },
      timeout: draftConfig.timeout,
    });
  }

  if (kind === "message") {
    return cloneJsonRecord(draftConfig.contentMode === "node-output"
      ? compactUndefined({
          attachments: draftConfig.attachments,
          contentMode: draftConfig.contentMode,
          outputSelector: draftConfig.outputSelector,
        })
      : {
          attachments: draftConfig.attachments,
          content: draftConfig.content,
          contentMode: "custom",
        });
  }

  if (kind === "handoff") {
    return cloneJsonRecord({
      customerMessage: draftConfig.customerMessage ?? [],
      operatorMessage: draftConfig.operatorMessage ?? [],
    });
  }

  if (kind === "llm") {
    return cloneJsonRecord({
      inputs: draftConfig.inputs,
      modelId: draftConfig.modelId,
      output: draftConfig.output,
      systemPrompt: draftConfig.systemPrompt,
      userPrompt: draftConfig.userPrompt,
    });
  }

  if (kind === "ai-intent") {
    const intents = Array.isArray(draftConfig.intents) ? draftConfig.intents : [];
    return cloneJsonRecord(compactUndefined({
      fallback: { id: "fallback" },
      inputSelector: draftConfig.inputSelector,
      intents: intents.map((intent, index) => ({
        ...(isRecord(intent) ? intent : {}),
        modelCode: `I${index + 1}`,
      })),
      prompt: draftConfig.advancedEnabled === true ? draftConfig.prompt : undefined,
    }));
  }

  return cloneJsonRecord(draftConfig);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneJsonValue(value) as Record<string, unknown>;
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) =>
      typeof item === "function" || item === undefined
        ? []
        : [[key, cloneJsonValue(item)]],
    ));
  }
  return value;
}

function compactUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
