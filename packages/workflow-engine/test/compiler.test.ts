import { describe, expect, it } from "vitest";
import { compileWorkflowDraft, WorkflowCompilationError } from "../src/index.js";

describe("compileWorkflowDraft", () => {
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
      requiredCapabilities: [],
    });
    expect(spec.nodes.find((node) => node.id === "start")?.config).toEqual({
      entryPolicy: { mode: "never" },
      seatIds: [101],
      triggers: [{ type: "contact.friend_added" }],
    });
    expect(spec.nodes.find((node) => node.id === "start")?.requiredCapabilities).toEqual([
      { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
    ]);
    expect(spec.requiredCapabilities).toEqual([
      { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
    ]);
    expect(spec.schemaVersion).toBe(2);
    expect(spec.edges[0]).toMatchObject({ sourceOutletId: "default" });
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

  it("freezes Wait Event capability and both runtime outlets", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("wait-event", "wait-event", {
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
        event: {
          capabilityKey: "event.message.received",
          collectWindowSeconds: 10,
          contractVersion: 1,
          type: "message.received",
        },
        timeout: { duration: 15, unit: "minute" },
      },
      id: "wait-event",
      kind: "wait-event",
      nodeSchemaVersion: 1,
      requiredCapabilities: [
        { capabilityKey: "event.message.received", contractVersion: 1 },
      ],
    });
    expect(spec.edges.filter(edge => edge.source === "wait-event").map(edge => edge.sourceOutletId))
      .toEqual(["triggered", "timeout"]);
    expect(spec.requiredCapabilities).toEqual([
      { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
      { capabilityKey: "event.message.received", contractVersion: 1 },
    ]);
  });

  it("freezes complete ordered Branch paths without adding a capability", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1, node("branch", "branch", {
      branchPaths: [
        {
          conditions: [{
            id: "condition-1",
            operator: "equals",
            selector: ["subject", "id"],
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
      draft,
      revision: 4,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find((item) => item.id === "branch")).toMatchObject({
      config: expect.objectContaining({ branchPaths: expect.any(Array) }),
      kind: "branch",
      requiredCapabilities: [],
    });
    expect(spec.edges.map((edge) => edge.sourceOutletId)).toEqual(["default", "vip", "default"]);
  });

  it("freezes LLM and AI Intent execution contracts with their deployment capabilities", () => {
    const draft = createDraft();
    draft.nodes.splice(1, 1,
      node("llm", "llm", {
        inputs: [],
        modelId: "model-1",
        modelLabel: "Model label",
        output: {
          field: { description: "", id: "output-id", name: "output", type: "string" },
          format: "text",
        },
        systemPrompt: [{ type: "text", value: "Summarize" }],
        userPrompt: [],
      }),
      node("intent", "ai-intent", {
        advancedEnabled: false,
        inputSelector: ["node", "llm", "output-id"],
        intents: [{ description: "Refund", id: "refund-id" }],
        prompt: "unused",
      }),
    );
    draft.edges = [
      { id: "start-llm", source: "start", target: "llm" },
      { id: "llm-intent", source: "llm", target: "intent" },
      { id: "intent-refund", source: "intent", sourceHandle: "intent:refund-id", target: "end" },
      { id: "intent-fallback", source: "intent", sourceHandle: "fallback", target: "end" },
    ];

    const spec = compileWorkflowDraft({
      draft,
      revision: 5,
      workflowId: "42",
      workflowType: "chatai_sop",
    });

    expect(spec.nodes.find(node => node.id === "llm")).toMatchObject({
      config: { modelId: "model-1" },
      requiredCapabilities: [{ capabilityKey: "operation.llm.generate", contractVersion: 1 }],
    });
    expect(spec.nodes.find(node => node.id === "intent")).toMatchObject({
      config: {
        fallback: { id: "fallback" },
        intents: [{ description: "Refund", id: "refund-id", modelCode: "I1" }],
      },
      requiredCapabilities: [{ capabilityKey: "operation.intent.classify", contractVersion: 1 }],
    });
    expect(spec.requiredCapabilities).toEqual([
      { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
      { capabilityKey: "operation.intent.classify", contractVersion: 1 },
      { capabilityKey: "operation.llm.generate", contractVersion: 1 },
    ]);
  });

  it("rejects structurally valid but incomplete inference node configs", () => {
    const invalidLlm = createDraft();
    invalidLlm.nodes.splice(1, 1, node("llm", "llm", {
      inputs: [],
      modelId: "",
      output: {
        field: { description: "", id: "output-id", name: "output", type: "string" },
        format: "text",
      },
      systemPrompt: [{ type: "text", value: "Summarize" }],
      userPrompt: [],
    }));
    invalidLlm.edges = [
      { id: "start-llm", source: "start", target: "llm" },
      { id: "llm-end", source: "llm", target: "end" },
    ];
    expectCompilationIssue(invalidLlm, {
      code: "invalid-node-config",
      message: "LLM node requires a model, complete inputs, prompts, and outputs",
      nodeId: "llm",
    });

    const invalidIntent = createDraft();
    invalidIntent.nodes.splice(1, 1, node("intent", "ai-intent", {
      advancedEnabled: false,
      intents: [{ description: "Refund", id: "refund-id" }],
      prompt: "",
    }));
    invalidIntent.edges = [
      { id: "start-intent", source: "start", target: "intent" },
      { id: "intent-refund", source: "intent", sourceHandle: "intent:refund-id", target: "end" },
      { id: "intent-fallback", source: "intent", sourceHandle: "fallback", target: "end" },
    ];
    expectCompilationIssue(invalidIntent, {
      code: "invalid-node-config",
      message: "AI Intent node requires an input and complete unique intents",
      nodeId: "intent",
    });
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
      message: "Start node requires accounts, triggers, and an entry policy",
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
      message: "Wait Event node requires a supported event and timeout",
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
    draft.nodes.splice(2, 0, node("message", "message"));
    draft.edges.splice(1, 1,
      { id: "wait-message", source: "wait", target: "message" },
      { id: "message-end", source: "message", target: "end" },
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

function startConfig() {
  return {
    entryPolicy: { mode: "never" },
    panelState: { section: "triggers" },
    seatIds: [101],
    triggers: [{ type: "contact.friend_added" }],
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
