import type { AccountPermission, AuthSubUser } from "@chatai/contracts";

export const WORKFLOW_TEMPLATE_MANAGE_PERMISSION: AccountPermission = "workflow_template_manage";

export function canManageWorkflowTemplates(subject: AuthSubUser | undefined) {
  return subject?.permissions.includes(WORKFLOW_TEMPLATE_MANAGE_PERMISSION) ?? false;
}
