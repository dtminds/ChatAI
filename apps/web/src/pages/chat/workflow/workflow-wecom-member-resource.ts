import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiSuccessEnvelope,
  WorkflowWeComMemberListResponse,
  WorkflowWeComMemberNode,
} from "@chatai/contracts";
import { http } from "@/lib/request";
import type { WorkflowStartOption } from "./nodes/start/fixture-options";

export type WorkflowWeComMemberResourceStatus =
  | "error"
  | "idle"
  | "loading"
  | "ready";

export type WorkflowWeComMemberResource = {
  memberLimit: number;
  reload: () => void;
  roots: WorkflowWeComMemberNode[];
  status: WorkflowWeComMemberResourceStatus;
};

export async function listWorkflowWeComMembers(): Promise<WorkflowWeComMemberListResponse> {
  const response = await http.get<ApiSuccessEnvelope<WorkflowWeComMemberListResponse>>(
    "/server/workflow/wecom-members",
  );

  return response.data;
}

export function useWorkflowWeComMemberResource(
  enabled: boolean,
  loader: () => Promise<WorkflowWeComMemberListResponse> = listWorkflowWeComMembers,
) {
  const requestIdRef = useRef(0);
  const [memberLimit, setMemberLimit] = useState(100);
  const [roots, setRoots] = useState<WorkflowWeComMemberNode[]>([]);
  const [status, setStatus] = useState<WorkflowWeComMemberResourceStatus>("idle");

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");

    try {
      const next = await loader();

      if (requestIdRef.current === requestId) {
        setMemberLimit(next.memberLimit);
        setRoots(next.roots);
        setStatus("ready");
      }
    }
    catch {
      if (requestIdRef.current === requestId) {
        setStatus("error");
      }
    }
  }, [loader]);

  useEffect(() => {
    if (!enabled || status !== "idle") {
      return;
    }

    void reload();
  }, [enabled, reload, status]);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  return { memberLimit, reload, roots, status };
}

export function createWeComMemberRootsFromOptions(
  options: readonly WorkflowStartOption[],
): WorkflowWeComMemberNode[] {
  return options.map(option => ({
    ...(option.avatarUrl ? { avatarUrl: option.avatarUrl } : {}),
    children: [],
    id: `member-${option.id}`,
    kind: "member",
    title: option.label,
    workUserId: option.id,
  }));
}

export function isWeComMemberSelectable(node: WorkflowWeComMemberNode) {
  return node.kind === "member" && Boolean(node.workUserId) && node.selectable !== false;
}

export function collectWeComMemberWorkUserIds(nodes: readonly WorkflowWeComMemberNode[]) {
  const ids: number[] = [];
  const seen = new Set<number>();

  function visit(node: WorkflowWeComMemberNode) {
    if (isWeComMemberSelectable(node) && node.workUserId && !seen.has(node.workUserId)) {
      seen.add(node.workUserId);
      ids.push(node.workUserId);
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return ids;
}

export function findWeComMemberByWorkUserId(
  nodes: readonly WorkflowWeComMemberNode[],
  workUserId: number,
): WorkflowWeComMemberNode | undefined {
  for (const node of nodes) {
    if (node.kind === "member" && node.workUserId === workUserId) {
      return node;
    }

    const nested = findWeComMemberByWorkUserId(node.children, workUserId);

    if (nested) {
      return nested;
    }
  }

  return undefined;
}

export function filterWeComMemberTree(
  nodes: readonly WorkflowWeComMemberNode[],
  query: string,
): WorkflowWeComMemberNode[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [...nodes];
  }

  return nodes.flatMap((node) => {
    const children = filterWeComMemberTree(node.children, normalizedQuery);
    const selfMatches = node.title.toLowerCase().includes(normalizedQuery);

    if (!selfMatches && children.length === 0) {
      return [];
    }

    return [{
      ...node,
      children: selfMatches ? node.children : children,
    }];
  });
}
