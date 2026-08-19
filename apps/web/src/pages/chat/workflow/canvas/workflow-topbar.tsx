import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  CloudSavingDone01Icon,
  Edit02Icon,
  HistoryIcon,
  InformationCircleIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import type { WorkflowPublishReview } from "@chatai/contracts";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { WorkflowMetadataDialog } from "../workflow-metadata-dialog";

export function WorkflowTopBar({
  canEdit = true,
  canOperate = true,
  canPublish = true,
  canRename = false,
  canRetrySave = false,
  description = "",
  hasUnpublishedChanges = false,
  isPreviewingVersion,
  lastSavedAt,
  metadataUpdating = false,
  mode = "design",
  onBack,
  onCloseVersionHistory,
  onExitPreview,
  onOpenVersionHistory,
  onOpenReview = () => undefined,
  onPublish,
  onSubmitReview = () => undefined,
  onWithdrawReview,
  onEnable,
  onPublishCheck,
  onReloadDocument,
  onModeChange,
  onUpdateMetadata,
  onRetrySave,
  onRestoreVersion,
  previewVersionLabel,
  previewVersionMeta,
  publishErrorCode,
  publishState,
  publishReady,
  currentReview,
  reviewActionState = "idle",
  lifecycleActionState = "idle",
  publishedRevision,
  restoreState,
  runtimeStatus = "inactive",
  saveState,
  versionHistoryContent,
  versionHistoryOpen = false,
  workflowName,
  dataActions,
}: {
  canEdit?: boolean;
  canOperate?: boolean;
  canPublish?: boolean;
  canRename?: boolean;
  canRetrySave?: boolean;
  description?: string;
  hasUnpublishedChanges?: boolean;
  isPreviewingVersion?: boolean;
  lastSavedAt: string;
  metadataUpdating?: boolean;
  mode?: "data" | "design";
  onBack?: () => void;
  onCloseVersionHistory?: () => void;
  onExitPreview?: () => void;
  onOpenVersionHistory: () => void;
  onOpenReview?: () => void;
  onPublish: () => void;
  onSubmitReview?: () => void;
  onWithdrawReview?: () => Promise<boolean>;
  onEnable?: () => Promise<boolean>;
  onPublishCheck: () => void;
  onReloadDocument?: () => void;
  onModeChange?: (mode: "data" | "design") => void;
  onUpdateMetadata?: (metadata: { description: string; name: string }) => Promise<boolean>;
  onRetrySave?: () => void;
  onRestoreVersion?: () => void;
  previewVersionLabel?: string;
  previewVersionMeta?: string;
  publishedAt: string | null;
  publishErrorCode?: WorkflowRepositoryErrorCode;
  publishState: WorkflowDraftPublishStatus;
  publishReady: boolean;
  currentReview?: WorkflowPublishReview | null;
  reviewActionState?: "idle" | "submitting" | "approving" | "rejecting" | "withdrawing";
  lifecycleActionState?: "idle" | "enabling";
  publishedRevision?: number | null;
  restoreState?: WorkflowDraftRestoreStatus;
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
  saveState: WorkflowDraftSaveStatus;
  versionHistoryContent?: ReactNode;
  versionHistoryOpen?: boolean;
  workflowName: string;
  dataActions?: ReactNode;
}) {
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const publishing = publishState === "publishing";
  const restoring = restoreState === "restoring";
  const versionPreviewMode = Boolean(isPreviewingVersion);
  const stoppedReadOnly = runtimeStatus === "stopped";
  const contentContextLabel = getContentContextLabel(
    mode,
    currentReview,
    publishedRevision ?? null,
    hasUnpublishedChanges,
  );

  return (
    <header className="workflow-canvas-topbar relative z-[12] flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4 max-sm:h-auto max-sm:min-h-14 max-sm:flex-wrap max-sm:py-2 max-sm:px-3">
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

        {versionPreviewMode ? (
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
              <Badge className={getRuntimeStatusClassName(runtimeStatus, publishedRevision ?? null)}>
                {getWorkflowStatusLabel({
                  publishedRevision: publishedRevision ?? null,
                  runtimeStatus,
                })}
              </Badge>
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
              <h1 className="truncate text-sm font-semibold">{workflowName}</h1>
              {stoppedReadOnly ? (
                <span className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  只读
                </span>
              ) : null}
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
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
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
              {hasUnpublishedChanges && publishedRevision !== null ? (
                <span className="inline-flex shrink-0 items-center gap-1 !rounded-[2px] bg-warning-muted px-1.5 py-0.5 text-warning">
                  <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={2} />
                  有尚未发布的修改
                </span>
              ) : null}
              {contentContextLabel ? (
                <span className="shrink-0 text-muted-foreground">
                  {contentContextLabel}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {!versionPreviewMode && onModeChange ? (
        <div
          aria-label="Workflow 模式"
          className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 items-center gap-8 max-md:static max-md:h-auto max-md:translate-x-0"
          role="tablist"
        >
          {(["design", "data"] as const).map(item => (
            <button
              aria-selected={mode === item}
              className={cn(
                "relative flex h-full min-w-12 items-center justify-center text-base text-muted-foreground transition-colors",
                mode === item && "font-medium text-primary after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-primary",
              )}
              key={item}
              onClick={() => onModeChange(item)}
              role="tab"
              type="button"
            >
              {item === "design" ? "设计" : "数据"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-2" aria-label="Workflow 操作">
        {versionPreviewMode ? (
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
        ) : mode === "data" ? (
          dataActions
        ) : (
          <>
            <Popover
              onOpenChange={(open) => {
                if (open) onOpenVersionHistory();
                else onCloseVersionHistory?.();
              }}
              open={versionHistoryOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  className="h-9 rounded-lg px-3 text-muted-foreground"
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <HugeiconsIcon icon={HistoryIcon} size={17} strokeWidth={1.8} />
                  版本历史
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                aria-label="版本历史面板"
                className="z-[80] max-h-[min(36rem,calc(100vh-5rem))] w-[268px] overflow-hidden rounded-xl p-0"
                role="dialog"
                sideOffset={8}
              >
                {versionHistoryContent}
              </PopoverContent>
            </Popover>
            {!stoppedReadOnly ? (
              <>
                {currentReview?.status === "pending" ? (
                  <>
                    {runtimeStatus === "inactive" && publishedRevision !== null && onEnable ? (
                      <Button
                        disabled={!canOperate || lifecycleActionState !== "idle"}
                        onClick={() => void onEnable()}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {lifecycleActionState === "enabling" ? "启用中" : "启用已发布版本"}
                      </Button>
                    ) : null}
                    <Button
                      disabled={reviewActionState !== "idle"}
                      onClick={() => setWithdrawConfirmOpen(true)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      撤回审核
                    </Button>
                    <Button onClick={onOpenReview} size="sm" type="button">审核</Button>
                  </>
                ) : currentReview?.status === "approved" ? (
                  <>
                    {runtimeStatus === "inactive" && publishedRevision !== null && onEnable ? (
                      <Button
                        disabled={!canOperate || lifecycleActionState !== "idle"}
                        onClick={() => void onEnable()}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {lifecycleActionState === "enabling" ? "启用中" : "启用已发布版本"}
                      </Button>
                    ) : null}
                    <Button
                      className="h-9 rounded-lg px-5 text-sm font-semibold"
                      disabled={!canPublish || publishing || saveState !== "saved"}
                      onClick={() => setPublishConfirmOpen(true)}
                      type="button"
                    >
                      {publishing ? "发布中" : "发布"}
                    </Button>
                  </>
                ) : hasUnpublishedChanges ? (
                  <>
                    {runtimeStatus === "inactive" && publishedRevision !== null && onEnable ? (
                      <Button
                        disabled={!canOperate || lifecycleActionState !== "idle"}
                        onClick={() => void onEnable()}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {lifecycleActionState === "enabling" ? "启用中" : "启用已发布版本"}
                      </Button>
                    ) : null}
                    <Button
                      className="h-9 rounded-lg px-5 text-sm font-semibold"
                      disabled={!canEdit || reviewActionState !== "idle" || saveState === "error" || publishErrorCode === "conflict"}
                      onClick={onSubmitReview}
                      type="button"
                    >
                      {reviewActionState === "submitting"
                        ? "提交中"
                        : currentReview?.status === "rejected" ? "重新提交审核" : "提交审核"}
                    </Button>
                  </>
                ) : runtimeStatus === "inactive" && publishedRevision !== null && onEnable ? (
                  <Button
                    className="h-9 rounded-lg px-5 text-sm font-semibold"
                    disabled={!canOperate || lifecycleActionState !== "idle"}
                    onClick={() => void onEnable()}
                    type="button"
                  >
                    {lifecycleActionState === "enabling" ? "启用中" : "启用"}
                  </Button>
                ) : null}
                {hasUnpublishedChanges && currentReview?.status !== "pending" && currentReview?.status !== "approved" && !publishReady ? (
                  <Button
                    aria-label="发布检查"
                    className="size-9 rounded-lg text-destructive"
                    disabled={!canEdit}
                    onClick={onPublishCheck}
                    size="icon"
                    title="发布检查"
                    type="button"
                    variant="secondary"
                  >
                    <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.8} />
                  </Button>
                ) : null}
                {publishErrorCode === "conflict" && onReloadDocument ? (
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
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onReloadDocument}>
                        <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} />
                        重新加载
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      <WorkflowMetadataDialog
        metadata={{ description, name: workflowName }}
        onOpenChange={setMetadataDialogOpen}
        onSave={async metadata => await onUpdateMetadata?.(metadata) ?? false}
        open={metadataDialogOpen}
        pending={metadataUpdating}
      />
      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认发布当前版本</AlertDialogTitle>
            <AlertDialogDescription>
              发布后将生成正式版本且不改变当前启用状态；若存在进行中的客户，其后续节点可能使用新版本，已删除等待节点上的客户可能被清退
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPublishConfirmOpen(false);
                onPublish();
              }}
            >
              发布
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={withdrawConfirmOpen}
        onOpenChange={setWithdrawConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认撤回审核</AlertDialogTitle>
            <AlertDialogDescription>
              撤回后将结束本次审核并恢复画布编辑
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onWithdrawReview?.();
                setWithdrawConfirmOpen(false);
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

function getWorkflowStatusLabel({
  publishedRevision,
  runtimeStatus,
}: {
  publishedRevision: number | null;
  runtimeStatus: "active" | "inactive" | "paused" | "stopped";
}) {
  if (runtimeStatus === "stopped") return "已停止";
  if (publishedRevision === null) return "草稿";
  if (runtimeStatus === "active") return "运行中";
  if (runtimeStatus === "paused") return "待启用";
  return "未启用";
}

function getContentContextLabel(
  mode: "data" | "design",
  review: WorkflowPublishReview | null | undefined,
  publishedRevision: number | null,
  hasUnpublishedChanges: boolean,
) {
  if (mode === "design") {
    if (review?.status === "pending") return "待审核内容";
    if (review?.status === "approved") return "已审核内容";
    return null;
  }
  if (!hasUnpublishedChanges && review?.status !== "pending" && review?.status !== "approved") return null;
  return publishedRevision === null ? "暂无已发布版本" : "当前已发布版本数据";
}

function getRuntimeStatusClassName(
  status: "active" | "inactive" | "paused" | "stopped",
  publishedRevision: number | null,
) {
  return cn(
    "shrink-0 rounded-md px-1.5 py-0.5",
    status === "active" && publishedRevision !== null && "bg-success-muted text-success",
    status === "paused" && publishedRevision !== null && "bg-warning-muted text-warning",
    (status === "inactive" || publishedRevision === null) && "bg-muted text-muted-foreground",
    status === "stopped" && "bg-muted text-muted-foreground",
  );
}

function getSaveStateLabel(saveState: WorkflowDraftSaveStatus, lastSavedAt: string) {
  if (saveState === "error") return "保存失败";
  if (saveState === "dirty" || saveState === "saving") return "正在保存";
  return `已自动保存 ${lastSavedAt}`;
}
