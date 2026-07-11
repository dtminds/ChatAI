export type WorkflowStartOption = {
  id: string;
  label: string;
};

const fixtureAccounts: WorkflowStartOption[] = [
  { id: "managed-account-sales-1", label: "销售一组" },
  { id: "managed-account-sales-2", label: "销售二组" },
  { id: "managed-account-service", label: "客户服务" },
];

const fixtureTags: WorkflowStartOption[] = [
  { id: "tag-new-customer", label: "新客户" },
  { id: "tag-high-intent", label: "高意向" },
  { id: "tag-repurchase", label: "待复购" },
];

export function getWorkflowStartFixtureAccounts(
  enabled = areWorkflowStartFixturesEnabled(),
) {
  return enabled ? fixtureAccounts : [];
}

export function getWorkflowStartFixtureTags(
  enabled = areWorkflowStartFixturesEnabled(),
) {
  return enabled ? fixtureTags : [];
}

export function areWorkflowStartFixturesEnabled(
  value = import.meta.env.VITE_WORKFLOW_FIXTURES_ENABLED,
) {
  return value === "true";
}
