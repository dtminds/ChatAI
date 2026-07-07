import { useCallback, useEffect, useState } from "react";
import type {
  MarketingWorkflowNode,
  NodeRunRecord,
} from "../types";

type WorkflowRunRecords = Record<string, NodeRunRecord>;

export function useWorkflowRun(scopeKey?: string) {
  const [runRecords, setRunRecords] = useState<WorkflowRunRecords>({});

  useEffect(() => {
    setRunRecords({});
  }, [scopeKey]);

  const runNode = useCallback((node: MarketingWorkflowNode) => {
    setRunRecords((currentRecords) => ({
      ...currentRecords,
      [node.id]: createNodeRunRecord(node),
    }));
  }, []);

  const getNodeRun = useCallback(
    (nodeId: string | undefined) => nodeId ? runRecords[nodeId] : undefined,
    [runRecords],
  );

  const deleteNodeRun = useCallback((nodeId: string) => {
    setRunRecords((currentRecords) => {
      if (!currentRecords[nodeId]) {
        return currentRecords;
      }

      const {
        [nodeId]: _deletedRun,
        ...nextRecords
      } = currentRecords;
      return nextRecords;
    });
  }, []);

  return {
    deleteNodeRun,
    getNodeRun,
    runNode,
    runRecords,
  };
}

function createNodeRunRecord(node: MarketingWorkflowNode): NodeRunRecord {
  const input = JSON.stringify(
    {
      audience: node.data.audience ?? "当前节点继承上游客户",
      event: node.data.kind,
      nodeId: node.id,
      summary: node.data.summary,
    },
    null,
    2,
  );
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
    durationMs: 84 + node.id.length * 7,
    finishedAt: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date()),
    input,
    logs: [
      "读取上游客户上下文",
      "校验节点配置",
      node.data.kind === "ai" ? "匹配 Agent 与知识库策略" : "生成下一步执行结果",
    ],
    output,
    status: "succeeded",
  };
}
