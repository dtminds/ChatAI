import {
  AlertCircleIcon,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
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
      className="relative flex min-h-72 flex-col rounded-lg border bg-background p-4 shadow-xs transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge className={cn("rounded-md", status.className)}>{status.label}</Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`操作 ${workflow.name}`}
              className="relative z-10 -mr-1 -mt-1 size-8"
              size="icon"
              variant="ghost"
            >
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
            {workflow.runtimeStatus === "active" ? (
              <DropdownMenuItem
                disabled={!workflow.canOperate || operationPending}
                onSelect={() => onLifecycleAction("pause")}
              >
                <HugeiconsIcon icon={PauseIcon} size={16} strokeWidth={1.8} />
                暂停
              </DropdownMenuItem>
            ) : null}
            {workflow.runtimeStatus === "paused" ? (
              <DropdownMenuItem
                disabled={!workflow.canOperate || operationPending}
                onSelect={() => onLifecycleAction("resume")}
              >
                <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.8} />
                恢复
              </DropdownMenuItem>
            ) : null}
            {workflow.runtimeStatus !== "stopped" ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={onRename}>
              <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
              重命名
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
      </div>

      <div className="mt-4 min-w-0">
        <Link
          aria-label={`打开 ${workflow.name}`}
          className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring/40"
          to={`/chat/workflows/${workflow.id}`}
        >
          <h2 className="truncate text-base font-semibold" id={titleId}>{workflow.name}</h2>
        </Link>
        {workflow.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {workflow.description}
          </p>
        ) : null}
      </div>

      <div className="mt-5 min-w-0">
        <div className="text-xs text-muted-foreground">触发条件</div>
        <div className="mt-1 truncate text-sm text-foreground">{workflow.trigger}</div>
      </div>

      <div className="mt-auto pt-5">
        <div className="grid grid-cols-3 border-y py-3">
          <WorkflowMetric label="进入人数" value={workflow.entered} />
          <WorkflowMetric className="border-l pl-3" label="转化率" value={workflow.conversion} />
          <WorkflowMetric className="border-l pl-3" label="节点" value={String(workflow.nodes)} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">{workflow.owner}</span>
          <span className="shrink-0">{workflow.updatedAt}</span>
        </div>
      </div>
    </article>
  );
}

export function WorkflowRenameDialog({
  error,
  onCancel,
  onOpenChange,
  onRename,
  onValueChange,
  open,
  pending,
  value,
}: {
  error: string | null;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onValueChange: (value: string) => void;
  open: boolean;
  pending: boolean;
  value: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>重命名 Workflow</DialogTitle>
        </DialogHeader>
        <Input
          aria-label="Workflow 名称"
          autoFocus
          maxLength={100}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRename();
            }
          }}
          value={value}
        />
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button disabled={pending} onClick={onCancel} type="button" variant="outline">取消</Button>
          <Button disabled={!value.trim() || pending} onClick={onRename} type="button">
            {pending ? "保存中" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function WorkflowMetric({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("min-w-0 pr-2", className)}>
      <div className="truncate text-sm font-semibold text-foreground">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function getWorkflowStatus(workflow: WorkflowListItem) {
  if (workflow.runtimeStatus === "active") {
    return { className: "bg-success-muted text-success", label: "运行中" };
  }
  if (workflow.runtimeStatus === "paused") {
    return { className: "bg-warning-muted text-warning", label: "已暂停" };
  }
  if (workflow.runtimeStatus === "stopped") {
    return { className: "bg-muted text-muted-foreground", label: "已停止" };
  }
  if (workflow.status === "Published") {
    return { className: "bg-primary/10 text-primary", label: "已发布" };
  }
  return { className: "bg-muted text-muted-foreground", label: "草稿" };
}
