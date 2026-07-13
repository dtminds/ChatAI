import type {
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
} from "@chatai/contracts";
import { ForbiddenError } from "../../shared/errors.js";
import type { WorkflowOperatorScope } from "./workflow.service.js";

export type WorkflowDataReader = {
  getOverview(input: { revision: number; uid: number; workflowId: string }): Promise<WorkflowDataOverview>;
  getRecord(input: { recordId: string; uid: number; workflowId: string }): Promise<WorkflowEntryRecordDetail>;
  listRecords(input: {
    cursor?: string;
    limit: number;
    nodeId?: string;
    revision: number;
    status?: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowEntryRecordPage>;
};

export class WorkflowDataService {
  constructor(private readonly reader: WorkflowDataReader) {}

  getOverview(scope: WorkflowOperatorScope, workflowId: string, revision: number) {
    assertAccess(scope);
    return this.reader.getOverview({ revision, uid: scope.uid, workflowId });
  }

  listRecords(scope: WorkflowOperatorScope, input: Omit<Parameters<WorkflowDataReader["listRecords"]>[0], "uid">) {
    assertAccess(scope);
    return this.reader.listRecords({ ...input, uid: scope.uid });
  }

  getRecord(scope: WorkflowOperatorScope, workflowId: string, recordId: string) {
    assertAccess(scope);
    return this.reader.getRecord({ recordId, uid: scope.uid, workflowId });
  }
}

function assertAccess(scope: WorkflowOperatorScope) {
  if (!scope.roles.some(role => role === "owner" || role === "admin")) {
    throw new ForbiddenError("WORKFLOW_ACCESS_FORBIDDEN", "无权查看 Workflow 数据");
  }
}
