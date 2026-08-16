import { describe, expect, it } from "vitest";
import {
  isWorkflowNodeExecutionConfig,
  workflowNodeContractRegistry,
  type WorkflowNodeKind,
} from "@chatai/contracts";
import {
  projectWorkflowNodeExecutionConfig,
  WorkflowNodeProjectionError,
} from "../src/node-contract-registry.js";
import { WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS } from "../src/runtime-support.js";

describe("workflow node projection registry", () => {
  it("derives runtime support from runtime-ready contracts", () => {
    const runtimeReadyKinds = Object.entries(workflowNodeContractRegistry)
      .filter(([, contract]) => contract.maturity === "runtime-ready")
      .map(([kind]) => kind)
      .sort();

    expect([...WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS].sort()).toEqual(runtimeReadyKinds);
  });

  it("projects every non-placeholder kind into its registered execution schema", () => {
    for (const [kind, data] of Object.entries(projectableDraftData) as Array<
      [WorkflowNodeKind, Record<string, unknown>]
    >) {
      const config = projectWorkflowNodeExecutionConfig({
        data,
        kind,
        workflowType: "chatai_sop",
      });

      expect(isWorkflowNodeExecutionConfig(kind, config), kind).toBe(true);
      expect(config).not.toHaveProperty("title");
      expect(config).not.toHaveProperty("status");
    }
  });

  it("projects ChatAI delivery defaults into the Start execution config", () => {
    expect(projectWorkflowNodeExecutionConfig({
      data: projectableDraftData.start,
      kind: "start",
      workflowType: "chatai_sop",
    })).toEqual({
      entryMode: "event",
      entryPolicy: { mode: "never" },
      messageSendingWindow: { endTime: "20:00", startTime: "09:00" },
      pushAccountStrategy: "earliest-added",
      seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
    });
  });

  it("fails closed for placeholder kinds", () => {
    for (const kind of placeholderKinds) {
      expect(() => projectWorkflowNodeExecutionConfig({ data: {}, kind }))
        .toThrowError(WorkflowNodeProjectionError);
    }
  });
});

const projectableDraftData = {
  "ai-intent": {
    advancedEnabled: false,
    inputSelector: ["node", "message-query", "textContent"],
    intents: [{ description: "接受邀请", id: "intent-1" }],
    prompt: "",
  },
  branch: {
    branchPaths: [
      {
        conditions: [{
          id: "condition-1",
          operator: "equals",
          selector: ["subject", "id"],
          value: "customer-1",
          valueType: "string",
        }],
        id: "matched",
        label: "如果",
        logic: "all",
      },
      { conditions: [], id: "fallback", isDefault: true, label: "否则", logic: "all" },
    ],
  },
  end: {},
  handoff: { customerMessage: [], operatorMessage: [] },
  llm: {
    inputs: [],
    modelId: "model-1",
    modelLabel: "Model snapshot",
    output: {
      field: { description: "", id: "output-1", name: "output", type: "string" },
      format: "text",
    },
    systemPrompt: [{ type: "text", value: "Summarize" }],
    userPrompt: [],
  },
  message: { attachments: [], content: [], contentMode: "custom" },
  "message-query": {
    limit: 10,
    take: "latest",
    timeRange: {
      end: ["current-node-lifecycle", "enteredAt"],
      mode: "dynamic",
      start: ["trigger", "occurredAt"],
    },
  },
  start: {
    entryPolicy: { mode: "never" },
    seatIds: [101],
    triggers: [{ sourceIds: [], type: "contact.friend_added" }],
  },
  wait: { duration: 1, mode: "duration", unit: "day" },
  "wait-event": {
    event: { type: "message.received" },
    timeout: { duration: 24, unit: "hour" },
  },
} satisfies Partial<Record<WorkflowNodeKind, Record<string, unknown>>>;

const placeholderKinds = [
  "agent",
  "ai-collect",
  "coupon",
  "customer-update",
  "order-query",
  "tag",
  "tag-query",
] as const satisfies readonly WorkflowNodeKind[];
