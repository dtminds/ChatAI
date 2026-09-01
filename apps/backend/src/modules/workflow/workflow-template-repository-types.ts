import type {
  WorkflowDraft,
  WorkflowTemplateConfigurationItem,
  WorkflowTemplateStatus,
  WorkflowType,
} from "@chatai/contracts";

export type WorkflowTemplateRecord = {
  id: string;
  uid: number;
  workflowType: WorkflowType;
  name: string;
  description: string;
  category: string;
  scene: string;
  coverUrl: string | null;
  draft: WorkflowDraft;
  configurationItems: WorkflowTemplateConfigurationItem[];
  templateVersion: number;
  status: WorkflowTemplateStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkflowTemplateListInput = {
  cursor?: { updatedAt: Date; id: string };
  limit: number;
  query?: string;
  category?: string;
  scene?: string;
  workflowType?: WorkflowType;
  status?: WorkflowTemplateStatus;
};

export type WorkflowTemplateRepository = {
  create(input: Omit<WorkflowTemplateRecord, "id" | "createdAt" | "updatedAt">): Promise<WorkflowTemplateRecord>;
  update(input: Pick<WorkflowTemplateRecord, "id" | "name" | "description" | "category" | "scene" | "coverUrl" | "draft" | "configurationItems" | "templateVersion" | "status">): Promise<WorkflowTemplateRecord | null>;
  find(id: string, status?: WorkflowTemplateStatus): Promise<WorkflowTemplateRecord | null>;
  list(input: WorkflowTemplateListInput): Promise<{ items: WorkflowTemplateRecord[]; nextCursor: { updatedAt: Date; id: string } | null; total: number }>;
};
