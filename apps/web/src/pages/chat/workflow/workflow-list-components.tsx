import {
  AlertCircleIcon,
  DashboardCircleEditIcon,
  Delete01Icon,
  FileEditIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PlayCircle02Icon,
  ShutDownIcon,
  WorkflowSquare06Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconStack } from "@/components/ui/icon-stack";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import type { WorkflowListItem } from "./workflow-draft-service";
import { postSmpBasementChatEmbedNavigate } from "./workflow-embed-bridge";
import { WorkflowStatusBadge } from "./workflow-status-badge";

export type WorkflowLifecycleAction = "enable" | "pause" | "resume" | "stop";

export function WorkflowListTable({
  detailBasePath = "/chat/workflows",
  loading,
  notifyParentOnOpen = false,
  onDelete,
  onLifecycleAction,
  onRename,
  operationPendingId,
  workflows,
}: {
  detailBasePath?: string;
  loading: boolean;
  notifyParentOnOpen?: boolean;
  onDelete: (workflow: WorkflowListItem) => void;
  onLifecycleAction: (workflow: WorkflowListItem, action: WorkflowLifecycleAction) => void;
  onRename: (workflow: WorkflowListItem) => void;
  operationPendingId: string | null;
  workflows: WorkflowListItem[];
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border/40 bg-muted px-1 pb-1">
      <Table aria-label="列表" className="min-w-[1220px] table-fixed border-separate border-spacing-x-0 border-spacing-y-1">
        <colgroup>
          <col className="w-[300px]" />
          <col className="w-[120px]" />
          <col className="w-[180px]" />
          <col className="w-[350px]" />
          <col className="w-[180px]" />
          <col className="w-[90px]" />
        </colgroup>
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 px-3">名称</TableHead>
            <TableHead className="h-8 px-3">状态</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-3">托管账号</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-3">执行概览</TableHead>
            <TableHead className="h-8 whitespace-nowrap px-3">最近一次运行</TableHead>
            <TablePinnedHead className="h-8 whitespace-nowrap bg-muted/50 px-3 text-right">操作</TablePinnedHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell className="rounded-[8px] border border-border/70 bg-surface py-10 text-center" colSpan={6}>
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Spinner aria-hidden="true" size={14} />
                  <span>正在加载</span>
                </div>
              </TableCell>
            </TableRow>
          ) : workflows.length === 0 ? (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell className="rounded-[8px] border border-border/70 bg-surface text-center" colSpan={6}>
                <div className="flex flex-col items-center justify-center py-5">
                  <IconStack aria-hidden="true" className="mb-4 h-20 w-18">
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={WorkflowSquare06Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </IconStack>
                  <span className="text-sm text-muted-foreground">暂无数据</span>
                </div>
              </TableCell>
            </TableRow>
          ) : workflows.map(workflow => (
            <WorkflowListRow
              detailBasePath={detailBasePath}
              key={workflow.id}
              notifyParentOnOpen={notifyParentOnOpen}
              onDelete={() => onDelete(workflow)}
              onLifecycleAction={action => onLifecycleAction(workflow, action)}
              onRename={() => onRename(workflow)}
              operationPending={operationPendingId === workflow.id}
              workflow={workflow}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WorkflowListRow({
  detailBasePath,
  notifyParentOnOpen,
  onDelete,
  onLifecycleAction,
  onRename,
  operationPending,
  workflow,
}: {
  detailBasePath: string;
  notifyParentOnOpen: boolean;
  onDelete: () => void;
  onLifecycleAction: (action: WorkflowLifecycleAction) => void;
  onRename: () => void;
  operationPending: boolean;
  workflow: WorkflowListItem;
}) {
  const status = getWorkflowStatus(workflow);
  const editorPath = `${detailBasePath}/${workflow.id}`;

  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell className="rounded-l-[8px] border-y border-l border-border/70 bg-surface px-3 py-4">
        <Link
          aria-label={`打开 ${workflow.name}`}
          className="block min-w-0 max-w-full text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={() => {
            notifyParentWorkflowEditor(editorPath, notifyParentOnOpen);
          }}
          to={editorPath}
        >
          <TableCellContent className="font-medium text-foreground">{workflow.name}</TableCellContent>
        </Link>
        <div className="mt-1 flex min-w-0 items-center text-xs text-muted-foreground" title={workflow.trigger}>
          <span className="shrink-0">触发条件：</span>
          <TableCellContent>{workflow.trigger || "-"}</TableCellContent>
        </div>
      </TableCell>
      <TableCell className="border-y border-border/70 bg-surface px-3 py-4">
        <WorkflowStatusBadge variant={status.variant}>{status.label}</WorkflowStatusBadge>
      </TableCell>
      <TableCell className="border-y border-border/70 bg-surface px-3 py-4">
        <WorkflowManagedAccountsPreview workflow={workflow} />
      </TableCell>
      <TableCell className="border-y border-border/70 bg-surface px-3 py-4">
        <WorkflowRunOverview workflow={workflow} />
      </TableCell>
      <TableCell className="border-y border-border/70 bg-surface px-3 py-4 text-muted-foreground">
        {workflow.lastRunAt ?? "-"}
      </TableCell>
      <TablePinnedCell className="whitespace-nowrap rounded-r-[8px] border-y border-r border-border/70 px-3 py-4 text-right">
        <WorkflowRowMenu
          editorPath={editorPath}
          notifyParentOnOpen={notifyParentOnOpen}
          onDelete={onDelete}
          onLifecycleAction={onLifecycleAction}
          onRename={onRename}
          operationPending={operationPending}
          workflow={workflow}
        />
      </TablePinnedCell>
    </TableRow>
  );
}

function WorkflowRunOverview({ workflow }: { workflow: WorkflowListItem }) {
  const metrics = [
    {
      label: "总运行数",
      value: workflow.totalRunCount.toLocaleString("zh-CN"),
    },
    {
      label: "流程中",
      value: workflow.inProgressRunCount.toLocaleString("zh-CN"),
    },
    {
      label: "成功率",
      tone: workflow.successRatePercent === null ? undefined : "text-success",
      value: workflow.successRatePercent === null ? "-" : `${workflow.successRatePercent}%`,
    },
  ];

  return (
    <div className="grid grid-cols-3">
      {metrics.map((metric, index) => (
        <div
          className={cn(
            "relative min-w-0",
            index > 0 && "pl-4",
            index < metrics.length - 1 && "pr-4",
          )}
          key={metric.label}
        >
          {index > 0 ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 bg-border/80"
            />
          ) : null}
          <div className={cn("truncate font-medium tabular-nums text-foreground", metric.tone)}>
            {metric.value}
          </div>
          <div className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{metric.label}</div>
        </div>
      ))}
    </div>
  );
}

