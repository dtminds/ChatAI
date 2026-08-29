import {
  getWorkflowSurfaceTypes,
  type WorkflowSurface,
  type WorkflowType,
} from "@chatai/contracts";
import { createContext, useContext, type ReactNode } from "react";

export type WorkflowSurfaceProfile = {
  apiBasePath: "/server/workflows" | "/server/embed/workflows";
  createWorkflowTypes: WorkflowType[];
  description: string;
  embedded: boolean;
  surface: WorkflowSurface;
  title: string;
  webBasePath: "/chat/workflows" | "/embed/workflows";
};

const workflowSurfaceProfiles: Record<WorkflowSurface, WorkflowSurfaceProfile> = {
  chatai: {
    apiBasePath: "/server/workflows",
    createWorkflowTypes: getWorkflowSurfaceTypes("chatai"),
    description: "创建、发布并管理 ChatAI SOP",
    embedded: false,
    surface: "chatai",
    title: "工作流",
    webBasePath: "/chat/workflows",
  },
  sop_embed: {
    apiBasePath: "/server/embed/workflows",
    createWorkflowTypes: getWorkflowSurfaceTypes("sop_embed"),
    description: "创建、发布并管理企微 SOP",
    embedded: true,
    surface: "sop_embed",
    title: "SOP Workflow",
    webBasePath: "/embed/workflows",
  },
};

const WorkflowSurfaceContext = createContext(workflowSurfaceProfiles.chatai);

export function getWorkflowSurfaceProfile(surface: WorkflowSurface) {
  return workflowSurfaceProfiles[surface];
}

export function WorkflowSurfaceProvider({
  children,
  surface,
}: {
  children: ReactNode;
  surface: WorkflowSurface;
}) {
  return (
    <WorkflowSurfaceContext.Provider value={getWorkflowSurfaceProfile(surface)}>
      {children}
    </WorkflowSurfaceContext.Provider>
  );
}

export function useWorkflowSurface() {
  return useContext(WorkflowSurfaceContext);
}

export function getWorkflowDocumentPath(
  profile: WorkflowSurfaceProfile,
  workflowId: string,
  mode: "data" | "design" = "design",
) {
  const path = `${profile.webBasePath}/${workflowId}`;
  return mode === "data" ? `${path}/data` : path;
}
