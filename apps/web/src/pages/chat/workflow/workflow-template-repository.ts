import type {
  WorkflowTemplateApplicationRequest,
  WorkflowTemplateDetail,
  WorkflowTemplateDraftUpdateRequest,
  WorkflowTemplateListPage,
} from "@chatai/contracts";
import { http } from "@/lib/request";
import { normalizeHttpError } from "./workflow-http-repository";

export type WorkflowTemplateListInput = {
  featured?: boolean;
  limit?: number;
  page?: number;
  query?: string;
  tags?: string[];
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
  updateInfo?: (id: string, input: WorkflowTemplateDraftUpdateRequest) => Promise<WorkflowTemplateDetail>;
  updateDraft?: (id: string, input: WorkflowTemplateDraftUpdateRequest) => Promise<WorkflowTemplateDetail>;
  withdraw?: (id: string) => Promise<WorkflowTemplateDetail>;
};

export function createWorkflowTemplateRepository(
  client: { delete(url: string): Promise<unknown>; get(url: string): Promise<unknown>; patch?: (url: string, data?: unknown) => Promise<unknown>; post(url: string, data?: unknown): Promise<unknown> } = http,
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
      try {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(input)) {
          if (value === undefined || value === "") continue;
          if (Array.isArray(value)) value.forEach(item => params.append(key, String(item)));
          else params.set(key, String(value));
        }
        return unwrap<WorkflowTemplateListPage>(await client.get(
          `${apiBasePath}/workflow-templates${params.size ? `?${params}` : ""}`,
        ));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async get(id) {
      try {
        return unwrap<WorkflowTemplateDetail>(await client.get(`${apiBasePath}/workflow-templates/${id}`));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async updateInfo(id, input) {
      if (!client.patch) throw new Error("模板信息编辑不可用");
      try {
        return unwrap<WorkflowTemplateDetail>(await client.patch(`${apiBasePath}/workflow-templates/${id}`, input));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async getDraft(id) {
      try {
        return unwrap<WorkflowTemplateDetail>(await client.get(`${apiBasePath}/workflow-template-drafts/${id}`));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async deleteDraft(id) {
      try {
        await client.delete(`${apiBasePath}/workflow-template-drafts/${id}`);
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async updateDraft(id, input) {
      if (!client.patch) throw new Error("模板草稿编辑不可用");
      try {
        return unwrap<WorkflowTemplateDetail>(await client.patch(`${apiBasePath}/workflow-template-drafts/${id}`, input));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async listDrafts(input = {}) {
      try {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(input)) {
          if (value === undefined || value === "") continue;
          if (Array.isArray(value)) value.forEach(item => params.append(key, String(item)));
          else params.set(key, String(value));
        }
        return unwrap<WorkflowTemplateListPage>(await client.get(
          `${apiBasePath}/workflow-template-drafts${params.size ? `?${params}` : ""}`,
        ));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async apply(id, body = {}) {
      try {
        return unwrap<{ id: string }>(await client.post(`${apiBasePath}/workflow-templates/${id}/applications`, body));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async publish(id) {
      try {
        return unwrap<WorkflowTemplateDetail>(await client.post(`${apiBasePath}/workflow-templates/${id}/publish`));
      } catch (error) {
        throw normalizeHttpError(error);
      }
    },
    async withdraw(id) {
      try {
        return unwrap<WorkflowTemplateDetail>(await client.post(`${apiBasePath}/workflow-templates/${id}/withdraw`));
      } catch (error) {
        throw normalizeHttpError(error);
      }
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
