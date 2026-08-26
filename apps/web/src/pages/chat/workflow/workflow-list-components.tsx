import {
  AlertCircleIcon,
  Delete01Icon,
  Edit02Icon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  StopCircleIcon,
  Tick02Icon,
  WorkflowSquare01Icon,
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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

export type WorkflowLifecycleAction = "enable" | "pause" | "resume" | "stop";

export function WorkflowListTable({
  loading,
  onDelete,
  onLifecycleAction,
  onRename,
  operationPendingId,
  workflows,
}: {
  loading: boolean;
  onDelete: (workflow: WorkflowListItem) => void;
  onLifecycleAction: (workflow: WorkflowListItem, action: WorkflowLifecycleAction) => void;
  onRename: (workflow: WorkflowListItem) => void;
  operationPendingId: string | null;
  workflows: WorkflowListItem[];
}) {
  return (
    <Table aria-label="工作流列表" className="min-w-[1200px] table-fixed">
      <colgroup>
        <col className="w-[240px]" />
        <col className="w-[250px]" />
        <col className="w-[190px]" />
        <col className="w-[120px]" />
        <col className="w-[170px]" />
        <col className="w-[130px]" />
        <col className="w-[100px]" />
      </colgroup>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-11 px-4">工作流名称</TableHead>
          <TableHead className="h-11 px-4">触发条件</TableHead>
          <TableHead className="h-11 whitespace-nowrap px-4">托管账号</TableHead>
          <TableHead className="h-11 whitespace-nowrap px-4">总运行数</TableHead>
          <TableHead className="h-11 whitespace-nowrap px-4">最近一次运行</TableHead>
          <TableHead className="h-11 px-4">状态</TableHead>
          <TablePinnedHead className="h-11 whitespace-nowrap px-4 text-right">操作</TablePinnedHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell className="py-10 text-center" colSpan={7}>
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner aria-hidden="true" size={14} />
                <span>正在加载</span>
              </div>
            </TableCell>
          </TableRow>
        ) : workflows.length === 0 ? (
          <TableRow>
            <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={7}>暂无数据</TableCell>
          </TableRow>
        ) : workflows.map(workflow => (
          <WorkflowListRow
            key={workflow.id}
            onDelete={() => onDelete(workflow)}
            onLifecycleAction={action => onLifecycleAction(workflow, action)}
            onRename={() => onRename(workflow)}
            operationPending={operationPendingId === workflow.id}
            workflow={workflow}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function WorkflowListRow({
  onDelete,
  onLifecycleAction,
  onRename,
  operationPending,
  workflow,
}: {
  onDelete: () => void;
  onLifecycleAction: (action: WorkflowLifecycleAction) => void;
  onRename: () => void;
  operationPending: boolean;
  workflow: WorkflowListItem;
}) {
  const status = getWorkflowStatus(workflow);

  return (
    <TableRow>
      <TableCell className="px-4 py-4 font-medium text-foreground">
        <Link
          aria-label={`打开 ${workflow.name}`}
          className="block min-w-0 max-w-full text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          to={`/chat/workflows/${workflow.id}`}
        >
          <TableCellContent className="font-medium text-foreground">{workflow.name}</TableCellContent>
        </Link>
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground" title={workflow.trigger}>
        <TableCellContent>{workflow.trigger || "-"}</TableCellContent>
      </TableCell>
      <TableCell className="px-4 py-4">
        <WorkflowManagedAccountsPreview workflow={workflow} />
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground tabular-nums">
        {workflow.totalRunCount.toLocaleString("zh-CN")}
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground">
        {workflow.lastRunAt ?? "-"}
      </TableCell>
      <TableCell className="px-4 py-4">
        <Badge className={cn("w-fit gap-1 rounded-md px-1.5 py-0.5", status.className)}>
          <HugeiconsIcon icon={status.icon} size={12} strokeWidth={1.8} />
          {status.label}
        </Badge>
      </TableCell>
      <TablePinnedCell className="whitespace-nowrap px-4 py-4 text-right">
        <WorkflowRowMenu
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

function WorkflowRowMenu({
  onDelete,
  onLifecycleAction,
  onRename,
  operationPending,
  workflow,
}: {
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
          <Link to={`/chat/workflows/${workflow.id}`}>
            <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
            编辑工作流
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={workflow.runtimeStatus !== "active" || !workflow.canOperate || operationPending}
          onSelect={() => onLifecycleAction("pause")}
        >
            <HugeiconsIcon icon={PauseIcon} size={16} strokeWidth={1.8} />
            暂停
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!(["paused", "inactive"].includes(workflow.runtimeStatus))
            || workflow.publishedRevision === null || !workflow.canOperate || operationPending}
          onSelect={() => onLifecycleAction(workflow.runtimeStatus === "paused" ? "resume" : "enable")}
        >
            <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.8} />
            启用
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onRename}
        >
          <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
          编辑信息
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={!(["active", "paused"].includes(workflow.runtimeStatus))
            || !workflow.canOperate || operationPending}
          onSelect={() => onLifecycleAction("stop")}
        >
          <HugeiconsIcon icon={StopCircleIcon} size={16} strokeWidth={1.8} />
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
  error,
  onDelete,
  onOpenChange,
  open,
  pending,
}: {
  error: string | null;
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
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
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
          <HugeiconsIcon icon={onRetry ? AlertCircleIcon : WorkflowSquare01Icon} size={20} strokeWidth={1.8} />
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
    return { className: "bg-muted text-muted-foreground", icon: StopCircleIcon, label: "已停止" };
  }
  if (workflow.publishedRevision === null) {
    return { className: "bg-muted text-muted-foreground", icon: Edit02Icon, label: "草稿" };
  }
  if (workflow.runtimeStatus === "active") {
    return { className: "bg-success-muted text-success", icon: Tick02Icon, label: "运行中" };
  }
  if (workflow.runtimeStatus === "paused") {
    return { className: "bg-warning-muted text-warning", icon: PauseIcon, label: "待启用" };
  }
  return { className: "bg-muted text-muted-foreground", icon: PauseIcon, label: "未启用" };
}

export function splitWorkflowTriggers(trigger: string) {
  return trigger.split(/[、，,]/).map(item => item.trim()).filter(Boolean);
}
