import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialEdges,
  createInitialNodes,
} from "./graph";
import { sanitizeDraft } from "./history-engine";
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

const WORKFLOW_SAVE_DEBOUNCE_MS = 500;

let workflowDocuments: WorkflowDocument[] = createWorkflowDocuments();

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

export function saveWorkflowDraft(
  workflowId: string | undefined,
  draft: WorkflowDraft,
): WorkflowDocument {
  const documentIndex = getWorkflowDocumentIndex(workflowId);
  const currentDocument = workflowDocuments[documentIndex];
  const nextDraft = cloneWorkflowDraft(draft);
  const nextDocument: WorkflowDocument = {
    ...currentDocument,
    conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
    draft: nextDraft,
    nodes: nextDraft.nodes.length,
    savedAt: "刚刚",
    trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
    updatedAt: "刚刚",
  };

  workflowDocuments[documentIndex] = nextDocument;
  return cloneWorkflowDocument(nextDocument);
}

export function resetWorkflowDocumentsForTest() {
  workflowDocuments = createWorkflowDocuments();
}

export function useWorkflowDocument(workflowId: string | undefined) {
  const [document, setDocument] = useState(() => getWorkflowDocument(workflowId));
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRequestRef = useRef(0);
  const workflowIdRef = useRef(document.id);

  useEffect(() => {
    const nextDocument = getWorkflowDocument(workflowId);
    workflowIdRef.current = nextDocument.id;
    setDocument(nextDocument);
    setSaveState("saved");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [workflowId]);

  const markDirty = useCallback((draft: WorkflowDraft) => {
    const draftToSave = cloneWorkflowDraft(draft);
    const saveRequestId = saveRequestRef.current + 1;
    saveRequestRef.current = saveRequestId;
    setSaveState("saving");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const savedDocument = saveWorkflowDraft(workflowIdRef.current, draftToSave);
      if (saveRequestRef.current !== saveRequestId) {
        return;
      }

      setSaveState("saved");
      setDocument((currentDocument) => ({
        ...currentDocument,
        conversion: savedDocument.conversion,
        nodes: savedDocument.nodes,
        savedAt: savedDocument.savedAt,
        trigger: savedDocument.trigger,
        updatedAt: savedDocument.updatedAt,
      }));
      saveTimerRef.current = null;
    }, WORKFLOW_SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
  }, []);

  return useMemo(() => ({
    document,
    markDirty,
    saveState,
  }), [document, markDirty, saveState]);
}

function cloneWorkflowDocument(document: WorkflowDocument): WorkflowDocument {
  return {
    ...document,
    draft: cloneWorkflowDraft(document.draft),
  };
}

function cloneWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  const sanitizedDraft = sanitizeDraft(draft);

  return {
    edges: sanitizedDraft.edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : edge.data,
    })),
    nodes: sanitizedDraft.nodes.map((node) => ({
      ...node,
      data: { ...node.data },
      position: { ...node.position },
    })),
  };
}

function getWorkflowDocumentIndex(workflowId: string | undefined) {
  const documentIndex = workflowDocuments.findIndex((workflow) => workflow.id === workflowId);
  return documentIndex >= 0 ? documentIndex : 0;
}

function getWorkflowTrigger(draft: WorkflowDraft) {
  return draft.nodes.find((node) => node.data.kind === "trigger")?.data.audience;
}

function getWorkflowConversion(draft: WorkflowDraft) {
  const conversion = draft.nodes.find((node) => node.data.kind === "goal")?.data.conversion;
  return typeof conversion === "number" ? `${conversion}%` : undefined;
}

function createWorkflowDocuments(): WorkflowDocument[] {
  return [
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
}
