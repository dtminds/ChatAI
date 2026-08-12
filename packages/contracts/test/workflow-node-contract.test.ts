import { describe, expect, expectTypeOf, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
  extractWorkflowNodeDraftConfig,
  getWorkflowGuaranteedVariableCatalog,
  getWorkflowContextVariableValueType,
  getWorkflowNodeOutputContracts,
  getUnknownWorkflowNodeDraftDataKeys,
  getWorkflowNodeContract,
  isWorkflowNodeDraftConfig,
  isWorkflowNodeExecutionConfig,
  isWorkflowOutputValueTypeEqual,
  WorkflowNodeKindSchema,
  workflowNodeContractRegistry,
  type WorkflowNodeKind,
} from "../src/index.js";
import {
  WorkflowInferenceMessageListRequestSchema,
  WorkflowInferenceMessageListResultSchema,
  WorkflowInferenceTemplateRequestSchema,
  WorkflowInferenceTemplateResultSchema,
} from "../src/index.js";

const draftConfigs = {
  agent: {},
  "ai-collect": {},
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
  it("keeps message-list and template inference contracts distinct", () => {
    expect(Value.Check(WorkflowInferenceMessageListRequestSchema, {
      kind: "message-list",
      messageList: [{ content: "Summarize", role: "system" }],
      modelId: "model-1",
      responseFormat: { type: "text" },
    })).toBe(true);
    expect(Value.Check(WorkflowInferenceTemplateRequestSchema, {
      kind: "template",
      templateKey: "workflow.intent.classify.v1",
      variables: { input: "hello" },
    })).toBe(true);
    expect(Value.Check(WorkflowInferenceMessageListResultSchema, {
      content: "summary",
      type: "text",
    })).toBe(true);
    expect(Value.Check(WorkflowInferenceTemplateResultSchema, {
      matchedCode: "I10",
      reason: "matched",
    })).toBe(true);
    expect(Value.Check(WorkflowInferenceTemplateResultSchema, {
      matchedCode: "I11",
      reason: "invalid",
    })).toBe(false);
  });

  it("registers every production kind with an explicit maturity", () => {
    const entries = Object.entries(workflowNodeContractRegistry);

    expect(entries).toHaveLength(17);
    for (const [kind, contract] of entries) {
      expect(Value.Check(WorkflowNodeKindSchema, kind)).toBe(true);
      expect(["action", "composite", "core", "inference", "query"])
        .toContain(contract.executionClass);
      expect(["placeholder", "draft-ready", "runtime-ready"]).toContain(contract.maturity);
      expect(contract.currentDraftSchemaVersion).toBeGreaterThan(0);
    }

    expect(entries.filter(([, contract]) => contract.maturity === "runtime-ready").map(([kind]) => kind))
      .toEqual(["ai-intent", "branch", "end", "llm", "start", "wait", "wait-event"]);
    expect(entries.filter(([, contract]) => contract.maturity === "draft-ready").map(([kind]) => kind))
      .toEqual(["handoff", "message", "message-query"]);
    expect(entries.filter(([, contract]) => contract.maturity === "placeholder").map(([kind]) => kind))
      .toEqual(["agent", "ai-collect", "coupon", "customer-update", "order-query", "tag", "tag-query"]);
  });

  it("assigns every node kind one stable execution class", () => {
    expectTypeOf(getWorkflowNodeContract("message").executionClass).toEqualTypeOf<"action">();
    expectTypeOf(getWorkflowNodeContract("message-query").executionClass).toEqualTypeOf<"query">();
    expectTypeOf(getWorkflowNodeContract("llm").executionClass).toEqualTypeOf<"inference">();
    expectTypeOf(getWorkflowNodeContract("ai-collect").executionClass).toEqualTypeOf<"composite">();

    expect(Object.fromEntries(Object.entries(workflowNodeContractRegistry).map(([kind, contract]) => [
      kind,
      contract.executionClass,
    ]))).toEqual({
      agent: "action",
      "ai-collect": "composite",
      "ai-intent": "inference",
      branch: "core",
      coupon: "action",
      "customer-update": "action",
      end: "core",
      handoff: "action",
      llm: "inference",
      message: "action",
      "message-query": "query",
      "order-query": "query",
      start: "core",
      tag: "action",
      "tag-query": "query",
      wait: "core",
      "wait-event": "core",
    });
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

  it("derives optional and union draft fields from their schemas", () => {
    expect(getWorkflowNodeContract("llm").draftConfigKeys).toEqual([
      "inputs",
      "modelId",
      "modelLabel",
      "modelName",
      "output",
      "systemPrompt",
      "userPrompt",
    ]);
    expect(getWorkflowNodeContract("start").draftConfigKeys).toEqual([
      "entryPolicy",
      "seatIds",
      "triggers",
      "workUserIds",
    ]);
    expect(getWorkflowNodeContract("wait").draftConfigKeys).toEqual([
      "dayOffset",
      "duration",
      "mode",
      "time",
      "unit",
    ]);
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

  it("requires semantically complete LLM and AI Intent execution configs", () => {
    const llm = draftConfigs.llm;
    const intent = {
      fallback: { id: "fallback" },
      inputSelector: ["node", "message-query", "textContent"],
      intents: [{ description: "接受邀请", id: "intent-1", modelCode: "I1" }],
    };

    expect(isWorkflowNodeExecutionConfig("llm", llm)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("llm", { ...llm, modelId: "" })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      inputs: [
        { id: "input-1", name: "message", value: { kind: "literal", value: "hello" } },
        { id: "input-2", name: "message", value: { kind: "literal", value: "world" } },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      systemPrompt: [{ selector: ["input", "missing"], type: "variable" }],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      inputs: [{
        id: "input-1",
        name: "message",
        value: {
          kind: "variable",
          selector: ["unknown", "value"],
          valueType: { kind: "string" },
        },
      }],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      inputs: [
        { id: "input-1", name: "message", value: { kind: "literal", value: "hello" } },
      ],
      systemPrompt: [
        { type: "text", value: "x".repeat(9_992) },
        { selector: ["input", "input-1"], type: "variable" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      output: {
        field: { ...llm.output.field, id: " " },
        format: "text",
      },
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-intent", intent)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("ai-intent", {
      ...intent,
      inputSelector: undefined,
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-intent", {
      ...intent,
      inputSelector: ["unknown", "value"],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-intent", {
      ...intent,
      intents: [
        { description: "接受邀请", id: "intent-1", modelCode: "I1" },
        { description: "接受邀请", id: "intent-2", modelCode: "I2" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-intent", {
      ...intent,
      intents: [{ description: "接受邀请", id: " ", modelCode: "I1" }],
    })).toBe(false);
  });

  it("describes public inference and message collection outputs centrally", () => {
    expect(getWorkflowNodeOutputContracts("llm", draftConfigs.llm)).toEqual([
      {
        key: "output-1",
        usages: ["variable", "message-content"],
        valueType: { kind: "string" },
      },
    ]);
    expect(getWorkflowNodeOutputContracts("ai-intent", {})).toEqual([
      {
        key: "matchedIntentDescription",
        usages: ["variable"],
        valueType: { kind: "string" },
      },
      {
        key: "reason",
        usages: ["variable"],
        valueType: { kind: "string" },
      },
    ]);
    expect(getWorkflowNodeOutputContracts("message", {})).toEqual([{
      key: "sentAt",
      usages: ["time-reference", "variable"],
      valueType: { kind: "datetime" },
    }]);
    expect(getWorkflowNodeOutputContracts("wait-event", {}))
      .toContainEqual(expect.objectContaining({
        availableOnSourceOutlets: ["triggered"],
        key: "messageIds",
        usages: ["intent-input"],
      }));
    expect(isWorkflowOutputValueTypeEqual(
      { itemType: "bigint", kind: "array", semantic: "message" },
      { itemType: "bigint", kind: "array", semantic: "message" },
    )).toBe(true);
    expect(isWorkflowOutputValueTypeEqual(
      { itemType: "bigint", kind: "array", semantic: "message" },
      { itemType: "string", kind: "array", semantic: "message" },
    )).toBe(false);
    expect(getWorkflowContextVariableValueType(
      ["trigger", "projection", "messageId"],
    )).toEqual({ kind: "number" });
    expect(getWorkflowContextVariableValueType(
      ["trigger", "projection", "workUserId"],
      "wecom_sop",
    )).toEqual({ kind: "number" });
    expect(getWorkflowContextVariableValueType(
      ["trigger", "projection", "seatId"],
      "wecom_sop",
    )).toBeNull();
    expect(getWorkflowGuaranteedVariableCatalog(
      "chatai_sop",
      ["contact.tag_added", "message.received"],
    )).toEqual([
      "subject.id",
      "trigger.eventType",
      "trigger.occurredAt",
      "trigger.projection.workUserId",
      "trigger.projection.seatId",
      "trigger.projection.thirdExternalUserId",
    ]);
    expect(getWorkflowContextVariableValueType(
      ["trigger", "projection", "messageId"],
      "chatai_sop",
      ["contact.tag_added", "message.received"],
    )).toBeNull();
    expect(getWorkflowContextVariableValueType(
      ["trigger", "projection", "unknown"],
    )).toBeNull();
  });
});
