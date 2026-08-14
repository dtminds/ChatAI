import {
  DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
  DEFAULT_WORKFLOW_PUSH_ACCOUNT_STRATEGY,
  extractWorkflowNodeDraftConfig,
  getWorkflowNodeContract,
  isWorkflowBranchConfigComplete,
  isWorkflowNodeDraftConfig,
  isWorkflowNodeExecutionConfig,
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
    const entryMode = draftConfig.entryMode ?? "event";
    const triggers = entryMode === "audience-import" ? [] : draftConfig.triggers;
    return cloneJsonRecord(resolvedWorkflowType === "chatai_sop"
      ? {
          entryMode,
          entryPolicy: normalizeWorkflowEntryPolicy(draftConfig.entryPolicy),
          messageSendingWindow:
            draftConfig.messageSendingWindow ?? DEFAULT_WORKFLOW_MESSAGE_SENDING_WINDOW,
          pushAccountStrategy:
            draftConfig.pushAccountStrategy ?? DEFAULT_WORKFLOW_PUSH_ACCOUNT_STRATEGY,
          seatIds: draftConfig.seatIds,
          triggers,
        }
      : {
          entryMode,
          entryPolicy: normalizeWorkflowEntryPolicy(draftConfig.entryPolicy),
          triggers,
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

export function getWorkflowNodeDraftConfigError(
  kind: WorkflowNodeKind,
  config: unknown,
) {
  return isWorkflowNodeDraftConfig(kind, config)
    ? null
    : getWorkflowNodeInvalidConfigMessage(kind);
}

export function getWorkflowNodeExecutionConfigError(
  kind: WorkflowNodeKind,
  config: unknown,
) {
  const valid = kind === "branch"
    ? isWorkflowBranchConfigComplete(config)
    : isWorkflowNodeExecutionConfig(kind, config);
  return valid ? null : getWorkflowNodeInvalidConfigMessage(kind);
}

function getWorkflowNodeInvalidConfigMessage(kind: WorkflowNodeKind) {
  switch (kind) {
    case "ai-intent":
      return "AI Intent node requires an input and complete unique intents";
    case "start":
      return "Start node requires accounts, a valid entry mode, and complete entry settings";
    case "llm":
      return "LLM node requires a model, complete inputs, prompts, and outputs";
    case "wait":
      return "Wait node requires a valid duration or fixed-time configuration";
    case "wait-event":
      return "Wait Event node requires a supported event and timeout";
    case "branch":
      return "Branch node requires complete ordered paths and conditions";
    default:
      return `Node configuration does not match its registered schema: ${kind}`;
  }
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
