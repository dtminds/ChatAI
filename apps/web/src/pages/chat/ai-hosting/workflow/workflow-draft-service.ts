import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialEdges,
  createInitialNodes,
} from "./graph";
import type { WorkflowDraft } from "./types";

export type WorkflowDocumentStatus = "Draft" | "Published" | "Paused";

export type WorkflowListItem = {
  conversion: string;
  entered: string;
  id: string;
  name: string;
  nodes: number;
  owner: string;
  status: WorkflowDocumentStatus;
  trigger: string;
  updatedAt: string;
};

export type WorkflowDocument = WorkflowListItem & {
  draft: WorkflowDraft;
  savedAt: string;
};

const workflowDocuments: WorkflowDocument[] = [
  {
    conversion: "18.4%",
    draft: {
      edges: createInitialEdges(),
      nodes: createInitialNodes(),
    },
    entered: "124.8万",
    id: "newcomer-conversion",
    name: "新人转化旅程",
    nodes: 8,
    owner: "运营主管",
    savedAt: "18:20",
    status: "Draft",
    trigger: "近 30 天新入会且未首购客户",
    updatedAt: "今天 18:20",
  },
  {
    conversion: "23.1%",
    draft: {
      edges: createInitialEdges(),
      nodes: createInitialNodes().map((node) =>
        node.id === "trigger"
          ? {
              ...node,
              data: {
                ...node.data,
                audience: "90 天未复购会员",
                title: "复购唤醒触发",
              },
            }
          : node,
      ),
    },
    entered: "86.3万",
    id: "vip-reactivation",
    name: "会员复购唤醒",
    nodes: 12,
    owner: "增长运营",
    savedAt: "昨天 21:04",
    status: "Published",
    trigger: "90 天未复购会员",
    updatedAt: "昨天 21:04",
  },
  {
    conversion: "9.7%",
    draft: {
      edges: createInitialEdges(),
      nodes: createInitialNodes().map((node) =>
        node.id === "trigger"
          ? {
              ...node,
              data: {
                ...node.data,
                audience: "直播间互动但未下单客户",
                title: "直播互动触发",
              },
            }
          : node,
      ),
    },
    entered: "42.6万",
    id: "live-follow-up",
    name: "直播后跟进",
    nodes: 6,
    owner: "直播运营",
    savedAt: "7月4日 16:12",
    status: "Paused",
    trigger: "直播间互动但未下单客户",
    updatedAt: "7月4日 16:12",
  },
];

export function listWorkflowDocuments(): WorkflowListItem[] {
  return workflowDocuments.map(({ draft: _draft, savedAt: _savedAt, ...workflow }) => workflow);
}

export function getWorkflowDocument(workflowId: string | undefined): WorkflowDocument {
  return cloneWorkflowDocument(
    workflowDocuments.find((workflow) => workflow.id === workflowId)
      ?? workflowDocuments[0],
  );
}

export function getWorkflowName(workflowId: string | undefined) {
  return getWorkflowDocument(workflowId).name;
}

export function useWorkflowDocument(workflowId: string | undefined) {
  const [document, setDocument] = useState(() => getWorkflowDocument(workflowId));
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDocument(getWorkflowDocument(workflowId));
    setSaveState("saved");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [workflowId]);

  const markDirty = useCallback(() => {
    setSaveState("saving");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      setSaveState("saved");
      setDocument((currentDocument) => ({
        ...currentDocument,
        savedAt: "刚刚",
        updatedAt: "刚刚",
      }));
      saveTimerRef.current = null;
    }, 500);
  }, []);

  const markSaved = useCallback(() => {
    setSaveState("saved");
    setDocument((currentDocument) => ({
      ...currentDocument,
      savedAt: "刚刚",
      updatedAt: "刚刚",
    }));
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
  }, []);

  return useMemo(() => ({
    document,
    markDirty,
    markSaved,
    saveState,
  }), [document, markDirty, markSaved, saveState]);
}

function cloneWorkflowDocument(document: WorkflowDocument): WorkflowDocument {
  return {
    ...document,
    draft: {
      edges: document.draft.edges.map((edge) => ({
        ...edge,
        data: edge.data ? { ...edge.data } : edge.data,
      })),
      nodes: document.draft.nodes.map((node) => ({
        ...node,
        data: { ...node.data },
        position: { ...node.position },
      })),
    },
  };
}
