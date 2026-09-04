import type { AccountPermission, AuthSubUser } from "@chatai/contracts";

export const WORKFLOW_TEMPLATE_MANAGE_PERMISSION: AccountPermission = "workflow_template_manage";
export const WORKFLOW_CREATE_UID_ALLOWLIST = new Set([101, 272]);

export function canCreateWorkflows(subject: AuthSubUser | undefined) {
  return subject ? WORKFLOW_CREATE_UID_ALLOWLIST.has(subject.uid) : false;
}

export function canManageWorkflowTemplates(subject: AuthSubUser | undefined) {
  return subject?.permissions.includes(WORKFLOW_TEMPLATE_MANAGE_PERMISSION) ?? false;
}
