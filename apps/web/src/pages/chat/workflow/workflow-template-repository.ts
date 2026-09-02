import type {
  WorkflowTemplateApplicationRequest,
  WorkflowTemplateDetail,
  WorkflowTemplateListPage,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type WorkflowTemplateListInput = {
  category?: string;
  featured?: boolean;
  limit?: number;
  page?: number;
  query?: string;
  scene?: string;
  workflowType?: string;
};

export type WorkflowTemplateRepository = {
  apply: (id: string, body?: WorkflowTemplateApplicationRequest) => Promise<{ id: string }>;
  deleteDraft?: (id: string) => Promise<void>;
  get: (id: string) => Promise<WorkflowTemplateDetail>;
  getDraft?: (id: string) => Promise<WorkflowTemplateDetail>;
  list: (input?: WorkflowTemplateListInput) => Promise<WorkflowTemplateListPage>;
  listDrafts?: (input?: WorkflowTemplateListInput) => Promise<WorkflowTemplateListPage>;
  publish?: (id: string) => Promise<WorkflowTemplateDetail>;
  withdraw?: (id: string) => Promise<WorkflowTemplateDetail>;
};

export function createWorkflowTemplateRepository(
  client: { delete(url: string): Promise<unknown>; get(url: string): Promise<unknown>; post(url: string, data?: unknown): Promise<unknown> } = http,
  apiBasePath = "/server",
): WorkflowTemplateRepository {
  const unwrap = <T>(value: unknown): T => {
    if (!value || typeof value !== "object" || !("data" in value)) {
      throw new Error("模板服务返回无效数据");
    }
    return (value as { data: T }).data;
  };
  return {
    async list(input = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      return unwrap<WorkflowTemplateListPage>(await client.get(
        `${apiBasePath}/workflow-templates${params.size ? `?${params}` : ""}`,
      ));
    },
    async get(id) {
      return unwrap<WorkflowTemplateDetail>(await client.get(`${apiBasePath}/workflow-templates/${id}`));
    },
    async getDraft(id) {
      return unwrap<WorkflowTemplateDetail>(await client.get(`${apiBasePath}/workflow-template-drafts/${id}`));
    },
    async deleteDraft(id) {
      await client.delete(`${apiBasePath}/workflow-template-drafts/${id}`);
    },
    async listDrafts(input = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      return unwrap<WorkflowTemplateListPage>(await client.get(
        `${apiBasePath}/workflow-template-drafts${params.size ? `?${params}` : ""}`,
      ));
    },
    async apply(id, body = {}) {
      return unwrap<{ id: string }>(await client.post(`${apiBasePath}/workflow-templates/${id}/applications`, body));
    },
    async publish(id) {
      return unwrap<WorkflowTemplateDetail>(await client.post(`${apiBasePath}/workflow-templates/${id}/publish`));
    },
    async withdraw(id) {
      return unwrap<WorkflowTemplateDetail>(await client.post(`${apiBasePath}/workflow-templates/${id}/withdraw`));
    },
  };
}

export function createEmptyWorkflowTemplateRepository(): WorkflowTemplateRepository {
  return {
    async list() {
      return { items: [], total: 0 };
    },
    async get() {
      throw new Error("模板不存在");
    },
    async apply() {
      throw new Error("模板不存在");
    },
  };
}
