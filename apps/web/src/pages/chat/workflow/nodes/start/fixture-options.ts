export type WorkflowStartOption = {
  avatarUrl?: string;
  id: number;
  label: string;
};

const fixtureSeats: WorkflowStartOption[] = [
  { id: 101, label: "销售一组" },
  { id: 102, label: "销售二组" },
  { id: 103, label: "客户服务" },
];

const fixtureWorkUsers: WorkflowStartOption[] = [
  { id: 201, label: "企微成员一" },
  { id: 202, label: "企微成员二" },
  { id: 203, label: "企微成员三" },
];

const fixtureTags: WorkflowStartOption[] = [
  { id: 201, label: "新客户" },
  { id: 202, label: "高意向" },
  { id: 203, label: "待复购" },
];

export function getWorkflowStartFixtureSeats(
  enabled = areWorkflowStartFixturesEnabled(),
) {
  return enabled ? fixtureSeats : [];
}

export function getWorkflowStartFixtureWorkUsers(
  enabled = areWorkflowStartFixturesEnabled(),
) {
  return enabled ? fixtureWorkUsers : [];
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
