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

export function getWorkflowStartFixtureAccounts() {
  return import.meta.env.PROD ? [] : fixtureAccounts;
}

export function getWorkflowStartFixtureTags() {
  return import.meta.env.PROD ? [] : fixtureTags;
}
