import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  CloudSavingDone01Icon,
  Edit02Icon,
  InformationCircleIcon,
  MoreHorizontalIcon,
  Time02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  WorkflowDraftPublishStatus,
  WorkflowDraftRestoreStatus,
  WorkflowDraftSaveStatus,
  WorkflowRepositoryErrorCode,
} from "../workflow-draft-service";

export function WorkflowTopBar({
  canPublish = true,
  canRename = false,
  canRetrySave = false,
  description = "",
  hasUnpublishedChanges = false,
  isPreviewingVersion,
  lastSavedAt,
  metadataUpdating = false,
  onBack,
  onExitPreview,
  onOpenVersionHistory,
  onPublish,
  onPublishCheck,
  onReloadDocument,
  onUpdateMetadata,
  onRetrySave,
  onRestoreVersion,
  previewVersionLabel,
  previewVersionMeta,
  publishErrorCode,
  publishState,
  publishReady,
  readyChecks,
  restoreState,
  runtimeStatus = "inactive",
  saveState,
  totalChecks,
  workflowName,
}: {
  canPublish?: boolean;
  canRename?: boolean;
  canRetrySave?: boolean;
  description?: string;
  hasUnpublishedChanges?: boolean;
  isPreviewingVersion?: boolean;
  lastSavedAt: string;
  metadataUpdating?: boolean;
  onBack?: () => void;
  onExitPreview?: () => void;
  onOpenVersionHistory: () => void;
  onPublish: () => void;
  onPublishCheck: () => void;
  onReloadDocument?: () => void;
  onUpdateMetadata?: (metadata: { description: string; name: string }) => Promise<boolean>;
  onRetrySave?: () => void;
  onRestoreVersion?: () => void;
  previewVersionLabel?: string;
  previewVersionMeta?: string;
  publishedAt: string | null;
  publishErrorCode?: WorkflowRepositoryErrorCode;
  publishState: WorkflowDraftPublishStatus;
  publishReady: boolean;
  readyChecks: number;
  restoreState?: WorkflowDraftRestoreStatus;
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
  saveState: WorkflowDraftSaveStatus;
  totalChecks: number;
  validatedForActivation?: boolean;
  workflowName: string;
}) {
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [nameValue, setNameValue] = useState(workflowName);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const published = publishState === "published";
  const publishing = publishState === "publishing";
  const restoring = restoreState === "restoring";
  const readOnlyMode = Boolean(isPreviewingVersion);

  useEffect(() => {
    if (!metadataDialogOpen) {
      setNameValue(workflowName);
      setDescriptionValue(description);
    }
  }, [description, metadataDialogOpen, workflowName]);

  const submitMetadata = async () => {
    const normalizedName = nameValue.trim();
    const normalizedDescription = descriptionValue.trim();

    if (!normalizedName) return;
    if (normalizedName === workflowName && normalizedDescription === description) {
      setMetadataDialogOpen(false);
      return;
    }

    if (onUpdateMetadata && await onUpdateMetadata({
      description: normalizedDescription,
      name: normalizedName,
    })) {
      setMetadataDialogOpen(false);
    }
  };

  return (
    <header className="workflow-canvas-topbar z-[12] flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4 max-sm:h-auto max-sm:min-h-14 max-sm:flex-wrap max-sm:py-2 max-sm:px-3">
      <div className="flex min-w-0 items-center gap-2.5 max-sm:w-full">
        <Button
          aria-label="返回 Workflow 列表"
          className="size-9 shrink-0 rounded-lg text-muted-foreground"
          onClick={onBack}
          size="icon"
          title="返回 Workflow 列表"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={19} strokeWidth={1.8} />
        </Button>

        {readOnlyMode ? (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold">{previewVersionLabel ?? "历史版本"}</h1>
              <span className="shrink-0 rounded-md border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                只读
              </span>
            </div>
            {previewVersionMeta ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">{previewVersionMeta}</p>
            ) : null}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <Badge className={getRuntimeStatusClassName(runtimeStatus)} variant="outline">
                {getRuntimeStatusLabel(runtimeStatus)}
              </Badge>
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
              <h1 className="truncate text-sm font-semibold">{workflowName}</h1>
              {description ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="查看 Workflow 描述"
                        className="size-6 shrink-0 rounded-md text-muted-foreground"
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={InformationCircleIcon} size={15} strokeWidth={1.8} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-80 whitespace-pre-wrap break-words" side="bottom" sideOffset={6}>
                      {description}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              {canRename ? (
                <Button
                  aria-label="编辑 Workflow 信息"
                  className="size-6 shrink-0 rounded-md text-muted-foreground"
                  onClick={() => setMetadataDialogOpen(true)}
                  size="icon"
                  title="编辑 Workflow 信息"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
                </Button>
              ) : null}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon className="shrink-0" icon={CloudSavingDone01Icon} size={14} strokeWidth={1.8} />
              {saveState === "error" && canRetrySave && onRetrySave ? (
                <button
                  className="rounded px-1 py-0.5 text-destructive hover:bg-destructive/10"
                  onClick={onRetrySave}
                  type="button"
                >
                  保存失败，重试
                </button>
              ) : (
                <span className="truncate" title={saveState === "saved" ? `上次保存：${lastSavedAt}` : undefined}>
                  {getSaveStateLabel(saveState, lastSavedAt)}
                </span>
              )}
              {hasUnpublishedChanges ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0 text-amber-600">有尚未发布的修改</span>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2" aria-label="Workflow 操作">
        {readOnlyMode ? (
          <>
            <Button
              disabled={!onRestoreVersion || restoring}
              onClick={onRestoreVersion}
              size="sm"
              type="button"
            >
              {restoring ? "恢复中" : "恢复"}
            </Button>
            <Button onClick={onExitPreview} size="sm" type="button" variant="secondary">
              退出版本
            </Button>
          </>
        ) : (
          <>
            <Button
              aria-label="版本历史"
              className="size-9 rounded-lg text-muted-foreground"
              onClick={onOpenVersionHistory}
              size="icon"
              title="版本历史"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Time02Icon} size={19} strokeWidth={1.8} />
            </Button>
            <Button
              className="h-9 rounded-lg px-5 text-sm font-semibold"
              disabled={!canPublish || !publishReady || published || publishing || saveState === "error" || publishErrorCode === "conflict"}
              onClick={onPublish}
              type="button"
            >
              {publishing ? "发布中" : published ? "已发布" : publishErrorCode ? "重新发布" : "发布"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="更多操作"
                  className="size-9 rounded-lg bg-muted text-muted-foreground"
                  size="icon"
                  title="更多操作"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={19} strokeWidth={1.8} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem disabled={!canPublish} onSelect={onPublishCheck}>
                  <HugeiconsIcon
                    icon={publishReady ? CheckmarkCircle02Icon : AlertCircleIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                  发布检查 {readyChecks}/{totalChecks}
                </DropdownMenuItem>
                {publishErrorCode === "conflict" && onReloadDocument ? (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onReloadDocument}>
                    <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} />
                    重新加载
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!metadataUpdating) setMetadataDialogOpen(open);
        }}
        open={metadataDialogOpen}
      >
        <DialogContent closeButtonDisabled={metadataUpdating}>
          <DialogHeader>
            <DialogTitle>编辑 Workflow 信息</DialogTitle>
            <DialogDescription>名称用于识别 Workflow，描述会展示在标题旁的信息提示中</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMetadata();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="workflow-metadata-name">Workflow 名称</label>
              <Input
                autoFocus
                id="workflow-metadata-name"
                maxLength={80}
                onChange={(event) => setNameValue(event.target.value)}
                readOnly={metadataUpdating}
                value={nameValue}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium" htmlFor="workflow-metadata-description">Workflow 描述</label>
                <span className="text-xs text-muted-foreground">{descriptionValue.length}/1000</span>
              </div>
              <Textarea
                id="workflow-metadata-description"
                maxLength={1000}
                onChange={(event) => setDescriptionValue(event.target.value)}
                placeholder="填写 Workflow 的用途或目标"
                readOnly={metadataUpdating}
                value={descriptionValue}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={!nameValue.trim() || metadataUpdating}
                type="submit"
              >
                {metadataUpdating ? "保存中" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function getRuntimeStatusLabel(status: "active" | "inactive" | "paused" | "stopped") {
  return {
    active: "执行中",
    inactive: "草稿",
    paused: "已暂停",
    stopped: "已停止",
  }[status];
}

function getRuntimeStatusClassName(status: "active" | "inactive" | "paused" | "stopped") {
  return cn(
    "shrink-0 rounded-md px-1.5 py-0.5",
    status === "active" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    status === "inactive" && "border-border bg-muted/60 text-muted-foreground",
    status === "paused" && "border-amber-200 bg-amber-50 text-amber-700",
    status === "stopped" && "border-border bg-muted/60 text-muted-foreground",
  );
}

function getSaveStateLabel(saveState: WorkflowDraftSaveStatus, lastSavedAt: string) {
  if (saveState === "error") return "保存失败";
  if (saveState === "dirty" || saveState === "saving") return "正在保存";
  return `已自动保存 ${lastSavedAt}`;
}
