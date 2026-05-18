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
    description: "主账号，拥有所有 settings 和聊天权限",
    name: "owner",
    permissions: [
      { label: "chat.access", enabled: true },
      { label: "chat.send", enabled: true },
      { label: "chat.takeover", enabled: true },
      { label: "settings.access", enabled: true },
      { label: "settings.subAccounts.manage", enabled: true },
      { label: "settings.managedAccounts.manage", enabled: true },
      { label: "settings.sidebar.manage", enabled: true },
    ],
  },
  {
    description: "可管理设置，但不具备主账号身份",
    name: "admin",
    permissions: [
      { label: "chat.access", enabled: true },
      { label: "chat.send", enabled: true },
      { label: "chat.takeover", enabled: true },
      { label: "settings.access", enabled: true },
      { label: "settings.subAccounts.manage", enabled: true },
      { label: "settings.managedAccounts.manage", enabled: true },
      { label: "settings.sidebar.manage", enabled: true },
    ],
  },
  {
    description: "可接管账号并发送消息",
    name: "operator",
    permissions: [
      { label: "chat.access", enabled: true },
      { label: "chat.send", enabled: true },
      { label: "chat.takeover", enabled: true },
      { label: "settings.access", enabled: false },
      { label: "settings.subAccounts.manage", enabled: false },
      { label: "settings.managedAccounts.manage", enabled: false },
      { label: "settings.sidebar.manage", enabled: false },
    ],
  },
  {
    description: "只能查看会话，不能接管账号或发送消息",
    name: "viewer",
    permissions: [
      { label: "chat.access", enabled: true },
      { label: "chat.send", enabled: false },
      { label: "chat.takeover", enabled: false },
      { label: "settings.access", enabled: false },
      { label: "settings.subAccounts.manage", enabled: false },
      { label: "settings.managedAccounts.manage", enabled: false },
      { label: "settings.sidebar.manage", enabled: false },
    ],
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
