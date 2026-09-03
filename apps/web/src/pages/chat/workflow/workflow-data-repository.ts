import type {
  ApiSuccessEnvelope,
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordExecutionLog,
  WorkflowEntryRecordPage,
} from "@chatai/contracts";
import { http } from "@/lib/request";

const inFlightRequests = new Map<string, Promise<unknown>>();

export type WorkflowDataRepository = {
  getExecutionLog(workflowId: string, recordId: string, sequence: number): Promise<WorkflowEntryRecordExecutionLog>;
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
    getExecutionLog(workflowId, recordId, sequence) {
      const key = `${apiBasePath}/${workflowId}/records/${recordId}/executions/${sequence}`;
      return shareInFlight(
        key,
        async () => unwrap<WorkflowEntryRecordExecutionLog>(await http.get(key)),
      );
    },
    getOverview(workflowId) {
      return shareInFlight(
        `${apiBasePath}/${workflowId}/data`,
        async () => unwrap(await http.get(`${apiBasePath}/${workflowId}/data`)),
      );
    },
    async getRecord(workflowId, recordId) {
      return unwrap(await http.get(`${apiBasePath}/${workflowId}/records/${recordId}`));
    },
    listRecords(input) {
      const { workflowId, ...params } = input;
      return shareInFlight(
        listRecordsKey(apiBasePath, input),
        async () => unwrap(await http.get(`${apiBasePath}/${workflowId}/records`, { params })),
      );
    },
  };
}

function listRecordsKey(
  apiBasePath: string,
  input: {
    cursor?: string;
    limit?: number;
    nodeId?: string;
    status?: string;
    workflowId: string;
  },
) {
  return `${apiBasePath}/${input.workflowId}/records:${JSON.stringify({
    cursor: input.cursor ?? null,
    limit: input.limit ?? null,
    nodeId: input.nodeId ?? null,
    status: input.status ?? null,
  })}`;
}

function shareInFlight<T>(key: string, start: () => Promise<T>): Promise<T> {
  // StrictMode 开发态会重放 effect；复用进行中的请求，避免同一次打开打两次
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const request = start().finally(() => {
    if (inFlightRequests.get(key) === request) {
      inFlightRequests.delete(key);
    }
  });
  inFlightRequests.set(key, request);
  return request;
}

function unwrap<T>(response: unknown): T {
  if (!response || typeof response !== "object" || !("data" in response)) {
    throw new Error("Workflow 数据服务返回无效数据");
  }
  return (response as ApiSuccessEnvelope<T>).data;
}
