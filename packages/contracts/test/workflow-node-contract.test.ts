import { describe, expect, expectTypeOf, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
  extractWorkflowNodeDraftConfig,
  getWorkflowGuaranteedVariableCatalog,
  getWorkflowContextVariableValueType,
  getWorkflowNodeOutputContracts,
  getUnknownWorkflowNodeDraftDataKeys,
  getWorkflowNodeContract,
  isWorkflowDynamicTimeRangeProvablyInvalid,
  isWorkflowNodeDraftConfig,
  isWorkflowNodeExecutionConfig,
  isWorkflowOutputValueTypeEqual,
  WorkflowCustomerUpdateCommandSchema,
  WorkflowCustomerUpdateResultSchema,
  WorkflowHandoffCommandSchema,
  WorkflowHandoffResultSchema,
  WorkflowNodeKindSchema,
  WorkflowMessageCommandSchema,
  WorkflowMessageQueryCommandSchema,
  WorkflowMessageQueryResultSchema,
  WorkflowMessageResultSchema,
  WorkflowTagCommandSchema,
  WorkflowTagQueryCommandSchema,
  WorkflowTagQueryResultSchema,
  WorkflowTagResultSchema,
  WORKFLOW_WAIT_EVENT_DELAY_MAX_BY_UNIT,
  workflowNodeContractRegistry,
  type WorkflowNodeKind,
} from "../src/index.js";
import {
  WorkflowAiIntentCompletionValueSchema,
  WorkflowInferenceMessageListRequestSchema,
  WorkflowInferenceMessageListResultSchema,
  WorkflowInferenceRequestSchema,
} from "../src/index.js";

const draftConfigs = {
  agent: {},
  "ai-collect": {
    fields: [{ id: "field-order", instruction: "提取完整订单号", name: "订单号", type: "text" }],
    inputSelector: undefined,
    maxFollowUpCount: 3,
    openingMessage: "",
    timeout: { duration: 24, unit: "hour" },
  },
  "ai-intent": {
    advancedEnabled: false,
    inputSelector: ["node", "message-query", "messages"],
    intents: [{ description: "接受邀请", id: "intent-1" }],
    prompt: "",
  },
  "audience-filter": { groups: [], matchMode: "any" },
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
  "ratio-split": {
    groups: [
      { basisPoints: 5_000, id: "ratio-a", label: "A 组" },
      { basisPoints: 5_000, id: "ratio-b", label: "B 组" },
    ],
  },
  coupon: {},
  "customer-update": {
    fields: [{ id: "field-1", value: { kind: "literal", value: "" } }],
  },
  end: {},
  handoff: { customerMessage: [], operatorMessage: [] },
  llm: {
    inputs: [],
    modelId: "model-1",
    reasoningEffort: "medium",
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
      end: ["current-node-lifecycle", "enteredAt"],
      mode: "dynamic",
      start: ["trigger", "occurredAt"],
    },
  },
  "order-bind": {},
  "order-query": {},
  "order-conversion": {},
  start: {
    entryPolicy: { mode: "never" },
    seatIds: [101],
    triggers: [{ sourceIds: [], type: "contact.friend_added" }],
  },
  tag: { operation: "add", tagIds: [] },
  "tag-query": { matchMode: "any", tagIds: [] },
  wait: { duration: 1, mode: "duration", unit: "day" },
  "wait-event": {
    delay: { duration: 30, unit: "second" },
    event: { type: "message.received" },
    timeout: { duration: 24, unit: "hour" },
  },
} as const satisfies Record<WorkflowNodeKind, Record<string, unknown>>;

