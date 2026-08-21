import type {
  WorkflowSubjectType,
  WorkflowType,
} from "@chatai/contracts";

const WORKFLOW_TYPE_TO_DATABASE_CODE = {
  chatai_sop: 1,
  wecom_sop: 2,
  member_sop: 3,
} as const satisfies Record<WorkflowType, number>;

const SUBJECT_TYPE_TO_DATABASE_CODE = {
  chatai_contact: 1,
  wecom_contact: 2,
  miniapp_member: 3,
} as const satisfies Record<WorkflowSubjectType, number>;

export function encodeWorkflowType(workflowType: WorkflowType) {
  return WORKFLOW_TYPE_TO_DATABASE_CODE[workflowType];
}

export function decodeWorkflowType(value: unknown): WorkflowType {
  const code = parseDatabaseCode(value);
  if (code === 1) return "chatai_sop";
  if (code === 2) return "wecom_sop";
  if (code === 3) return "member_sop";
  throw new Error(`Database returned an unknown Workflow Type code: ${String(value)}`);
}

export function encodeWorkflowSubjectType(subjectType: WorkflowSubjectType) {
  return SUBJECT_TYPE_TO_DATABASE_CODE[subjectType];
}

export function decodeWorkflowSubjectType(value: unknown): WorkflowSubjectType {
  const code = parseDatabaseCode(value);
  if (code === 1) return "chatai_contact";
  if (code === 2) return "wecom_contact";
  if (code === 3) return "miniapp_member";
  throw new Error(`Database returned an unknown Workflow Subject Type code: ${String(value)}`);
}

function parseDatabaseCode(value: unknown) {
  const code = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(code)) {
    throw new Error(`Database returned an invalid Workflow type code: ${String(value)}`);
  }
  return code;
}
