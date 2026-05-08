import {
  GridTableIcon,
  SecurityCheckIcon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";

export const qywxAccounts = [
  {
    id: "QW-10001",
    name: "护肤小助理",
    status: "正常",
    statusTone: "success",
    subAccounts: "帅庆（接管中）、宋平",
  },
  {
    id: "QW-10002",
    name: "门店咨询号",
    status: "无人接待",
    statusTone: "danger",
    subAccounts: "-",
  },
  {
    id: "QW-10003",
    name: "门店导购号",
    status: "离线",
    statusTone: "muted",
    subAccounts: "梁小满",
  },
] as const;

export const roles = [
  {
    name: "管理员",
    description: "拥有账号、人员和配置管理权限",
    permissions: [
      { label: "可接待", enabled: true },
      { label: "可管理", enabled: true },
      { label: "可导出", enabled: true },
    ],
  },
  {
    name: "组长",
    description: "可接待并查看小组数据",
    permissions: [
      { label: "可接待", enabled: true },
      { label: "可管理", enabled: false },
      { label: "可导出", enabled: true },
    ],
  },
  {
    name: "客服",
    description: "处理会话和维护客户备注",
    permissions: [
      { label: "可接待", enabled: true },
      { label: "可管理", enabled: false },
      { label: "可导出", enabled: false },
    ],
  },
] as const;

export const workflowOptions = [
  {
    title: "自动分配",
    description: "按在线状态、当前负载和历史接待关系自动分配新会话。",
    enabled: true,
    icon: SlidersHorizontalIcon,
  },
  {
    title: "超时转接",
    description: "客服长时间未响应时，将会话转入兜底接待池。",
    enabled: true,
    icon: GridTableIcon,
  },
  {
    title: "敏感词质检",
    description: "对命中规则的消息生成质检任务，便于运营回溯。",
    enabled: false,
    icon: SecurityCheckIcon,
  },
] as const;

export const routingStrategies = [
  {
    value: "load",
    label: "负载优先",
    description: "把新会话分配给当前接待量较低的客服。",
  },
  {
    value: "relation",
    label: "关系优先",
    description: "优先回到最近接待过该客户的客服。",
  },
  {
    value: "manual",
    label: "人工分配",
    description: "新会话进入待分配池，由组长手动指派。",
  },
] as const;

export const uiComponentNames = [
  "Dialog",
  "AlertDialog",
  "Sheet",
  "Alert",
  "Skeleton",
  "Progress",
  "RadioGroup",
  "Slider",
  "Tooltip",
  "HoverCard",
  "Accordion",
  "Collapsible",
  "Calendar",
  "Pagination",
  "Form",
  "Resizable",
  "Breadcrumb",
  "AspectRatio",
  "Sonner",
] as const;