describe("workflow node contracts", () => {
  it("accepts catalog and direct-endpoint Chat targets while rejecting the removed template shape", () => {
    expect(Value.Check(WorkflowInferenceMessageListRequestSchema, {
      kind: "message-list",
      messageList: [{ content: [{ text: "Summarize", type: "text" }], role: "system" }],
      modelTarget: { kind: "catalog-model", modelId: "model-1" },
      reasoningEffort: "medium",
      responseFormat: { type: "text" },
    })).toBe(true);
    expect(Value.Check(WorkflowInferenceMessageListRequestSchema, {
      kind: "message-list",
      messageList: [{ content: [{ text: "Classify", type: "text" }], role: "system" }],
      modelTarget: { endpointId: "ep-intent", kind: "endpoint" },
      reasoningEffort: "low",
      responseFormat: {
        fields: [
          { description: "Intent code", name: "matchedCode", type: "string" },
          { description: "Reason", name: "reason", type: "string" },
        ],
        type: "json",
      },
    })).toBe(true);
    expect(Value.Check(WorkflowInferenceRequestSchema, {
      kind: "template",
      templateKey: "workflow.intent.classify.v1",
      variables: {
        additionalRules: "",
        input: "hello",
        intents: "[]",
        unexpected: "value",
      },
    })).toBe(false);
    expect(Value.Check(WorkflowInferenceMessageListResultSchema, {
      content: "summary",
      type: "text",
    })).toBe(true);
    expect(Value.Check(WorkflowAiIntentCompletionValueSchema, {
      matchedCode: "I10",
      reason: "matched",
    })).toBe(true);
    expect(Value.Check(WorkflowAiIntentCompletionValueSchema, {
      matchedCode: "I11",
      reason: "invalid",
    })).toBe(false);
  });

  it("registers every production kind with an explicit maturity", () => {
    const entries = Object.entries(workflowNodeContractRegistry);

    expect(entries).toHaveLength(21);
    for (const [kind, contract] of entries) {
      expect(Value.Check(WorkflowNodeKindSchema, kind)).toBe(true);
      expect(["action", "composite", "core", "inference", "query"])
        .toContain(contract.executionClass);
      expect(["placeholder", "draft-ready", "runtime-ready"]).toContain(contract.maturity);
      expect(typeof contract.recordSourceOutlet).toBe("boolean");
      expect(contract.currentDraftSchemaVersion).toBeGreaterThan(0);
    }

    expect(entries.filter(([, contract]) => contract.recordSourceOutlet).map(([kind]) => kind))
      .toEqual(["ratio-split"]);

    expect(entries.filter(([, contract]) => contract.maturity === "runtime-ready").map(([kind]) => kind))
      .toEqual(["ai-collect", "ai-intent", "audience-filter", "branch", "ratio-split", "customer-update", "end", "handoff", "llm", "message", "message-query", "order-bind", "order-conversion", "start", "tag", "tag-query", "wait", "wait-event"]);
    expect(entries.filter(([, contract]) => contract.maturity === "draft-ready").map(([kind]) => kind))
      .toEqual([]);
    expect(entries.filter(([, contract]) => contract.maturity === "placeholder").map(([kind]) => kind))
      .toEqual(["agent", "coupon", "order-query"]);
  });

  it("enforces Wait Event post-trigger delay boundaries for every supported unit", () => {
    for (const [unit, maximum] of Object.entries(WORKFLOW_WAIT_EVENT_DELAY_MAX_BY_UNIT)) {
      const minimum = unit === "second" ? 0 : 1;
      const config = (duration: number) => ({
        delay: { duration, unit },
        event: { type: "message.received" },
        timeout: { duration: 24, unit: "hour" },
      });

      expect(isWorkflowNodeDraftConfig("wait-event", config(minimum))).toBe(true);
      expect(isWorkflowNodeDraftConfig("wait-event", config(maximum))).toBe(true);
      expect(isWorkflowNodeDraftConfig("wait-event", config(minimum - 1))).toBe(false);
      expect(isWorkflowNodeDraftConfig("wait-event", config(maximum + 1))).toBe(false);
    }
  });

  it("keeps Ratio Split drafts editable while enforcing the published allocation contract", () => {
    expect(getWorkflowNodeContract("ratio-split")).toMatchObject({
      currentDraftSchemaVersion: 1,
      executionClass: "core",
      identityInputs: [],
      maturity: "runtime-ready",
    });
    expect(isWorkflowNodeDraftConfig("ratio-split", {
      groups: [
        { basisPoints: 5_000, id: "ratio-a", label: "" },
        { basisPoints: 5_000, id: "ratio-b", label: "B 组" },
      ],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("ratio-split", {
      groups: [
        { basisPoints: 5_000, id: "ratio-a", label: "" },
        { basisPoints: 5_000, id: "ratio-b", label: "B 组" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ratio-split", {
      groups: [
        { basisPoints: 0, id: "ratio-a", label: "A 组" },
        { basisPoints: 10_000, id: "ratio-b", label: "B 组" },
      ],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("ratio-split", {
      groups: [
        { basisPoints: 5_000, id: "ratio-a", label: "一二三四五六七八九十" },
        { basisPoints: 5_000, id: "ratio-b", label: "一二三四五六七八九十" },
      ],
    })).toBe(true);
    expect(isWorkflowNodeDraftConfig("ratio-split", {
      groups: [
        { basisPoints: 5_000, id: "ratio-a", label: "一二三四五六七八九十一" },
        { basisPoints: 5_000, id: "ratio-b", label: "B 组" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ratio-split", {
      groups: [
        { basisPoints: 2_000, id: "ratio-a", label: "A 组" },
        { basisPoints: 3_000, id: "ratio-b", label: "B 组" },
        { basisPoints: 5_000, id: "ratio-c", label: "C 组" },
      ],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("ratio-split", {
      groups: [
        { basisPoints: 5_000, id: "ratio-a", label: "A 组" },
        { basisPoints: 4_999, id: "ratio-b", label: "B 组" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ratio-split", {
      groups: [
        { basisPoints: 5_000, id: "duplicate", label: "A 组" },
        { basisPoints: 5_000, id: "duplicate", label: "B 组" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ratio-split", {
      groups: Array.from({ length: 6 }, (_, index) => ({
        basisPoints: index === 5 ? 0 : 2_000,
        id: `ratio-${index}`,
        label: `${index + 1} 组`,
      })),
    })).toBe(false);
  });

  it("validates the Message Query capability command and node output", () => {
    expect(Value.Check(WorkflowMessageQueryCommandSchema, {
      limit: 10,
      rangeEnd: 1_786_742_400_000,
      rangeStart: 1_786_738_800_000,
      seatId: 101,
      take: "latest",
    })).toBe(true);
    expect(Value.Check(WorkflowMessageQueryResultSchema, {
      messageCount: 1,
      messages: [{
        id: 9001,
        parts: [{ text: "价格是多少", type: "text" }],
        role: "customer",
      }],
      rangeEnd: "2026-08-15T02:00:00.000Z",
      rangeStart: "2026-08-15T01:00:00.000Z",
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("message-query", {
      limit: 10,
      take: "latest",
      timeRange: {
        endAt: "2026-08-15T09:00",
        mode: "fixed",
        startAt: "2026-08-15T10:00",
      },
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("message-query", {
      limit: 10,
      take: "latest",
      timeRange: {
        endAt: "2026-08-15T10:00",
        mode: "fixed",
        startAt: "2026-08-15T10:00",
      },
    })).toBe(true);
    expect(isWorkflowDynamicTimeRangeProvablyInvalid(
      ["current-node-lifecycle", "enteredAt"],
      ["trigger", "occurredAt"],
    )).toBe(true);
    expect(isWorkflowDynamicTimeRangeProvablyInvalid(
      ["trigger", "occurredAt"],
      ["current-node-lifecycle", "enteredAt"],
    )).toBe(false);
  });

  it("validates complete Message execution configs and capability contracts", () => {
    const attachment = {
      content: { fileUrl: "https://cdn.example.com/image.png" },
      materialCollectionId: "201",
      msgInfoId: "301",
      type: "image" as const,
    };
    expect(isWorkflowNodeExecutionConfig("message", {
      attachments: [],
      content: [{ type: "text", value: "hello" }],
      contentMode: "custom",
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("message", {
      attachments: [attachment],
      content: [],
      contentMode: "custom",
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("message", {
      attachments: [],
      content: [],
      contentMode: "custom",
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("message", {
      attachments: [],
      contentMode: "node-output",
    })).toBe(false);
    expect(Value.Check(WorkflowMessageCommandSchema, {
      attachments: [attachment],
      content: "hello",
      recipient: { thirdExternalUserId: "customer-1" },
      seatId: 101,
      source: "workflow",
    })).toBe(true);
    expect(Value.Check(WorkflowMessageCommandSchema, {
      attachments: [{
        content: attachment.content,
        type: attachment.type,
      }],
      content: "hello",
      recipient: { thirdExternalUserId: "customer-1" },
      seatId: 101,
      source: "workflow",
    })).toBe(false);
    expect(Value.Check(WorkflowMessageResultSchema, {})).toBe(true);
    expect(Value.Check(WorkflowMessageResultSchema, { unexpected: true })).toBe(false);
  });

  it("validates complete Handoff execution configs and capability contracts", () => {
    expect(isWorkflowNodeExecutionConfig("handoff", {
      customerMessage: [],
      operatorMessage: [{ type: "text", value: "需要人工处理" }],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("handoff", {
      customerMessage: [],
      operatorMessage: [],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("handoff", {
      customerMessage: [],
      operatorMessage: [{ type: "text", value: "x".repeat(101) }],
    })).toBe(false);
    expect(Value.Check(WorkflowHandoffCommandSchema, {
      customerMessage: "请稍等",
      operatorMessage: "需要人工处理",
      recipient: { thirdExternalUserId: "customer-1" },
      seatId: 101,
      source: "workflow",
    })).toBe(true);
    expect(Value.Check(WorkflowHandoffCommandSchema, {
      customerMessage: "请稍等",
      operatorMessage: "",
      recipient: { thirdExternalUserId: "customer-1" },
      seatId: 101,
      source: "workflow",
    })).toBe(false);
    expect(Value.Check(WorkflowHandoffCommandSchema, {
      customerMessage: "请稍等",
      operatorMessage: "需要人工处理",
      recipient: { thirdExternalUserId: "customer-1" },
      source: "workflow",
      unexpected: true,
    })).toBe(false);
    expect(Value.Check(WorkflowHandoffResultSchema, {})).toBe(true);
    expect(Value.Check(WorkflowHandoffResultSchema, { unexpected: true })).toBe(false);
  });

  it("keeps the Tag Java result empty and its command bounded", () => {
    expect(Value.Check(WorkflowTagCommandSchema, {
      operation: "add",
      source: "workflow",
      tagIds: [101, 102],
    })).toBe(true);
    expect(Value.Check(WorkflowTagCommandSchema, {
      operation: "replace",
      source: "workflow",
      tagIds: [101],
    })).toBe(false);
    expect(Value.Check(WorkflowTagCommandSchema, {
      operation: "add",
      source: "workflow",
      tagIds: [101, 101],
    })).toBe(false);
    expect(Value.Check(WorkflowTagCommandSchema, {
      operation: "add",
      source: "workflow",
      tagIds: Array.from({ length: 6 }, (_, index) => index + 1),
    })).toBe(false);
    expect(Value.Check(WorkflowTagResultSchema, {})).toBe(true);
    expect(Value.Check(WorkflowTagResultSchema, { updated: true })).toBe(false);
  });

  it("marks Tag Query runtime-ready and bounds its query contract", () => {
    expect(getWorkflowNodeContract("tag-query")).toMatchObject({
      currentDraftSchemaVersion: 1,
      maturity: "runtime-ready",
    });
    expect(isWorkflowNodeDraftConfig("tag-query", { matchMode: "any", tagIds: [] }))
      .toBe(true);
    expect(isWorkflowNodeExecutionConfig("tag-query", { matchMode: "any", tagIds: [] }))
      .toBe(false);
    expect(isWorkflowNodeExecutionConfig("tag-query", {
      matchMode: "all",
      tagIds: [101, 102],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("tag-query", {
      matchMode: "none",
      tagIds: [101, 102],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("tag-query", {
      matchMode: "any",
      tagIds: [101, 101],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("tag-query", {
      matchMode: "any",
      tagIds: Array.from({ length: 6 }, (_, index) => index + 1),
    })).toBe(false);
    expect(Value.Check(WorkflowTagQueryCommandSchema, {
      tagIds: [101, 102],
    })).toBe(true);
    expect(Value.Check(WorkflowTagQueryCommandSchema, {
      matchMode: "all",
      tagIds: [101, 102],
    })).toBe(false);
    expect(Value.Check(WorkflowTagQueryResultSchema, {
      matchedTags: [{ id: 101, name: "重点客户" }],
    })).toBe(true);
    expect(Value.Check(WorkflowTagQueryResultSchema, {
      matchedTags: [{ id: 101, name: "重点客户", selected: true }],
    })).toBe(false);
    expect(getWorkflowNodeOutputContracts("tag-query", {
      matchMode: "any",
      tagIds: [101],
    })).toEqual([
      { key: "matched", usages: ["variable"], valueType: { kind: "boolean" } },
      {
        key: "matchedTagNames",
        usages: ["variable", "message-content"],
        valueType: { kind: "string" },
      },
      { key: "matchedTagCount", usages: ["variable"], valueType: { kind: "number" } },
    ]);
  });

  it("keeps incomplete Order Bind drafts editable and requires an order number selector to execute", () => {
    expect(getWorkflowNodeContract("order-bind")).toMatchObject({
      currentDraftSchemaVersion: 1,
      executionClass: "action",
      identityInputs: ["externalUserId"],
      maturity: "runtime-ready",
    });
    expect(isWorkflowNodeDraftConfig("order-bind", {})).toBe(true);
    expect(isWorkflowNodeDraftConfig("order-bind", {
      orderNumberSelector: ["node", "llm", "orderNo"],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-bind", {})).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-bind", {
      orderNumberSelector: ["node", "llm", "orderNo"],
    })).toBe(true);
    expect(getWorkflowNodeOutputContracts("order-bind", {})).toEqual([
      { key: "result", usages: ["variable"], valueType: { kind: "boolean" } },
    ]);
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
      "audience-filter": "query",
      branch: "core",
      coupon: "action",
      "customer-update": "action",
      end: "core",
      handoff: "action",
      llm: "inference",
      message: "action",
      "message-query": "query",
      "order-bind": "action",
      "order-query": "query",
      "order-conversion": "action",
      "ratio-split": "core",
      start: "core",
      tag: "action",
      "tag-query": "query",
      wait: "core",
      "wait-event": "core",
    });
  });

  it("declares only the direct identity inputs owned by each node contract", () => {
    expect(Object.fromEntries(Object.entries(workflowNodeContractRegistry).map(([kind, contract]) => [
      kind,
      contract.identityInputs,
    ]))).toEqual({
      agent: [],
      "ai-collect": ["thirdExternalUserId"],
      "ai-intent": [],
      "audience-filter": ["externalUserId"],
      branch: [],
      coupon: ["externalUserId"],
      "customer-update": ["externalUserId"],
      end: [],
      handoff: ["thirdExternalUserId"],
      llm: [],
      message: ["thirdExternalUserId"],
      "message-query": ["thirdExternalUserId"],
      "order-bind": ["externalUserId"],
      "order-query": ["externalUserId"],
      "order-conversion": ["mallUserId"],
      "ratio-split": [],
      start: [],
      tag: ["externalUserId"],
      "tag-query": ["externalUserId"],
      wait: [],
      "wait-event": [],
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
      "reasoningEffort",
      "systemPrompt",
      "userPrompt",
    ]);
    expect(getWorkflowNodeContract("start").draftConfigKeys).toEqual([
      "entryMode",
      "entryPolicy",
      "messageSendingWindow",
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

  it("keeps incomplete Audience Filter drafts editable while requiring groups to publish", () => {
    expect(getWorkflowNodeContract("audience-filter")).toMatchObject({
      currentDraftSchemaVersion: 1,
      executionClass: "query",
      identityInputs: ["externalUserId"],
      maturity: "runtime-ready",
      recordSourceOutlet: false,
    });
    expect(isWorkflowNodeDraftConfig("audience-filter", { groups: [], matchMode: "any" })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("audience-filter", { groups: [], matchMode: "any" })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("audience-filter", {
      groups: [{ id: 301, name: "高价值客户" }],
      matchMode: "any",
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("audience-filter", {
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 301, name: "重复" },
      ],
      matchMode: "all",
    })).toBe(false);
    expect(isWorkflowNodeDraftConfig("audience-filter", {
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 301, name: "重复" },
      ],
      matchMode: "any",
    })).toBe(false);
    expect(isWorkflowNodeDraftConfig("audience-filter", {
      groups: [{ id: 0, name: "高价值客户" }],
      matchMode: "any",
    })).toBe(false);
    expect(isWorkflowNodeDraftConfig("audience-filter", {
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 302, name: "沉默客户" },
        { id: 303, name: "活跃客户" },
        { id: 304, name: "超限" },
      ],
      matchMode: "all",
    })).toBe(false);
    expect(getWorkflowNodeOutputContracts("audience-filter", {
      groups: [{ id: 301, name: "高价值客户" }],
      matchMode: "any",
    })).toEqual([
      { key: "matched", usages: ["variable"], valueType: { kind: "boolean" } },
      {
        key: "matchedGroupNames",
        usages: ["variable", "message-content"],
        valueType: { kind: "string" },
      },
      { key: "matchedGroupCount", usages: ["variable"], valueType: { kind: "number" } },
    ]);
  });

  it("marks Tag runtime-ready while keeping incomplete drafts editable", () => {
    expect(getWorkflowNodeContract("tag")).toMatchObject({
      currentDraftSchemaVersion: 1,
      maturity: "runtime-ready",
    });
    expect(isWorkflowNodeDraftConfig("tag", { operation: "add", tagIds: [] })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("tag", { operation: "add", tagIds: [] })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("tag", { operation: "remove", tagIds: [1, 2] }))
      .toBe(true);
    expect(isWorkflowNodeExecutionConfig("tag", { operation: "add", tagIds: [1, 1] }))
      .toBe(false);
    expect(getWorkflowNodeOutputContracts("tag", { operation: "add", tagIds: [1] }))
      .toBeNull();
  });

  it("keeps incomplete Customer Update drafts editable and validates typed fields", () => {
    expect(getWorkflowNodeContract("customer-update")).toMatchObject({
      currentDraftSchemaVersion: 1,
      identityInputs: ["externalUserId"],
      maturity: "runtime-ready",
    });
    expect(isWorkflowNodeDraftConfig("customer-update", { fields: [] })).toBe(false);
    expect(isWorkflowNodeDraftConfig("customer-update", {
      fields: [{ id: "field-1", value: { kind: "literal", value: "" } }],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("customer-update", { fields: [] })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("customer-update", {
      fields: [
        { fieldId: 1, fieldType: 1, value: { kind: "literal", value: "重点客户" } },
        {
          fieldId: 2,
          fieldType: 4,
          value: {
            kind: "variable",
            selector: ["node", "llm", "date"],
            valueType: { kind: "string" },
          },
        },
        { fieldId: 3, fieldType: 11, value: { kind: "literal", value: "12.5" } },
      ],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("customer-update", {
      fields: [
        { fieldId: 1, fieldType: 4, value: { kind: "literal", value: "2026-02-30" } },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("customer-update", {
      fields: [
        { fieldId: 1, fieldType: 11, value: { kind: "variable", selector: ["subject", "id"], valueType: { kind: "string" } } },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("customer-update", {
      fields: [
        { fieldId: 1, fieldType: 1, value: { kind: "literal", value: "A" } },
        { fieldId: 1, fieldType: 6, value: { kind: "literal", value: "a@example.com" } },
      ],
    })).toBe(false);
    expect(getWorkflowNodeOutputContracts("customer-update", { fields: [] })).toBeNull();
  });

  it("keeps incomplete Order Conversion drafts editable and requires an order number selector to execute", () => {
    expect(getWorkflowNodeContract("order-conversion")).toMatchObject({
      currentDraftSchemaVersion: 1,
      executionClass: "action",
      identityInputs: ["mallUserId"],
      maturity: "runtime-ready",
    });
    expect(isWorkflowNodeDraftConfig("order-conversion", {})).toBe(true);
    expect(isWorkflowNodeDraftConfig("order-conversion", {
      orderNumberSelector: ["node", "llm", "orderNo"],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("order-conversion", {})).toBe(false);
    expect(isWorkflowNodeExecutionConfig("order-conversion", {
      orderNumberSelector: ["node", "llm", "orderNo"],
    })).toBe(true);
    expect(getWorkflowNodeOutputContracts("order-conversion", {})).toEqual([
      { key: "result", usages: ["variable"], valueType: { kind: "boolean" } },
    ]);
  });

  it("keeps the Customer Update Java command batched and bounded", () => {
    expect(Value.Check(WorkflowCustomerUpdateCommandSchema, {
      source: "workflow",
      updates: [
        { fieldId: 1, fieldType: 1, value: "重点客户" },
        { fieldId: 2, fieldType: 11, value: 12.5 },
      ],
    })).toBe(true);
    expect(Value.Check(WorkflowCustomerUpdateCommandSchema, {
      source: "workflow",
      updates: Array.from({ length: 11 }, (_, index) => ({
        fieldId: index + 1,
        fieldType: 1,
        value: String(index),
      })),
    })).toBe(false);
    expect(Value.Check(WorkflowCustomerUpdateResultSchema, {})).toBe(true);
    expect(Value.Check(WorkflowCustomerUpdateResultSchema, { updated: 2 })).toBe(false);
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

  it.each([
    { endTime: "09:00", startTime: "20:00" },
    { endTime: "09:00", startTime: "09:00" },
  ])("keeps an invalid message sending window draft-only: $startTime-$endTime", (
    messageSendingWindow,
  ) => {
    const config = {
      entryPolicy: { mode: "never" },
      messageSendingWindow,
      seatIds: [101],
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
    };

    expect(isWorkflowNodeDraftConfig("start", config)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("start", config)).toBe(false);
  });

  it("requires semantically complete LLM and AI Intent execution configs", () => {
    const llm = draftConfigs.llm;
    const intent = {
      fallback: { id: "fallback" },
      inputSelector: ["node", "message-query", "messages"],
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
    const messagesInput = {
      id: "input-messages",
      name: "messages",
      value: {
        kind: "variable" as const,
        selector: ["node", "message-query", "messages"],
        valueType: { kind: "object" as const, schemaRef: "workflow.messages.v1" },
      },
    };
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      inputs: [messagesInput],
      systemPrompt: [{ selector: ["input", "input-messages"], type: "variable" }],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      inputs: [messagesInput],
      userPrompt: [{ selector: ["input", "input-messages"], type: "variable" }],
    })).toBe(true);
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
      inputs: [{
        id: "input-1",
        name: "previousExit",
        value: {
          kind: "variable",
          selector: ["node-lifecycle", "wait-1", "exitedAt"],
          valueType: { kind: "datetime" },
        },
      }],
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("llm", {
      ...llm,
      inputs: [{
        id: "input-1",
        name: "currentEntry",
        value: {
          kind: "variable",
          selector: ["current-node-lifecycle", "enteredAt"],
          valueType: { kind: "datetime" },
        },
      }],
    })).toBe(true);
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

  it("keeps incomplete AI Collect drafts editable and enforces execution boundaries", () => {
    const followUpConfig = draftConfigs["ai-collect"];
    const maximumFields = Array.from({ length: 3 }, (_, index) => ({
      ...followUpConfig.fields[0],
      id: `field-${index + 1}`,
      name: `字段${index + 1}`,
    }));
    const noFollowUpConfig = {
      fields: followUpConfig.fields,
      inputSelector: ["node", "message-query", "messages"],
      maxFollowUpCount: 0,
      openingMessage: "请提供订单号",
    };

    expect(isWorkflowNodeDraftConfig("ai-collect", {
      ...followUpConfig,
      fields: [{ ...followUpConfig.fields[0], instruction: "", name: "" }],
    })).toBe(true);
    expect(isWorkflowNodeDraftConfig("ai-collect", {
      ...followUpConfig,
      mode: "agent-assisted",
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-collect", followUpConfig)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("ai-collect", {
      ...followUpConfig,
      fields: maximumFields,
    })).toBe(true);
    expect(isWorkflowNodeExecutionConfig("ai-collect", {
      ...followUpConfig,
      fields: [
        ...maximumFields,
        { ...followUpConfig.fields[0], id: "field-4", name: "字段4" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-collect", noFollowUpConfig)).toBe(true);
    expect(isWorkflowNodeExecutionConfig("ai-collect", {
      ...noFollowUpConfig,
      inputSelector: undefined,
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-collect", {
      ...followUpConfig,
      fields: [
        ...followUpConfig.fields,
        { ...followUpConfig.fields[0], id: "field-phone" },
      ],
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-collect", {
      ...followUpConfig,
      maxFollowUpCount: 11,
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-collect", {
      ...followUpConfig,
      timeout: { duration: 49, unit: "hour" },
    })).toBe(false);
    expect(isWorkflowNodeExecutionConfig("ai-collect", {
      ...followUpConfig,
      timeout: { duration: 1, unit: "day" },
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
    expect(getWorkflowNodeOutputContracts("ai-collect", {
      ...draftConfigs["ai-collect"],
      status: "ready",
      title: "资料收集",
    })).toEqual([
      {
        availableOnSourceOutlets: ["completed"],
        key: "field-order",
        usages: ["variable", "message-content"],
        valueType: { kind: "string" },
      },
    ]);
    expect(getWorkflowNodeOutputContracts("message", {})).toBeNull();
    expect(getWorkflowNodeOutputContracts("handoff", {})).toBeNull();
    expect(getWorkflowNodeOutputContracts("wait-event", {}))
      .toContainEqual(expect.objectContaining({
        availableOnSourceOutlets: ["triggered"],
        key: "message",
        usages: ["intent-input", "variable"],
        valueType: { kind: "object", schemaRef: "workflow.message.v1" },
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
    )).toBeNull();
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
      "trigger.occurredAt",
      "trigger.projection.workUserId",
      "trigger.projection.seatId",
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
