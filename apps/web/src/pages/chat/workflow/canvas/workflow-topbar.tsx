import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Edit02Icon,
  MoreHorizontalIcon,
  Time02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  isPreviewingVersion,
  lastSavedAt,
  onBack,
  onExitPreview,
  onOpenVersionHistory,
  onPublish,
  onPublishCheck,
  onReloadDocument,
  onRename,
  onRetrySave,
  onRestoreVersion,
  previewVersionLabel,
  previewVersionMeta,
  publishedAt,
  publishErrorCode,
  publishState,
  publishReady,
  readyChecks,
  renaming = false,
  restoreState,
  saveState,
  totalChecks,
  validatedForActivation = false,
  workflowName,
}: {
  canPublish?: boolean;
  canRename?: boolean;
  canRetrySave?: boolean;
  isPreviewingVersion?: boolean;
  lastSavedAt: string;
  onBack?: () => void;
  onExitPreview?: () => void;
  onOpenVersionHistory: () => void;
  onPublish: () => void;
  onPublishCheck: () => void;
  onReloadDocument?: () => void;
  onRename?: (name: string) => Promise<boolean>;
  onRetrySave?: () => void;
  onRestoreVersion?: () => void;
  previewVersionLabel?: string;
  previewVersionMeta?: string;
  publishedAt: string | null;
  publishErrorCode?: WorkflowRepositoryErrorCode;
  publishState: WorkflowDraftPublishStatus;
  publishReady: boolean;
  readyChecks: number;
  renaming?: boolean;
  restoreState?: WorkflowDraftRestoreStatus;
  saveState: WorkflowDraftSaveStatus;
  totalChecks: number;
  validatedForActivation?: boolean;
  workflowName: string;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(workflowName);
  const published = publishState === "published";
  const publishing = publishState === "publishing";
  const restoring = restoreState === "restoring";
  const readOnlyMode = Boolean(isPreviewingVersion);

  useEffect(() => {
    if (!editingName) {
      setNameValue(workflowName);
    }
  }, [editingName, workflowName]);

  const cancelRename = () => {
    if (renaming) return;
    setNameValue(workflowName);
    setEditingName(false);
  };

  const submitRename = async () => {
    const normalizedName = nameValue.trim();

    if (!normalizedName) return;
    if (normalizedName === workflowName) {
      setEditingName(false);
      return;
    }

    if (onRename && await onRename(normalizedName)) {
      setEditingName(false);
    }
  };

  return (
    <header className="workflow-canvas-topbar z-[12] flex min-h-16 shrink-0 items-center justify-between gap-4 border-b bg-background px-4 py-2 max-sm:flex-wrap max-sm:px-3">
      <div className="flex min-w-0 items-center gap-3 max-sm:w-full">
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
            <div className="flex min-w-0 items-center gap-1">
              {editingName ? (
                <Input
                  aria-label="Workflow 名称"
                  autoFocus
                  className="h-8 w-[min(20rem,50vw)] rounded-md px-2 text-sm font-semibold"
                  maxLength={80}
                  onBlur={cancelRename}
                  onChange={(event) => setNameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                  readOnly={renaming}
                  value={nameValue}
                />
              ) : (
                <h1 className="truncate text-base font-semibold">{workflowName}</h1>
              )}
              {canRename && !editingName ? (
                <Button
                  aria-label="重命名 Workflow"
                  className="size-7 shrink-0 rounded-md text-muted-foreground"
                  onClick={() => setEditingName(true)}
                  size="icon"
                  title="重命名 Workflow"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
                </Button>
              ) : null}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
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
              <span aria-hidden="true">·</span>
              <span className={cn("truncate", publishErrorCode && "text-destructive")}>
                {getPublishStateLabel({ publishedAt, publishErrorCode, validatedForActivation })}
              </span>
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
    </header>
  );
}

function getSaveStateLabel(saveState: WorkflowDraftSaveStatus, lastSavedAt: string) {
  if (saveState === "error") return "保存失败";
  if (saveState === "dirty" || saveState === "saving") return "正在保存";
  return `已自动保存 ${lastSavedAt}`;
}

function getPublishStateLabel({
  publishedAt,
  publishErrorCode,
  validatedForActivation,
}: {
  publishedAt: string | null;
  publishErrorCode?: WorkflowRepositoryErrorCode;
  validatedForActivation: boolean;
}) {
  if (publishErrorCode) return publishErrorCode === "conflict" ? "发布冲突" : "发布失败";
  if (publishedAt) return `已发布 ${publishedAt}`;
  if (validatedForActivation) return "已发布，待启用";
  return "未发布";
}
