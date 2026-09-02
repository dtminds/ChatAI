import type {
  WorkflowDraft,
  WorkflowTemplateConfigurationItem,
  WorkflowTemplateStatus,
  WorkflowType,
} from "@chatai/contracts";

export type WorkflowTemplateRecord = {
  id: string;
  workflowType: WorkflowType;
  name: string;
  description: string;
  tags?: string[];
  coverUrl: string | null;
  draft: WorkflowDraft;
  configurationItems: WorkflowTemplateConfigurationItem[];
  templateVersion: number;
  status: WorkflowTemplateStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkflowTemplateListInput = {
  limit: number;
  offset?: number;
  query?: string;
  workflowType?: WorkflowType;
  status?: WorkflowTemplateStatus;
  tags?: string[];
};

export type WorkflowTemplateRepository = {
  create(input: Omit<WorkflowTemplateRecord, "id" | "createdAt" | "updatedAt">): Promise<WorkflowTemplateRecord>;
  deleteDraft(id: string): Promise<boolean>;
  update(input: Pick<WorkflowTemplateRecord, "id" | "name" | "description" | "tags" | "coverUrl" | "draft" | "configurationItems" | "templateVersion" | "status" | "sortOrder">): Promise<WorkflowTemplateRecord | null>;
  find(id: string, status?: WorkflowTemplateStatus): Promise<WorkflowTemplateRecord | null>;
  list(input: WorkflowTemplateListInput): Promise<{ items: WorkflowTemplateRecord[]; total: number }>;
};
