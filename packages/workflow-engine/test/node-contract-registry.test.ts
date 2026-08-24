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

  it("projects AI Collect follow-up-specific execution data", () => {
    expect(projectWorkflowNodeExecutionConfig({
      data: projectableDraftData["ai-collect"],
      kind: "ai-collect",
    })).toEqual({
      fields: projectableDraftData["ai-collect"].fields,
      maxFollowUpCount: 3,
      openingMessage: "请提供订单号",
      timeout: { duration: 24, unit: "hour" },
    });

    expect(projectWorkflowNodeExecutionConfig({
      data: {
        ...projectableDraftData["ai-collect"],
        inputSelector: ["node", "message-query", "messages"],
        maxFollowUpCount: 0,
      },
      kind: "ai-collect",
    })).toEqual({
      fields: projectableDraftData["ai-collect"].fields,
      inputSelector: ["node", "message-query", "messages"],
      maxFollowUpCount: 0,
      openingMessage: "请提供订单号",
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
  "ai-collect": {
    fields: [{ id: "field-order", instruction: "提取完整订单号", name: "订单号", type: "text" }],
    inputSelector: undefined,
    maxFollowUpCount: 3,
    openingMessage: " 请提供订单号 ",
    timeout: { duration: 24, unit: "hour" },
  },
  "ai-intent": {
    advancedEnabled: false,
    inputSelector: ["node", "message-query", "messages"],
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
  "customer-update": {
    fields: [{
      field: { id: 101, key: "remark", title: "客户备注", type: 1 },
      id: "field-1",
      value: { kind: "literal", value: "重点客户" },
    }],
  },
  end: {},
  handoff: {
    customerMessage: [],
    operatorMessage: [{ type: "text", value: "需要人工处理" }],
  },
  llm: {
    inputs: [],
    modelId: "model-1",
    reasoningEffort: "medium",
    modelLabel: "Model snapshot",
    output: {
      field: { description: "", id: "output-1", name: "output", type: "string" },
      format: "text",
    },
    systemPrompt: [{ type: "text", value: "Summarize" }],
    userPrompt: [],
  },
  message: {
    attachments: [],
    content: [{ type: "text", value: "hello" }],
    contentMode: "custom",
  },
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
  tag: { operation: "add", tagIds: [101, 102] },
  "tag-query": { matchMode: "all", tagIds: [101, 102] },
  wait: { duration: 1, mode: "duration", unit: "day" },
  "wait-event": {
    event: { type: "message.received" },
    timeout: { duration: 24, unit: "hour" },
  },
} satisfies Partial<Record<WorkflowNodeKind, Record<string, unknown>>>;

const placeholderKinds = [
  "agent",
  "coupon",
  "order-query",
] as const satisfies readonly WorkflowNodeKind[];
