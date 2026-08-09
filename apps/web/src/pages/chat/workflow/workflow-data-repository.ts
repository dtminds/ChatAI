import type {
  ApiSuccessEnvelope,
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type WorkflowDataRepository = {
  getOverview(workflowId: string, revision: number): Promise<WorkflowDataOverview>;
  getRecord(workflowId: string, recordId: string): Promise<WorkflowEntryRecordDetail>;
  listRecords(input: {
    cursor?: string;
    limit?: number;
    nodeId?: string;
    revision: number;
    status?: string;
    workflowId: string;
  }): Promise<WorkflowEntryRecordPage>;
};

export function createWorkflowDataRepository(): WorkflowDataRepository {
  return {
    async getOverview(workflowId, revision) {
      return unwrap(await http.get(`/server/workflows/${workflowId}/data`, { params: { revision } }));
    },
    async getRecord(workflowId, recordId) {
      return unwrap(await http.get(`/server/workflows/${workflowId}/records/${recordId}`));
    },
    async listRecords(input) {
      const { workflowId, ...params } = input;
      return unwrap(await http.get(`/server/workflows/${workflowId}/records`, { params }));
    },
  };
}

function unwrap<T>(response: unknown): T {
  if (!response || typeof response !== "object" || !("data" in response)) {
    throw new Error("Workflow 数据服务返回无效数据");
  }
  return (response as ApiSuccessEnvelope<T>).data;
}
