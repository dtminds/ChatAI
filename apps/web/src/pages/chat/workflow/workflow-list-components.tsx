import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Edit02Icon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  StopCircleIcon,
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
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import type { WorkflowListItem } from "./workflow-draft-service";

export type WorkflowLifecycleAction = "enable" | "pause" | "resume" | "stop";

export function WorkflowListCard({
  onDelete,
  onLifecycleAction,
  onRename,
  operationPending = false,
  workflow,
}: {
  onDelete: () => void;
  onLifecycleAction: (action: WorkflowLifecycleAction) => void;
  onRename: () => void;
  operationPending?: boolean;
  workflow: WorkflowListItem;
}) {
  const status = getWorkflowStatus(workflow);
  const titleId = `workflow-card-title-${workflow.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="relative flex flex-col rounded-lg border bg-background p-4 shadow-xs transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-sm"
    >
      <Badge className={cn("w-fit gap-1 rounded-md px-1.5 py-0.5", status.className)}>
        <HugeiconsIcon icon={status.icon} size={12} strokeWidth={1.8} />
        {status.label}
      </Badge>

      <div className="mt-2 min-w-0">
        <Link
          aria-label={`打开 ${workflow.name}`}
          className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring/40"
          to={`/chat/workflows/${workflow.id}`}
        >
          <h2 className="truncate text-base font-semibold" id={titleId}>{workflow.name}</h2>
        </Link>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
          {workflow.description || "暂无描述"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <WorkflowMetric label="进入人数" value={workflow.entered} />
        <WorkflowMetric label="转化率" value={workflow.conversion} />
      </div>

      <div className="mt-4 border-t border-dashed pt-3">
        <div className="text-xs text-muted-foreground">触发条件</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {splitWorkflowTriggers(workflow.trigger).map(trigger => (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-foreground" key={trigger}>
              {trigger}
            </span>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-4 flex items-center gap-2">
        <WorkflowPrimaryAction
          onLifecycleAction={onLifecycleAction}
          operationPending={operationPending}
          workflow={workflow}
        />
        <WorkflowCardMenu
          onDelete={onDelete}
          onLifecycleAction={onLifecycleAction}
          onRename={onRename}
          operationPending={operationPending}
          workflow={workflow}
        />
      </div>
    </article>
  );
}

function WorkflowPrimaryAction({
  onLifecycleAction,
  operationPending,
  workflow,
}: {
  onLifecycleAction: (action: WorkflowLifecycleAction) => void;
  operationPending: boolean;
  workflow: WorkflowListItem;
}) {
  if (workflow.runtimeStatus === "active") {
    return (
      <Button
        className="h-8 flex-1 gap-1.5"
        disabled={!workflow.canOperate || operationPending}
        onClick={() => onLifecycleAction("pause")}
        size="sm"
        variant="outline"
      >
        <HugeiconsIcon icon={PauseIcon} size={15} strokeWidth={1.8} />
        暂停
      </Button>
    );
  }

  if (workflow.runtimeStatus === "paused") {
    return (
      <Button
        className="h-8 flex-1 gap-1.5"
        disabled={!workflow.canOperate || operationPending}
        onClick={() => onLifecycleAction("resume")}
        size="sm"
        variant="secondary"
      >
        <HugeiconsIcon icon={PlayIcon} size={15} strokeWidth={1.8} />
        恢复
      </Button>
    );
  }

  return (
    <Button asChild className="h-8 flex-1 gap-1.5" size="sm" variant="outline">
      <Link to={`/chat/workflows/${workflow.id}`}>
        <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
        编辑
      </Link>
    </Button>
  );
}

function WorkflowCardMenu({
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
        <Button aria-label={`操作 ${workflow.name}`} className="size-8" size="icon" variant="outline">
          <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {workflow.runtimeStatus === "inactive" ? (
          <DropdownMenuItem
            disabled={!workflow.canOperate || operationPending}
            onSelect={() => onLifecycleAction("enable")}
          >
            <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.8} />
            启用
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onRename}>
          <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
          编辑信息
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {workflow.runtimeStatus === "active" || workflow.runtimeStatus === "paused" ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={!workflow.canOperate || operationPending}
            onSelect={() => onLifecycleAction("stop")}
          >
            <HugeiconsIcon icon={StopCircleIcon} size={16} strokeWidth={1.8} />
            停止
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
          <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
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
          <AlertDialogTitle>删除 Workflow</AlertDialogTitle>
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

export function WorkflowListState({
  description,
  onRetry,
  title,
}: {
  description: string;
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
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button onClick={onRetry} size="sm" type="button" variant="outline">重试</Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

function WorkflowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold text-foreground">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function getWorkflowStatus(workflow: WorkflowListItem) {
  if (workflow.runtimeStatus === "active") {
    return { className: "bg-success-muted text-success", icon: CheckmarkCircle02Icon, label: "运行中" };
  }
  if (workflow.runtimeStatus === "paused") {
    return { className: "bg-warning-muted text-warning", icon: PauseIcon, label: "已暂停" };
  }
  if (workflow.runtimeStatus === "stopped") {
    return { className: "bg-muted text-muted-foreground", icon: StopCircleIcon, label: "已停止" };
  }
  if (workflow.status === "Published") {
    return { className: "bg-primary/10 text-primary", icon: CheckmarkCircle02Icon, label: "已发布" };
  }
  return { className: "bg-muted text-muted-foreground", icon: Edit02Icon, label: "草稿" };
}

export function splitWorkflowTriggers(trigger: string) {
  return trigger.split(/[、，,]/).map(item => item.trim()).filter(Boolean);
}