function WorkflowManagedAccountsPreview({ workflow }: { workflow: WorkflowListItem }) {
  if (workflow.managedAccountCount === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const visibleAccounts = workflow.managedAccounts.slice(0, 3);
  const hiddenCount = Math.max(workflow.managedAccountCount - visibleAccounts.length, 0);

  return (
    <div className="flex items-center">
      {visibleAccounts.map((account, index) => (
        <Avatar
          aria-label={`托管账号 ${account.name}`}
          className={cn("size-8 rounded-full border-2 border-surface", index === 0 ? undefined : "-ml-2")}
          key={account.id}
          title={account.name}
        >
          {account.avatarUrl ? <AvatarImage alt={account.name} src={account.avatarUrl} /> : null}
          <AvatarFallback className="rounded-full bg-primary/15 text-xs text-primary">
            {account.name.trim().slice(0, 1) || "?"}
          </AvatarFallback>
        </Avatar>
      ))}
      {hiddenCount > 0 ? (
        <span className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-muted text-xs font-semibold text-muted-foreground">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
}

function notifyParentWorkflowEditor(path: string, enabled: boolean) {
  if (enabled) {
    postSmpBasementChatEmbedNavigate(path, true);
  }
}

function WorkflowRowMenu({
  editorPath,
  notifyParentOnOpen,
  onDelete,
  onLifecycleAction,
  onRename,
  operationPending,
  workflow,
}: {
  editorPath: string;
  notifyParentOnOpen: boolean;
  onDelete: () => void;
  onLifecycleAction: (action: WorkflowLifecycleAction) => void;
  onRename: () => void;
  operationPending: boolean;
  workflow: WorkflowListItem;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`操作 ${workflow.name}`}
          className="size-8 p-0 text-muted-foreground"
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon aria-hidden="true" icon={MoreHorizontalIcon} size={18} strokeWidth={1.8} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            onClick={() => {
              notifyParentWorkflowEditor(editorPath, notifyParentOnOpen);
            }}
            to={editorPath}
          >
            <HugeiconsIcon icon={DashboardCircleEditIcon} size={16} strokeWidth={1.8} />
            编辑
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={workflow.runtimeStatus !== "active" || operationPending}
          onSelect={() => onLifecycleAction("pause")}
        >
            <HugeiconsIcon icon={PauseCircleIcon} size={16} strokeWidth={1.8} />
            暂停
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!(["paused", "inactive"].includes(workflow.runtimeStatus))
            || workflow.publishedRevision === null || operationPending}
          onSelect={() => onLifecycleAction(workflow.runtimeStatus === "paused" ? "resume" : "enable")}
        >
            <HugeiconsIcon icon={PlayCircle02Icon} size={16} strokeWidth={1.8} />
            启用
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onRename}
        >
          <HugeiconsIcon icon={FileEditIcon} size={16} strokeWidth={1.8} />
          重命名
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={!(["active", "paused"].includes(workflow.runtimeStatus))
            || operationPending}
          onSelect={() => onLifecycleAction("stop")}
        >
          <HugeiconsIcon icon={ShutDownIcon} size={16} strokeWidth={1.8} />
          停止
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
          <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.8} />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkflowDeleteDialog({
  onDelete,
  onOpenChange,
  open,
  pending,
}: {
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>确认要删除该 SOP 吗？</AlertDialogTitle>
          <AlertDialogDescription>删除后无法恢复</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onDelete();
            }}
            variant="destructive"
          >
            {pending ? "删除中" : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WorkflowStopDialog({
  onOpenChange,
  onStop,
  open,
  pending,
}: {
  onOpenChange: (open: boolean) => void;
  onStop: () => void;
  open: boolean;
  pending: boolean;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>确认要停止该 SOP 吗？</AlertDialogTitle>
          <AlertDialogDescription>停止后将无法恢复，未完成的审核也会失效</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onStop();
            }}
            variant="destructive"
          >
            {pending ? "停止中" : "停止"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WorkflowListState({
  description,
  onRetry,
  title,
}: {
  description?: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <Empty className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={onRetry ? AlertCircleIcon : WorkflowSquare06Icon} size={20} strokeWidth={1.8} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

function getWorkflowStatus(workflow: WorkflowListItem) {
  if (workflow.runtimeStatus === "stopped") {
    return { label: "已停止", variant: "neutral" as const };
  }
  if (workflow.publishedRevision === null) {
    return { label: "草稿", variant: "neutral" as const };
  }
  if (workflow.runtimeStatus === "active") {
    return { label: "运行中", variant: "success" as const };
  }
  return { label: "未启用", variant: "warning" as const };
}

export function splitWorkflowTriggers(trigger: string) {
  return trigger.split(/[、，,]/).map(item => item.trim()).filter(Boolean);
}
