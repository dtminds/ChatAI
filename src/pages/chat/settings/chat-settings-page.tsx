import {
  AccountSetting01Icon,
  Add01Icon,
  AlertCircleIcon,
  ArrowLeft01Icon,
  Calendar03Icon,
  Configuration01Icon,
  Delete02Icon,
  Database01Icon,
  Edit02Icon,
  GridTableIcon,
  HelpCircleIcon,
  Layers01Icon,
  Moon02Icon,
  Notification03Icon,
  PaintBrush02Icon,
  Search01Icon,
  SecurityCheckIcon,
  Settings03Icon,
  ShieldUserIcon,
  SlidersHorizontalIcon,
  Sun01Icon,
  UserGroup03Icon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const settingsSections = [
  {
    id: "accounts",
    label: "企微账号",
    path: "/chat/settings",
    icon: AccountSetting01Icon,
  },
  {
    id: "sub-accounts",
    label: "子账号管理",
    path: "/chat/settings/sub-accounts",
    icon: UserSettings01Icon,
  },
  {
    id: "roles",
    label: "权限角色",
    path: "/chat/settings/roles",
    icon: ShieldUserIcon,
  },
  {
    id: "workflow",
    label: "接待配置",
    path: "/chat/settings/workflow",
    icon: Configuration01Icon,
  },
  {
    id: "appearance",
    label: "外观",
    path: "/chat/settings/appearance",
    icon: PaintBrush02Icon,
  },
  {
    id: "ui-kit",
    label: "组件示例",
    path: "/chat/settings/ui-kit",
    icon: Layers01Icon,
  },
] as const;

type SettingsSectionId = (typeof settingsSections)[number]["id"];

function isSettingsSectionId(id: string): id is SettingsSectionId {
  return settingsSections.some((section) => section.id === id);
}

export function ChatSettingsPage() {
  const { sectionId } = useParams();
  const activeSectionId = sectionId ?? "accounts";

  if (!isSettingsSectionId(activeSectionId)) {
    return <Navigate replace to="/chat/settings" />;
  }

  return (
    <div className="h-svh min-h-[720px] bg-background">
      <div className="grid h-full grid-cols-[14.5rem_minmax(0,1fr)] overflow-hidden">
        <SettingsSidebar activeSectionId={activeSectionId} />

        <main className="h-full min-h-0 overflow-hidden pl-0">
          <div
            className="h-full min-h-0 overflow-y-auto rounded-[20px_0_0_20px] border-l border-divider bg-surface"
            style={{ boxShadow: "-5px 0 10px -4px var(--shadow-soft)" }}
          >
            <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-8 py-8">
              {activeSectionId === "accounts" ? <QywxAccountDemo /> : null}
              {activeSectionId === "sub-accounts" ? <SubAccountDemo /> : null}
              {activeSectionId === "roles" ? <RolePermissionDemo /> : null}
              {activeSectionId === "workflow" ? <ReceptionWorkflowDemo /> : null}
              {activeSectionId === "appearance" ? <AppearanceDemo /> : null}
              {activeSectionId === "ui-kit" ? <UiComponentDemo /> : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SettingsSidebar({
  activeSectionId,
}: {
  activeSectionId: SettingsSectionId;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-background px-4 py-5">
      <Button
        asChild
        className="mb-6 h-10 justify-start rounded-[14px] px-2.5 text-[15px] font-normal text-muted-foreground hover:text-foreground"
        variant="ghost"
      >
        <Link aria-label="返回应用" to="/chat">
          <HugeiconsIcon
            color="currentColor"
            icon={ArrowLeft01Icon}
            size={20}
            strokeWidth={1.8}
          />
          <span>返回应用</span>
        </Link>
      </Button>

      <nav aria-label="设置菜单" className="space-y-1">
        {settingsSections.map((section) => {
          const isActive = section.id === activeSectionId;

          return (
            <NavLink
              className={cn(
                "flex h-12 items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium transition-colors",
                isActive
                  ? "bg-surface-hover text-foreground"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
              key={section.id}
              to={section.path}
            >
              <HugeiconsIcon
                color="currentColor"
                icon={section.icon}
                size={22}
                strokeWidth={1.8}
              />
              <span>{section.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

function PageHeader({
  title,
  eyebrow,
  description,
}: {
  title: string;
  eyebrow: string;
  description: string;
}) {
  return (
    <header className="mb-7">
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <HugeiconsIcon
          color="currentColor"
          icon={Settings03Icon}
          size={14}
          strokeWidth={1.8}
        />
        <span>{eyebrow}</span>
      </div>
      <h1 className="mt-2 text-[26px] font-semibold tracking-normal text-foreground">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

function QywxAccountDemo() {
  return (
    <>
      <PageHeader
        description="典型列表页结构：筛选栏、批量操作、状态列、行内操作和分页区域，后续接真实 API 时可替换数据源。"
        eyebrow="DEMO / CRUD"
        title="企微账号"
      />

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative w-[280px]">
            <HugeiconsIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              color="currentColor"
              icon={Search01Icon}
              size={17}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索企微账号"
              className="h-10 rounded-[8px] bg-background pl-9 shadow-none"
              placeholder="搜索企微账号"
            />
          </div>

          <Select defaultValue="all">
            <SelectTrigger
              aria-label="筛选接待状态"
              className="h-10 min-w-[180px] rounded-[8px] bg-background text-sm shadow-none"
            >
              <SelectValue placeholder="筛选接待状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部接待状态</SelectItem>
              <SelectItem value="normal">正常</SelectItem>
              <SelectItem value="idle">无人接待</SelectItem>
              <SelectItem value="offline">离线</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="h-10 rounded-[10px] px-4" type="button">
          <HugeiconsIcon
            color="currentColor"
            icon={Add01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <span>新增账号</span>
        </Button>
      </section>

      <section className="mt-6 overflow-hidden rounded-[10px] border border-border bg-background">
        <Table aria-label="企微账号列表">
          <TableHeader className="bg-surface-muted">
            <TableRow>
              <TableHead className="w-[34%] px-5 py-4">企微账号</TableHead>
              <TableHead className="w-[14%] px-5 py-4">接待状态</TableHead>
              <TableHead className="w-[28%] px-5 py-4">关联子账号</TableHead>
              <TableHead className="px-5 py-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qywxAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-[8px] bg-info-muted text-info">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={UserGroup03Icon}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{account.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{account.id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-5 py-5">
                  <StatusText tone={account.statusTone}>{account.status}</StatusText>
                </TableCell>
                <TableCell className="px-5 py-5 text-muted-foreground">
                  {account.subAccounts}
                </TableCell>
                <TableCell className="px-5 py-5">
                  <div className="flex items-center gap-2">
                    <Button
                      aria-label={`编辑 ${account.name}`}
                      className="size-8 rounded-[8px]"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={Edit02Icon}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </Button>
                    <Button
                      className="h-8 rounded-[8px] px-3 text-primary"
                      type="button"
                      variant="ghost"
                    >
                      关联子账号
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <DemoNotes
        items={[
          "筛选条件建议沉淀为 query params，便于复制链接和回放问题。",
          "表格操作使用图标按钮承载编辑、删除等高频动作，主动作保留文字。",
          "接真实接口时，可从 src/pages/chat/api 新增 settings service，再统一走 src/lib/request.ts。",
        ]}
      />
    </>
  );
}

function SubAccountDemo() {
  return (
    <>
      <PageHeader
        description="典型编辑页结构：基础信息、角色归属、开关项和底部操作条，可作为新建 / 编辑表单模板。"
        eyebrow="DEMO / FORM"
        title="子账号管理"
      />

      <form
        aria-label="子账号表单"
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <section className="space-y-5 rounded-[10px] border border-border bg-background p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="员工姓名">
              <Input id="employee-name" placeholder="请输入员工姓名" />
            </Field>
            <Field label="手机号">
              <Input id="employee-phone" placeholder="用于登录和通知" />
            </Field>
            <Field label="所属部门">
              <Select defaultValue="support">
                <SelectTrigger id="employee-team" className="h-11 w-full rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">客服一组</SelectItem>
                  <SelectItem value="sales">销售支持</SelectItem>
                  <SelectItem value="quality">质检运营</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="账号角色">
              <Select defaultValue="agent">
                <SelectTrigger id="employee-role" className="h-11 w-full rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="lead">组长</SelectItem>
                  <SelectItem value="agent">客服</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="备注">
            <Textarea
              id="employee-note"
              placeholder="记录排班偏好、擅长品类或接待注意事项"
            />
          </Field>

          <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-muted px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">允许接待群聊</p>
              <p className="mt-1 text-xs text-muted-foreground">
                关闭后该员工只会出现在单聊接待池。
              </p>
            </div>
            <Switch aria-label="允许接待群聊" defaultChecked />
          </div>
        </section>

        <aside className="space-y-4 rounded-[10px] border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">账号预览</h2>
          <div className="rounded-[10px] bg-surface-muted p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                梁
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">梁小满</p>
                <p className="mt-1 text-xs text-muted-foreground">客服一组 / 客服</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">单聊</Badge>
              <Badge variant="outline">群聊</Badge>
              <Badge variant="outline">质检可见</Badge>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button className="rounded-[10px]" type="button" variant="outline">
              取消
            </Button>
            <Button className="rounded-[10px]" type="button">
              保存
            </Button>
          </div>
        </aside>
      </form>
    </>
  );
}

function RolePermissionDemo() {
  return (
    <>
      <PageHeader
        description="典型权限矩阵：角色列、能力列、开关和危险操作入口，适合后续对接 RBAC 或团队权限模型。"
        eyebrow="DEMO / RBAC"
        title="权限角色"
      />

      <section className="overflow-hidden rounded-[10px] border border-border bg-background">
        <Table aria-label="角色权限矩阵">
          <TableHeader className="bg-surface-muted">
            <TableRow>
              <TableHead className="px-5 py-4">角色</TableHead>
              <TableHead className="px-5 py-4">会话接待</TableHead>
              <TableHead className="px-5 py-4">账号管理</TableHead>
              <TableHead className="px-5 py-4">数据导出</TableHead>
              <TableHead className="px-5 py-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.name}>
                <TableCell className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <HugeiconsIcon
                      className="text-primary"
                      color="currentColor"
                      icon={SecurityCheckIcon}
                      size={18}
                      strokeWidth={1.8}
                    />
                    <div>
                      <p className="font-medium text-foreground">{role.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    </div>
                  </div>
                </TableCell>
                {role.permissions.map((permission) => (
                  <TableCell className="px-5 py-5" key={permission.label}>
                    <Label className="text-foreground">
                      <Checkbox defaultChecked={permission.enabled} />
                      <span>{permission.label}</span>
                    </Label>
                  </TableCell>
                ))}
                <TableCell className="px-5 py-5">
                  <Button
                    aria-label={`删除角色 ${role.name}`}
                    className="size-8 rounded-[8px] text-destructive"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Delete02Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

function ReceptionWorkflowDemo() {
  return (
    <>
      <PageHeader
        description="典型配置页：策略选择、数值阈值、布尔开关和说明性状态，可作为系统配置类页面模板。"
        eyebrow="DEMO / CONFIG"
        title="接待配置"
      />

      <section className="grid gap-4 lg:grid-cols-3">
        {workflowOptions.map((option) => (
          <div
            className="rounded-[10px] border border-border bg-background p-5"
            key={option.title}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-info-muted text-info">
                <HugeiconsIcon
                  color="currentColor"
                  icon={option.icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <Switch aria-label={`启用${option.title}`} defaultChecked={option.enabled} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">{option.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {option.description}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-4 rounded-[10px] border border-border bg-background p-5 md:grid-cols-3">
        <Field label="自动转接等待时间">
          <Input id="handoff-wait" defaultValue="90 秒" />
        </Field>
        <Field label="单客服最大接待量">
          <Input id="max-load" defaultValue="8 个会话" />
        </Field>
        <Field label="质检抽样比例">
          <Input id="qa-ratio" defaultValue="15%" />
        </Field>
      </section>
    </>
  );
}

function AppearanceDemo() {
  return (
    <>
      <PageHeader
        description="典型偏好设置页：主题、密度、消息展示和通知偏好，供后续接入用户级配置。"
        eyebrow="DEMO / PREFERENCE"
        title="外观"
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <PreferenceOption
          description="适合白天办公环境，保持表格和聊天区域的最大可读性。"
          icon={Sun01Icon}
          title="浅色模式"
        />
        <PreferenceOption
          description="适合弱光环境，当前只作为配置入口示例。"
          icon={Moon02Icon}
          title="深色模式"
        />
      </section>

      <section className="mt-5 rounded-[10px] border border-border bg-background p-5">
        <h2 className="text-base font-semibold text-foreground">工作台密度</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["舒适", "标准", "紧凑"].map((density) => (
            <button
              className="rounded-[10px] border border-border bg-surface px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
              key={density}
              type="button"
            >
              {density}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function UiComponentDemo() {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    new Date(2026, 4, 7),
  );

  return (
    <>
      <PageHeader
        description="基础组件参考页：弹窗、确认框、单选组、Tooltip、Calendar 和 Toast，方便开发设置类页面时直接复制局部结构。"
        eyebrow="DEMO / UI KIT"
        title="组件示例"
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_23rem]">
        <div className="space-y-4">
          <section className="rounded-[10px] border border-border bg-background p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  弹窗与确认流程
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  用于编辑表单、危险操作确认和需要阻断当前任务的短流程。
                </p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="查看弹窗使用说明"
                      className="size-9 rounded-[8px]"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={HelpCircleIcon}
                        size={17}
                        strokeWidth={1.8}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    优先用于短表单和破坏性确认
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="rounded-[10px]" type="button">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Edit02Icon}
                      size={17}
                      strokeWidth={1.8}
                    />
                    打开编辑弹窗
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>编辑接待策略</DialogTitle>
                    <DialogDescription>
                      典型设置表单弹窗，适合低字段量的快速编辑场景。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <Field label="策略名称">
                      <Input id="strategy-name" defaultValue="自动分配" />
                    </Field>
                    <Field label="说明">
                      <Textarea
                        id="strategy-description"
                        defaultValue="按在线状态、当前负载和历史关系分配新会话。"
                      />
                    </Field>
                  </div>
                  <DialogFooter>
                    <Button className="rounded-[10px]" type="button" variant="outline">
                      取消
                    </Button>
                    <Button className="rounded-[10px]" type="button">
                      保存
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="rounded-[10px]" type="button" variant="outline">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={AlertCircleIcon}
                      size={17}
                      strokeWidth={1.8}
                    />
                    打开停用确认
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive-muted text-destructive">
                      <HugeiconsIcon
                        color="currentColor"
                        icon={AlertCircleIcon}
                        size={30}
                        strokeWidth={1.8}
                      />
                    </AlertDialogMedia>
                    <AlertDialogTitle>停用接待策略</AlertDialogTitle>
                    <AlertDialogDescription>
                      停用后新会话不会再按该策略分配，已有会话不受影响。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction variant="default">确认停用</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                className="rounded-[10px]"
                onClick={() => {
                  toast.success("配置已保存", {
                    description: "DEMO 中的 Toast 已接入全局 Toaster。",
                  });
                }}
                type="button"
                variant="secondary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Notification03Icon}
                  size={17}
                  strokeWidth={1.8}
                />
                触发 Toast
              </Button>
            </div>
          </section>

          <section className="rounded-[10px] border border-border bg-background p-5">
            <h2 className="text-base font-semibold text-foreground">单选组模板</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              用于互斥策略、展示密度、通知等级等单选配置。
            </p>

            <RadioGroup
              aria-label="分配策略"
              className="mt-5 grid gap-3 md:grid-cols-3"
              defaultValue="load"
            >
              {routingStrategies.map((strategy) => (
                <Label
                  className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                  key={strategy.value}
                >
                  <RadioGroupItem className="mt-0.5" value={strategy.value} />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {strategy.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {strategy.description}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[10px] border border-border bg-background p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-info-muted text-info">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Calendar03Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">日期选择</h2>
                <p className="mt-1 text-xs text-muted-foreground">Calendar 单选示例</p>
              </div>
            </div>

            <Label className="sr-only" id="schedule-date-label">
              排班日期
            </Label>
            <div
              aria-labelledby="schedule-date-label"
              className="mt-4 overflow-x-auto rounded-[10px] border border-border bg-surface-muted"
              role="group"
            >
              <Calendar
                mode="single"
                onSelect={setSelectedDate}
                selected={selectedDate}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              当前日期：
              <span className="font-medium text-foreground">
                {selectedDate?.toLocaleDateString("zh-CN") ?? "未选择"}
              </span>
            </p>
          </section>

          <section className="rounded-[10px] border border-border bg-background p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-success-muted text-success">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Database01Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">已补充组件</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  统一放在 src/components/ui
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Dialog", "AlertDialog", "RadioGroup", "Tooltip", "Calendar", "Sonner"].map(
                (component) => (
                  <Badge key={component} variant="outline">
                    {component}
                  </Badge>
                ),
              )}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = getElementId(children);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function StatusText({
  tone,
  children,
}: {
  tone: "success" | "danger" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-sm font-semibold",
        tone === "success" && "text-success",
        tone === "danger" && "text-destructive",
        tone === "muted" && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function DemoNotes({ items }: { items: string[] }) {
  return (
    <section className="mt-6 rounded-[10px] border border-border bg-info-muted p-5">
      <h2 className="text-sm font-semibold text-foreground">开发接入提示</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li className="flex gap-2" key={item}>
            <span className="mt-[9px] size-1.5 rounded-full bg-info" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreferenceOption({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: IconSvgElement;
}) {
  return (
    <button
      className="rounded-[10px] border border-border bg-background p-5 text-left transition-colors hover:bg-surface-hover"
      type="button"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-[10px] bg-surface-muted text-foreground">
          <HugeiconsIcon
            color="currentColor"
            icon={icon}
            size={18}
            strokeWidth={1.8}
          />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </button>
  );
}

function getElementId(children: React.ReactNode) {
  if (React.isValidElement<{ id?: string }>(children)) {
    return children.props.id;
  }

  return undefined;
}

const qywxAccounts = [
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

const roles = [
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

const workflowOptions = [
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

const routingStrategies = [
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
