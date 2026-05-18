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

export const presetRoles = [
  {
    description: "主账号身份自动拥有全部工作台和设置管理能力",
    displayName: "主账号",
    id: "owner",
    permissionDetails: [
      "会话查看",
      "接管托管账号",
      "发送消息",
      "子账号管理",
      "托管账号关联",
      "侧边栏管理",
    ],
    permissionSummary: "全部管理权限、会话处理",
  },
  {
    description: "负责设置管理和日常客服处理，不具备主账号身份",
    displayName: "管理员",
    id: "admin",
    permissionDetails: [
      "会话查看",
      "接管托管账号",
      "发送消息",
      "子账号管理",
      "托管账号关联",
      "侧边栏管理",
    ],
    permissionSummary: "设置管理、会话处理",
  },
  {
    description: "可接管账号并发送消息",
    displayName: "客服",
    id: "operator",
    permissionDetails: ["会话查看", "接管托管账号", "发送消息"],
    permissionSummary: "会话查看、接管、发送",
  },
  {
    description: "只能查看会话，不能接管账号或发送消息",
    displayName: "客服（只读）",
    id: "viewer",
    permissionDetails: ["会话查看", "不可接管账号或发送消息"],
    permissionSummary: "只读会话",
  },
] as const;

export const routingStrategies = [
  {
    value: "load",
    label: "负载优先",
    description: "优先提示当前接待压力较低的客服处理新消息。",
  },
  {
    value: "relation",
    label: "关系优先",
    description: "优先回到最近接待过该客户的客服。",
  },
  {
    value: "manual",
    label: "人工处理",
    description: "由组长根据账号状态和客户上下文安排处理人。",
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
