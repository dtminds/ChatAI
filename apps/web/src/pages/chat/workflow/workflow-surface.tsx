import {
  getWorkflowSurfaceTypes,
  type WorkflowSurface,
  type WorkflowType,
} from "@chatai/contracts";
import { createContext, useContext, type ReactNode } from "react";

export type WorkflowSurfaceProfile = {
  apiBasePath: "/server/workflows" | "/server/embed/workflows";
  createWorkflowType: WorkflowType;
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
    createWorkflowType: "chatai_sop",
    createWorkflowTypes: getWorkflowSurfaceTypes("chatai"),
    description: "把复杂的个性化营销策略，可视化编排为 AI 驱动的自动化客户旅程",
    embedded: false,
    surface: "chatai",
    title: "SOP 工作流",
    webBasePath: "/chat/workflows",
  },
  sop_embed: {
    apiBasePath: "/server/embed/workflows",
    createWorkflowType: "wecom_sop",
    createWorkflowTypes: getWorkflowSurfaceTypes("sop_embed"),
    description: "面向目标人群灵活编排营销策略，构建个性化运营链路",
    embedded: true,
    surface: "sop_embed",
    title: "营销画布",
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
