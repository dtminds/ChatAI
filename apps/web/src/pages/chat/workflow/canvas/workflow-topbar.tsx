import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  CloudSavingDone01Icon,
  Edit02Icon,
  HistoryIcon,
  InformationCircleIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
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
  canPublish = true,
  canRename = false,
  canRetrySave = false,
  description = "",
  hasUnpublishedChanges = false,
  isPreviewingVersion,
  lastSavedAt,
  metadataUpdating = false,
  onBack,
  onCloseVersionHistory,
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
  validatedForActivation = false,
  versionHistoryContent,
  versionHistoryOpen = false,
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
  onCloseVersionHistory?: () => void;
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
  versionHistoryContent?: ReactNode;
  versionHistoryOpen?: boolean;
  workflowName: string;
}) {
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const published = publishState === "published";
  const publishing = publishState === "publishing";
  const restoring = restoreState === "restoring";
  const readOnlyMode = Boolean(isPreviewingVersion);

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
              <Badge className={getRuntimeStatusClassName(runtimeStatus, validatedForActivation)}>
                {getRuntimeStatusLabel(runtimeStatus, validatedForActivation)}
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
              {hasUnpublishedChanges ? (
                <span className="inline-flex shrink-0 items-center gap-1 !rounded-[2px] bg-amber-50 px-1.5 py-0.5 text-amber-600">
                  <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={2} />
                  有尚未发布的修改
                </span>
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

      <WorkflowMetadataDialog
        metadata={{ description, name: workflowName }}
        onOpenChange={setMetadataDialogOpen}
        onSave={async metadata => await onUpdateMetadata?.(metadata) ?? false}
        open={metadataDialogOpen}
        pending={metadataUpdating}
      />
    </header>
  );
}

function getRuntimeStatusLabel(
  status: "active" | "inactive" | "paused" | "stopped",
  validatedForActivation: boolean,
) {
  if (status === "paused" || (status === "inactive" && validatedForActivation)) {
    return "待启用";
  }
  return {
    active: "运行中",
    inactive: "草稿",
    paused: "待启用",
    stopped: "已停止",
  }[status];
}

function getRuntimeStatusClassName(
  status: "active" | "inactive" | "paused" | "stopped",
  validatedForActivation: boolean,
) {
  const ready = status === "paused" || (status === "inactive" && validatedForActivation);
  return cn(
    "shrink-0 rounded-md px-1.5 py-0.5",
    status === "active" && "bg-emerald-50 text-emerald-700",
    status === "inactive" && !ready && "bg-muted text-muted-foreground",
    ready && "bg-warning-muted text-warning",
    status === "stopped" && "bg-muted text-muted-foreground",
  );
}

function getSaveStateLabel(saveState: WorkflowDraftSaveStatus, lastSavedAt: string) {
  if (saveState === "error") return "保存失败";
  if (saveState === "dirty" || saveState === "saving") return "正在保存";
  return `已自动保存 ${lastSavedAt}`;
}
