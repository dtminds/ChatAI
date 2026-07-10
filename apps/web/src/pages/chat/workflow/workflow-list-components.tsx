import {
  AlertCircleIcon,
  Delete02Icon,
  Edit02Icon,
  MoreHorizontalIcon,
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
import { Link } from "react-router-dom";
import type { WorkflowListItem } from "./workflow-draft-service";

export function WorkflowListRow({
  onDelete,
  onRename,
  workflow,
}: {
  onDelete: () => void;
  onRename: () => void;
  workflow: WorkflowListItem;
}) {
  return (
    <article className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(0,1.5fr)_0.8fr_0.8fr_0.7fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={WorkflowSquare01Icon} size={16} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{workflow.name}</h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">{workflow.trigger}</p>
          </div>
        </div>
      </div>
      <MetricPill label="进入" value={workflow.entered} />
      <MetricPill label="转化" value={workflow.conversion} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge
          className="rounded-md"
          variant={workflow.status === "Published" ? "default" : "secondary"}
        >
          {workflow.status}
        </Badge>
        <span>{workflow.nodes} 节点</span>
      </div>
      <div className="flex items-center justify-between gap-3 lg:justify-end">
        <div className="text-right text-xs text-muted-foreground">
          <div>{workflow.updatedAt}</div>
          <div className="mt-0.5">{workflow.owner}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild className="h-8 rounded-lg px-2.5 text-xs" variant="outline">
            <Link rel="noopener noreferrer" target="_blank" to={`/chat/workflows/${workflow.id}`}>编辑</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={`操作 ${workflow.name}`} className="size-8" size="icon" variant="ghost">
                <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRename}>
                <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} />
                重命名
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          maxLength={80}
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

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-2 py-1.5 text-xs">
      <div className="font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 text-muted-foreground">{label}</div>
    </div>
  );
}
