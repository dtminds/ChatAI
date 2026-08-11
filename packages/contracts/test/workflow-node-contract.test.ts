import { describe, expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
  extractWorkflowNodeDraftConfig,
  getUnknownWorkflowNodeDraftDataKeys,
  getWorkflowNodeContract,
  isWorkflowNodeDraftConfig,
  isWorkflowNodeExecutionConfig,
  WorkflowNodeKindSchema,
  workflowNodeContractRegistry,
  type WorkflowNodeKind,
} from "../src/index.js";

const draftConfigs = {
  agent: {},
  "ai-collect": {},
  "ai-intent": {
    advancedEnabled: false,
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
  coupon: {},
  "customer-update": {},
  end: {},
  handoff: { customerMessage: [], operatorMessage: [] },
  llm: {
    inputs: [],
    modelId: "model-1",
    output: {
      field: { description: "", id: "output-1", name: "output", type: "string" },
      format: "text",
    },
    systemPrompt: [{ type: "text", value: "Summarize the customer request" }],
    userPrompt: [],
  },
  message: { attachments: [], content: [], contentMode: "custom" },
  "message-query": {
    limit: 10,
    take: "latest",
    timeRange: {
      end: { field: "enteredAt", kind: "current-node-lifecycle" },
      mode: "dynamic",
      start: { field: "occurredAt", kind: "workflow-trigger" },
    },
  },
  "order-query": {},
  start: {
    entryPolicy: { mode: "never" },
    seatIds: [101],
    triggers: [{ type: "contact.friend_added" }],
  },
  tag: {},
  "tag-query": {},
  wait: { duration: 1, mode: "duration", unit: "day" },
  "wait-event": {
    event: { type: "message.received" },
    timeout: { duration: 24, unit: "hour" },
  },
} as const satisfies Record<WorkflowNodeKind, Record<string, unknown>>;

describe("workflow node contracts", () => {
  it("registers every production kind with an explicit maturity", () => {
    const entries = Object.entries(workflowNodeContractRegistry);

    expect(entries).toHaveLength(17);
    for (const [kind, contract] of entries) {
      expect(Value.Check(WorkflowNodeKindSchema, kind)).toBe(true);
      expect(["placeholder", "draft-ready", "runtime-ready"]).toContain(contract.maturity);
      expect(contract.currentDraftSchemaVersion).toBeGreaterThan(0);
    }

    expect(entries.filter(([, contract]) => contract.maturity === "runtime-ready").map(([kind]) => kind))
      .toEqual(["branch", "end", "start", "wait", "wait-event"]);
    expect(entries.filter(([, contract]) => contract.maturity === "draft-ready").map(([kind]) => kind))
      .toEqual(["ai-intent", "handoff", "llm", "message", "message-query"]);
    expect(entries.filter(([, contract]) => contract.maturity === "placeholder").map(([kind]) => kind))
      .toEqual(["agent", "ai-collect", "coupon", "customer-update", "order-query", "tag", "tag-query"]);
  });

  it("extracts only registered draft fields and validates every kind", () => {
    for (const kind of Object.keys(workflowNodeContractRegistry) as WorkflowNodeKind[]) {
      const contract = getWorkflowNodeContract(kind);
      const data = {
        ...draftConfigs[kind],
        kind,
        label: kind,
        metric: "",
        schemaVersion: contract.currentDraftSchemaVersion,
        status: "ready",
        title: kind,
      };
      const config = extractWorkflowNodeDraftConfig(kind, data);

      expect(config).toEqual(draftConfigs[kind]);
      expect(isWorkflowNodeDraftConfig(kind, config)).toBe(true);
      expect(getUnknownWorkflowNodeDraftDataKeys(kind, data)).toEqual([]);
    }
  });

  it("keeps placeholder execution absent and rejects undeclared draft fields", () => {
    expect(getWorkflowNodeContract("tag")).toMatchObject({
      executionConfigSchema: null,
      maturity: "placeholder",
    });
    expect(getUnknownWorkflowNodeDraftDataKeys("tag", {
      kind: "tag",
      label: "客户打标",
      metric: "",
      schemaVersion: 1,
      status: "ready",
      tagIds: [1],
      title: "客户打标",
    })).toEqual(["tagIds"]);
  });

  it("allows incomplete Start drafts without treating them as executable", () => {
    const emptyChatAiStart = {
      entryPolicy: { mode: "never" },
      seatIds: [],
      triggers: [],
    };
    const incompleteTagStart = {
      entryPolicy: { mode: "never" },
      seatIds: [101],
      triggers: [{ tagIds: [], type: "contact.tag_added" }],
    };

    expect(isWorkflowNodeDraftConfig("start", emptyChatAiStart)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("start", emptyChatAiStart)).toBe(false);
    expect(isWorkflowNodeDraftConfig("start", incompleteTagStart)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("start", incompleteTagStart)).toBe(false);
  });
});
