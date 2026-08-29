import type {
  ApiSuccessEnvelope,
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type WorkflowDataRepository = {
  getOverview(workflowId: string): Promise<WorkflowDataOverview>;
  getRecord(workflowId: string, recordId: string): Promise<WorkflowEntryRecordDetail>;
  listRecords(input: {
    cursor?: string;
    limit?: number;
    nodeId?: string;
    status?: string;
    workflowId: string;
  }): Promise<WorkflowEntryRecordPage>;
};

export function createWorkflowDataRepository(
  apiBasePath = "/server/workflows",
): WorkflowDataRepository {
  return {
    async getOverview(workflowId) {
      return unwrap(await http.get(`${apiBasePath}/${workflowId}/data`));
    },
    async getRecord(workflowId, recordId) {
      return unwrap(await http.get(`${apiBasePath}/${workflowId}/records/${recordId}`));
    },
    async listRecords(input) {
      const { workflowId, ...params } = input;
      return unwrap(await http.get(`${apiBasePath}/${workflowId}/records`, { params }));
    },
  };
}

function unwrap<T>(response: unknown): T {
  if (!response || typeof response !== "object" || !("data" in response)) {
    throw new Error("Workflow 数据服务返回无效数据");
  }
  return (response as ApiSuccessEnvelope<T>).data;
}
