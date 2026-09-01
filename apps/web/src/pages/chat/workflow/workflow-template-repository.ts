import type { WorkflowTemplateDetail, WorkflowTemplateListPage, WorkflowTemplateApplicationRequest } from "@chatai/contracts";
import { http } from "@/lib/request";

export type WorkflowTemplateListInput = { cursor?: string; limit?: number; query?: string; category?: string; scene?: string; workflowType?: string; featured?: boolean };
export function createWorkflowTemplateRepository(client: { get(url: string): Promise<unknown>; post(url: string, data?: unknown): Promise<unknown> } = http, apiBasePath = "/server") {
  const unwrap = <T>(value: any): T => value?.data as T;
  return {
    async list(input: WorkflowTemplateListInput = {}) {
      const params = new URLSearchParams();
      Object.entries(input).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)); });
      return unwrap<WorkflowTemplateListPage>(await client.get(`${apiBasePath}/workflow-templates${params.size ? `?${params}` : ""}`));
    },
    async get(id: string) { return unwrap<WorkflowTemplateDetail>(await client.get(`${apiBasePath}/workflow-templates/${id}`)); },
    async apply(id: string, body: WorkflowTemplateApplicationRequest = {}) { return unwrap<any>(await client.post(`${apiBasePath}/workflow-templates/${id}/applications`, body)); },
  };
}
