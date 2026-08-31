import { describe, expect, it } from "vitest";
import {
  compileWorkflowDraft,
  normalizeWorkflowDraft,
  WorkflowCompilationError,
} from "../src/index.js";

describe("compileWorkflowDraft", () => {
  it("normalizes a deep clone without mutating the draft", () => {
    const draft = createDraft();
    const original = structuredClone(draft);

    const normalized = normalizeWorkflowDraft(draft);

    expect(normalized).not.toBe(draft);
    expect(normalized.nodes[0]).not.toBe(draft.nodes[0]);
    expect(draft).toEqual(original);
  });

  it("validates and strips canvas-only node data", () => {
    const spec = compileWorkflowDraft({
      draft: createDraft(),
      revision: 3,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec).toMatchObject({
      entryNodeId: "start",
      revision: 3,
      terminalNodeId: "end",
      workflowId: "42",
    });
    expect(spec.nodes.find((node) => node.id === "wait")).toEqual({
      config: { duration: 2, mode: "duration", unit: "day" },
      id: "wait",
      kind: "wait",
      nodeSchemaVersion: 1,
    });
    expect(spec.nodes.find((node) => node.id === "start")?.config).toEqual({
      entryMode: "event",
      entryPolicy: { mode: "never" },
      messageSendingWindow: { endTime: "20:00", startTime: "09:00" },
      seatIds: [101],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
    });
    expect(spec.schemaVersion).toBe(3);
    expect(spec.edges[0]).toMatchObject({ sourceOutletId: "default" });
  });

  it("compiles direct push without entry events", () => {
    const draft = createDraft();
    Object.assign(draft.nodes.find((item) => item.id === "start")!.data, {
      entryMode: "direct-push",
      triggers: [],
    });

    const spec = compileWorkflowDraft({
      draft,
      revision: 3,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find((node) => node.id === "start")?.config).toEqual(expect.objectContaining({
      entryMode: "direct-push",
      triggers: [],
    }));
  });

  it("compiles fixed-time wait configuration without duration fields", () => {
    const draft = createDraft();
    const waitNode = draft.nodes.find((node) => node.id === "wait")!;
    waitNode.data = {
      ...waitNode.data,
      dayOffset: 2,
      mode: "fixed-time",
      time: "20:00",
    };
    delete waitNode.data.duration;
    delete waitNode.data.unit;

    const spec = compileWorkflowDraft({
      draft,
      revision: 3,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find((node) => node.id === "wait")?.config).toEqual({
      dayOffset: 2,
      mode: "fixed-time",
      time: "20:00",
    });
  });

  it("compiles the local Message Query execution contract", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("wait", "message-query", {
      limit: 10,
      take: "latest",
      timeRange: {
        end: ["current-node-lifecycle", "enteredAt"],
        mode: "dynamic",
        start: ["trigger", "occurredAt"],
      },
    }));

    const spec = compileWorkflowDraft({
      draft,
      revision: 3,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find(node => node.kind === "message-query")?.config)
      .toMatchObject({ limit: 10, take: "latest" });
  });

  it("rejects incomplete or unavailable Message Query time ranges", () => {
    const invalidFixedRange = createDraft();
    invalidFixedRange.nodes.splice(1, 1, node("wait", "message-query", {
      limit: 10,
      take: "latest",
      timeRange: {
        endAt: "2026-08-15T09:00",
        mode: "fixed",
        startAt: "2026-08-15T10:00",
      },
    }));
    expectCompilationIssue(invalidFixedRange, {
      code: "invalid-node-config",
      message: "Message Query node requires a valid time range",
      nodeId: "wait",
    });

    const reversedDynamicRange = createDraft();
    reversedDynamicRange.nodes.splice(1, 1, node("wait", "message-query", {
      limit: 10,
      take: "latest",
      timeRange: {
        end: ["trigger", "occurredAt"],
        mode: "dynamic",
        start: ["current-node-lifecycle", "enteredAt"],
      },
    }));
    expectCompilationIssue(reversedDynamicRange, {
      code: "invalid-node-config",
      message: "Message Query node requires a valid time range",
      nodeId: "wait",
    });

    const unavailableLifecycle = createDraft();
    unavailableLifecycle.nodes.splice(1, 1, node("wait", "message-query", {
      limit: 10,
      take: "latest",
      timeRange: {
        end: ["current-node-lifecycle", "enteredAt"],
        mode: "dynamic",
        start: ["node-lifecycle", "end", "enteredAt"],
      },
    }));
    expectCompilationIssue(unavailableLifecycle, {
      code: "invalid-node-config",
      message: "Message Query node references unavailable time data",
      nodeId: "wait",
    });

    const reversedLifecycleRange = {
      edges: [
        { id: "start-first", source: "start", target: "first" },
        { id: "first-second", source: "first", target: "second" },
        { id: "second-query", source: "second", target: "query" },
        { id: "query-end", source: "query", target: "end" },
      ],
      nodes: [
        node("start", "start", startConfig()),
        node("first", "wait", { duration: 1, mode: "duration", unit: "day" }),
        node("second", "wait", { duration: 1, mode: "duration", unit: "day" }),
        node("query", "message-query", {
          limit: 10,
          take: "latest",
          timeRange: {
            end: ["node-lifecycle", "first", "exitedAt"],
            mode: "dynamic",
            start: ["node-lifecycle", "second", "enteredAt"],
          },
        }),
        node("end", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    expectCompilationIssue(reversedLifecycleRange, {
      code: "invalid-node-config",
      message: "Message Query node time range is causally reversed",
      nodeId: "query",
    });
  });

  it("freezes Wait Event configuration and both runtime outlets", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("wait-event", "wait-event", {
      delay: { duration: 30, unit: "second" },
      event: { type: "message.received" },
      timeout: { duration: 15, unit: "minute" },
    }));
    draft.edges.splice(0, draft.edges.length,
      { id: "start-wait-event", source: "start", target: "wait-event" },
      {
        id: "wait-event-triggered-end",
        source: "wait-event",
        sourceHandle: "triggered",
        target: "end",
      },
      {
        id: "wait-event-timeout-end",
        source: "wait-event",
        sourceHandle: "timeout",
        target: "end",
      },
    );

    const spec = compileWorkflowDraft({
      draft,
      revision: 3,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find((item) => item.id === "wait-event")).toEqual({
      config: {
        delay: { duration: 30, unit: "second" },
        event: {
          type: "message.received",
        },
        timeout: { duration: 15, unit: "minute" },
      },
      id: "wait-event",
      kind: "wait-event",
      nodeSchemaVersion: 1,
    });
    expect(spec.edges.filter(edge => edge.source === "wait-event").map(edge => edge.sourceOutletId))
      .toEqual(["triggered", "timeout"]);
  });

  it("freezes complete ordered Branch paths without adding a capability", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("branch", "branch", {
      branchPaths: [
        {
          conditions: [{
            id: "condition-1",
            operator: "equals",
            selector: ["subject", "customFields", "42"],
            value: "vip-1",
            valueType: "string",
          }],
          id: "vip",
          label: "如果",
          logic: "all",
        },
        { conditions: [], id: "default", isDefault: true, label: "否则", logic: "all" },
      ],
    }));
    draft.edges = [
      { id: "start-branch", source: "start", target: "branch" },
      { id: "branch-vip", source: "branch", sourceHandle: "vip", target: "end" },
      { id: "branch-default", source: "branch", sourceHandle: "default", target: "end" },
    ];

    const spec = compileWorkflowDraft({
      customFields: [{ id: 42, key: "level", options: [], sort: 1, title: "会员等级", type: 1 }],
      draft,
      revision: 4,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find((item) => item.id === "branch")).toMatchObject({
      config: expect.objectContaining({ branchPaths: expect.any(Array) }),
      kind: "branch",
    });
    expect(spec.edges.map((edge) => edge.sourceOutletId)).toEqual(["default", "vip", "default"]);

    expect(() => compileWorkflowDraft({
      customFields: [{ id: 42, key: "score", options: [], sort: 1, title: "客户评分", type: 11 }],
      draft,
      revision: 5,
      workflowId: "42",
      workflowType: "chatai_sop",
    })).toThrowError(WorkflowCompilationError);
  });

  it("freezes Ratio Split configuration and every stable group outlet", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("ratio-split", "ratio-split", {
      groups: [
        { basisPoints: 3_333, id: "ratio-a", label: "实验组" },
        { basisPoints: 3_333, id: "ratio-b", label: "对照组" },
        { basisPoints: 3_334, id: "ratio-c", label: "观察组" },
      ],
    }));
    draft.edges = [
      { id: "start-split", source: "start", target: "ratio-split" },
      { id: "split-a", source: "ratio-split", sourceHandle: "ratio-a", target: "end" },
      { id: "split-b", source: "ratio-split", sourceHandle: "ratio-b", target: "end" },
      { id: "split-c", source: "ratio-split", sourceHandle: "ratio-c", target: "end" },
    ];

    const spec = compileWorkflowDraft({
      draft,
      revision: 4,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find(item => item.id === "ratio-split")).toEqual({
      config: {
        groups: [
          { basisPoints: 3_333, id: "ratio-a", label: "实验组" },
          { basisPoints: 3_333, id: "ratio-b", label: "对照组" },
          { basisPoints: 3_334, id: "ratio-c", label: "观察组" },
        ],
      },
      id: "ratio-split",
      kind: "ratio-split",
      nodeSchemaVersion: 1,
    });
    expect(spec.edges.map(edge => edge.sourceOutletId)).toEqual([
      "default",
      "ratio-a",
      "ratio-b",
      "ratio-c",
    ]);
  });

  it("rejects Ratio Split when any configured group outlet is not connected", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("ratio-split", "ratio-split", {
      groups: [
        { basisPoints: 4_000, id: "ratio-a", label: "A 组" },
        { basisPoints: 3_000, id: "ratio-b", label: "B 组" },
        { basisPoints: 3_000, id: "ratio-c", label: "C 组" },
      ],
    }));
    draft.edges = [
      { id: "start-split", source: "start", target: "ratio-split" },
      { id: "split-a", source: "ratio-split", sourceHandle: "ratio-a", target: "end" },
      { id: "split-b", source: "ratio-split", sourceHandle: "ratio-b", target: "end" },
    ];

    expectCompilationIssue(draft, {
      code: "source-outlet-unconnected",
      message: "Source outlet is not connected: ratio-c",
      nodeId: "ratio-split",
    });
  });

  it("compiles both AI Collect outcomes for runtime execution", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("collect", "ai-collect", {
      fields: [{ id: "field-order", instruction: "提取完整订单号", name: "订单号", type: "text" }],
      maxFollowUpCount: 3,
      openingMessage: "",
      timeout: { duration: 24, unit: "hour" },
    }));
    draft.edges = [
      { id: "start-collect", source: "start", target: "collect" },
      { id: "collect-completed", source: "collect", sourceHandle: "completed", target: "end" },
      { id: "collect-incomplete", source: "collect", sourceHandle: "incomplete", target: "end" },
    ];

    expect(compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    })).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: "collect", kind: "ai-collect" }),
      ]),
    });
  });

  it("compiles Audience Filter with a single default outlet", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("filter", "audience-filter", {
      groups: [{ id: 301, name: "高价值客户" }],
      matchMode: "any",
    }));
    draft.edges = [
      { id: "start-filter", source: "start", target: "filter" },
      { id: "filter-end", source: "filter", target: "end" },
    ];

    expect(compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    }).nodes.find((item) => item.id === "filter")).toEqual({
      config: {
        groups: [{ id: 301, name: "高价值客户" }],
        matchMode: "any",
      },
      id: "filter",
      kind: "audience-filter",
      nodeSchemaVersion: 1,
    });

    draft.nodes.splice(1, 1, node("filter", "audience-filter", {
      groups: [],
      matchMode: "any",
    }));
    expectCompilationIssues(draft, ["invalid-node-config"]);
  });

  it("compiles legacy rolling entry windows with the current maximum", () => {
    const draft = createDraft();
    Object.assign(draft.nodes.find(node => node.id === "start")!.data, {
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 365,
        windowUnit: "day",
      },
    });

    const spec = compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find(node => node.id === "start")?.config.entryPolicy).toEqual({
      maxEntries: 2,
      mode: "rolling_window",
      windowSize: 90,
      windowUnit: "day",
    });
  });

  it("rejects unreachable nodes, cycles, and missing branch outlets", () => {
    const draft = createDraft();
    draft.nodes.splice(2, 0, node("orphan", "message"));
    draft.edges.splice(1, 0, {
      id: "cycle",
      source: "wait",
      target: "start",
    });

    expect(() => compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    }))
      .toThrowError(WorkflowCompilationError);

    try {
      compileWorkflowDraft({
        draft,
        revision: 1,
        workflowId: "42",
        workflowType: "chatai_sop",
      });
    } catch (error) {
      expect((error as WorkflowCompilationError).issues.map((issue) => issue.code))
        .toEqual(expect.arrayContaining(["cycle", "unreachable-node"]));
    }
  });

  it("propagates the longest depth through merged paths", () => {
    const longPath = Array.from({ length: 17 }, (_, index) => `long-${index + 1}`);
    const draft = {
      edges: [
        { id: "start-branch", source: "start", target: "branch" },
        { id: "branch-short-merge", source: "branch", sourceHandle: "short", target: "merge" },
        { id: "branch-long-first", source: "branch", sourceHandle: "long", target: longPath[0] },
        ...longPath.slice(0, -1).map((source, index) => ({
          id: `${source}-${longPath[index + 1]}`,
          source,
          target: longPath[index + 1],
        })),
        { id: "long-merge", source: longPath.at(-1)!, target: "merge" },
        { id: "merge-end", source: "merge", target: "end" },
      ],
      nodes: [
        node("start", "start", startConfig()),
        node("branch", "branch", {
          branchPaths: [
            { id: "short", isDefault: true },
            { id: "long" },
          ],
        }),
        ...longPath.map((id) => node(id, "message")),
        node("merge", "message"),
        node("end", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(() => compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    }))
      .toThrowError(WorkflowCompilationError);
  });

  it("reports specific diagnostics for incomplete or invalid node configurations", () => {
    const incompleteStart = createDraft();
    Object.assign(incompleteStart.nodes.find((item) => item.id === "start")!.data, {
      seatIds: [],
      triggers: [],
    });

    expectCompilationIssue(incompleteStart, {
      code: "invalid-node-config",
      message: "Start node requires accounts, a valid entry mode, and complete entry settings",
      nodeId: "start",
    });

    const invalidWait = createDraft();
    invalidWait.nodes.find((item) => item.id === "wait")!.data.duration = -1;

    expectCompilationIssue(invalidWait, {
      code: "invalid-node-config",
      message: "Wait node requires a valid duration or fixed-time configuration",
      nodeId: "wait",
    });

    const invalidWaitEvent = createDraft();
    invalidWaitEvent.nodes.splice(1, 1, node("wait-event", "wait-event", {
      delay: { duration: 30, unit: "second" },
      event: { type: "message.received" },
      timeout: { duration: 0, unit: "minute" },
    }));
    invalidWaitEvent.edges = [
      { id: "start-wait-event", source: "start", target: "wait-event" },
      {
        id: "wait-event-triggered-end",
        source: "wait-event",
        sourceHandle: "triggered",
        target: "end",
      },
      {
        id: "wait-event-timeout-end",
        source: "wait-event",
        sourceHandle: "timeout",
        target: "end",
      },
    ];

    expectCompilationIssue(invalidWaitEvent, {
      code: "invalid-node-config",
      message: "Wait Event node requires a supported event, delay, and timeout",
      nodeId: "wait-event",
    });

    const invalidBranch = {
      edges: [
        { id: "start-branch", source: "start", target: "branch" },
        { id: "branch-first-end", source: "branch", sourceHandle: "first", target: "end" },
        { id: "branch-fallback-end", source: "branch", sourceHandle: "fallback", target: "end" },
      ],
      nodes: [
        node("start", "start", startConfig()),
        node("branch", "branch", {
          branchPaths: [
            {
              conditions: [{ id: "condition-1", operator: "equals" }],
              id: "first",
              label: "If",
              logic: "all",
            },
            {
              conditions: [],
              id: "fallback",
              isDefault: true,
              label: "Otherwise",
              logic: "all",
            },
          ],
        }),
        node("end", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expectCompilationIssue(invalidBranch, {
      code: "invalid-node-config",
      message: "Branch node requires complete ordered paths and conditions",
      nodeId: "branch",
    });
  });

  it("rejects node kinds that Phase 3 cannot execute", () => {
    const draft = createDraft();
    draft.nodes.splice(2, 0, node("coupon", "coupon"));
    draft.edges.splice(1, 1,
      { id: "wait-coupon", source: "wait", target: "coupon" },
      { id: "coupon-end", source: "coupon", target: "end" },
    );

    expectCompilationIssues(draft, ["unsupported-runtime-node"]);
  });
});

function expectCompilationIssues(
  draft: Parameters<typeof compileWorkflowDraft>[0]["draft"],
  expectedCodes: string[],
) {
  try {
    compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType: "chatai_sop",
    });
    throw new Error("Expected workflow compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowCompilationError);
    expect((error as WorkflowCompilationError).issues.map((issue) => issue.code))
      .toEqual(expect.arrayContaining(expectedCodes));
  }
}

function expectCompilationIssue(
  draft: Parameters<typeof compileWorkflowDraft>[0]["draft"],
  expectedIssue: WorkflowCompilationError["issues"][number],
  workflowType: Parameters<typeof compileWorkflowDraft>[0]["workflowType"] = "chatai_sop",
) {
  try {
    compileWorkflowDraft({
      draft,
      revision: 1,
      workflowId: "42",
      workflowType,
    });
    throw new Error("Expected workflow compilation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowCompilationError);
    expect((error as WorkflowCompilationError).issues).toContainEqual(expectedIssue);
  }
}

function createDraft() {
  return {
    edges: [
      { id: "start-wait", source: "start", target: "wait" },
      { id: "wait-end", source: "wait", target: "end" },
    ],
    nodes: [
      node("start", "start", startConfig()),
      node("wait", "wait", { duration: 2, mode: "duration", unit: "day" }),
      node("end", "end"),
    ],
    viewport: { x: 100, y: 50, zoom: 1 },
  };
}

function createInferenceReferenceDraft(input: {
  inputSelector: string[];
  targetKind: "ai-intent" | "llm";
  useTimeoutOutlet?: boolean;
  valueType?: { kind: "datetime" | "number" | "string" };
}) {
  const inferenceNode = input.targetKind === "llm"
    ? node("inference", "llm", {
        inputs: [{
          id: "input-message",
          name: "message",
          value: {
            kind: "variable",
            selector: input.inputSelector,
            valueType: input.valueType ?? { kind: "string" },
          },
        }],
        modelId: "model-1",
        reasoningEffort: "medium",
        output: {
          field: { description: "", id: "output-id", name: "output", type: "string" },
          format: "text",
        },
        systemPrompt: [{ type: "text", value: "Summarize" }],
        userPrompt: [{ selector: ["input", "input-message"], type: "variable" }],
      })
    : node("inference", "ai-intent", {
        advancedEnabled: false,
        inputSelector: input.inputSelector,
        intents: [{ description: "Refund", id: "refund-id" }],
        prompt: "",
      });
  const selectedOutlet = input.useTimeoutOutlet ? "timeout" : "triggered";
  const otherOutlet = input.useTimeoutOutlet ? "triggered" : "timeout";
  return {
    edges: [
      { id: "start-wait-event", source: "start", target: "wait-event" },
      {
        id: `wait-event-${selectedOutlet}-inference`,
        source: "wait-event",
        sourceHandle: selectedOutlet,
        target: "inference",
      },
      {
        id: `wait-event-${otherOutlet}-end`,
        source: "wait-event",
        sourceHandle: otherOutlet,
        target: "end",
      },
      ...(input.targetKind === "llm"
        ? [{ id: "inference-end", source: "inference", target: "end" }]
        : [
            {
              id: "inference-refund-end",
              source: "inference",
              sourceHandle: "intent:refund-id",
              target: "end",
            },
            {
              id: "inference-fallback-end",
              source: "inference",
              sourceHandle: "fallback",
              target: "end",
            },
          ]),
    ],
    nodes: [
      node("start", "start", startConfig()),
      node("wait-event", "wait-event", {
        delay: { duration: 30, unit: "second" },
        event: { type: "message.received" },
        timeout: { duration: 15, unit: "minute" },
      }),
      inferenceNode,
      node("end", "end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function startConfig() {
  return {
    entryPolicy: { mode: "never" },
    panelState: { section: "triggers" },
    seatIds: [101],
    triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
  };
}

function node(id: string, kind: string, config: Record<string, unknown> = {}) {
  return {
    data: {
      ...config,
      kind,
      label: kind,
      metric: "canvas metric",
      schemaVersion: 1,
      status: "ready",
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
    type: "workflowNode",
  };
}
