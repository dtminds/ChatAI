import type {
  NodeRunRecord,
  WorkflowDraft,
  WorkflowNode,
  WorkflowRunTraceItem,
  WorkflowRunRecord,
} from "../types";
import { createWorkflowRunDraftSnapshot } from "./workflow-run-snapshot";

export type WorkflowNodeRunRequest = {
  node: WorkflowNode;
};

export type WorkflowRunRequest = {
  draft: WorkflowDraft;
  workflowId: string;
};

export type WorkflowRunAdapter = {
  runNode: (request: WorkflowNodeRunRequest) => NodeRunRecord | Promise<NodeRunRecord>;
  runWorkflow: (request: WorkflowRunRequest) => WorkflowRunRecord | Promise<WorkflowRunRecord>;
  stopWorkflowRun?: (request: WorkflowRunRequest & { runId: string }) => void | Promise<void>;
};

export function createMockWorkflowRunAdapter(): WorkflowRunAdapter {
  return {
    runNode: ({ node }) => createMockNodeRunRecord(node),
    runWorkflow: ({ draft, workflowId }) => createMockWorkflowRunRecord(workflowId, draft),
    stopWorkflowRun: () => undefined,
  };
}

function createMockNodeRunRecord(node: WorkflowNode): NodeRunRecord {
  const startedAt = Date.now();
  const input = createNodeRunInput(node);
  const output = JSON.stringify(
    {
      metric: node.data.metric,
      next: node.data.kind === "goal" ? "journey_exit" : "continue",
      title: node.data.title,
    },
    null,
    2,
  );

  return {
    completedAt: startedAt + 84 + node.id.length * 7,
    durationMs: 84 + node.id.length * 7,
    finishedAt: formatRunTime(new Date(startedAt + 84 + node.id.length * 7)),
    input,
    logs: [
      "读取上游客户上下文",
      "校验节点配置",
      node.data.kind === "ai" ? "匹配 Agent 与知识库策略" : "生成下一步执行结果",
    ],
    output,
    status: "succeeded",
    startedAt,
  };
}

export function createPendingNodeRunRecord(node: WorkflowNode): NodeRunRecord {
  const startedAt = Date.now();

  return {
    completedAt: undefined,
    durationMs: 0,
    finishedAt: "",
    input: createNodeRunInput(node),
    logs: ["等待执行结果"],
    output: "",
    status: "running",
    startedAt,
  };
}

export function createFailedNodeRunRecord(
  node: WorkflowNode,
  error: unknown,
): NodeRunRecord {
  const message = error instanceof Error ? error.message : "节点运行失败";

  return {
    completedAt: Date.now(),
    durationMs: 0,
    errorMessage: message,
    finishedAt: formatRunTime(new Date()),
    input: createNodeRunInput(node),
    logs: ["执行请求失败", message],
    output: "",
    status: "failed",
    startedAt: Date.now(),
  };
}

function createMockWorkflowRunRecord(workflowId: string, draft: WorkflowDraft): WorkflowRunRecord {
  const draftSnapshot = createWorkflowRunDraftSnapshot(draft);
  const startedAt = new Date();
  const nodeRuns = Object.fromEntries(
    draftSnapshot.nodes.map((node) => [node.id, createMockNodeRunRecord(node)]),
  );
  const durationMs = Object.values(nodeRuns).reduce((total, record) => total + record.durationMs, 0);

  return {
    createdAt: formatRunTime(startedAt),
    draft: draftSnapshot,
    durationMs,
    finishedAt: formatRunTime(new Date()),
    id: `${workflowId || "workflow"}-run-${startedAt.getTime()}`,
    inputs: createWorkflowRunInputs(draftSnapshot),
    nodeRuns,
    outputs: createWorkflowRunOutputs(draftSnapshot, nodeRuns),
    status: "succeeded",
    totalTokens: draftSnapshot.nodes.length * 128,
    title: "Test Run",
    totalNodes: draftSnapshot.nodes.length,
    totalSteps: draftSnapshot.nodes.length,
    trace: createWorkflowRunTrace(draftSnapshot, nodeRuns),
  };
}

function createWorkflowRunInputs(draft: WorkflowDraft) {
  const trigger = draft.nodes.find((node) => node.data.kind === "trigger");

  return {
    audience: trigger?.data.audience ?? "当前 Workflow 目标人群",
    nodeCount: draft.nodes.length,
    trigger: trigger?.data.title ?? "Trigger",
  };
}

function createWorkflowRunOutputs(
  draft: WorkflowDraft,
  nodeRuns: Record<string, NodeRunRecord>,
) {
  const goal = draft.nodes.find((node) => node.data.kind === "goal");

  return {
    conversion: goal?.data.conversion ?? null,
    next: "workflow_completed",
    nodeResults: Object.keys(nodeRuns).length,
    summary: "测试运行完成",
  };
}

function createWorkflowRunTrace(
  draft: WorkflowDraft,
  nodeRuns: Record<string, NodeRunRecord>,
): WorkflowRunTraceItem[] {
  return draft.nodes.map((node) => {
    const run = nodeRuns[node.id] ?? createPendingNodeRunRecord(node);

    return {
      durationMs: run.durationMs,
      errorMessage: run.errorMessage,
      finishedAt: run.finishedAt,
      logs: run.logs,
      nodeId: node.id,
      nodeTitle: node.data.title,
      nodeType: node.data.kind,
      startedAt: run.startedAt ? formatRunTime(new Date(run.startedAt)) : "",
      status: run.status,
    };
  });
}

function createNodeRunInput(node: WorkflowNode): string {
  return JSON.stringify(
    {
      audience: node.data.audience ?? "当前节点继承上游客户",
      event: node.data.kind,
      nodeId: node.id,
      summary: node.data.summary,
    },
    null,
    2,
  );
}

function formatRunTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
