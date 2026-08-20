import { Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkflowPublishReview } from "@chatai/contracts";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  WorkflowDraftRestoreStatus,
  WorkflowVersionHistoryItem,
} from "../workflow-draft-service";

export function WorkflowVersionHistoryPanel({
  canRestore,
  currentPreviewVersionId,
  loadMoreVersions,
  onClose,
  onExitPreview,
  onRestoreVersion,
  onSelectReview,
  onSelectVersion,
  loadReviews,
  nextVersionCursor,
  restoreState,
  versions,
}: {
  canRestore: boolean;
  currentPreviewVersionId?: string;
  loadMoreVersions: (cursor: string) => Promise<{
    items: WorkflowVersionHistoryItem[];
    nextCursor: string | null;
  }>;
  onClose: () => void;
  onExitPreview: () => void;
  onRestoreVersion: (versionId: string) => void;
  onSelectReview: (review: WorkflowPublishReview) => void;
  onSelectVersion: (version: WorkflowVersionHistoryItem) => void;
  loadReviews: (cursor?: string) => Promise<{
    items: WorkflowPublishReview[];
    nextCursor: string | null;
  }>;
  nextVersionCursor: string | null;
  restoreState: WorkflowDraftRestoreStatus;
  versions: WorkflowVersionHistoryItem[];
}) {
  const isRestoring = restoreState === "restoring";
  const selectedVersion = versions.find((version) => version.id === currentPreviewVersionId);
  const [activeTab, setActiveTab] = useState<"versions" | "reviews">("versions");
  const [restoreVersionId, setRestoreVersionId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WorkflowPublishReview[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsNextCursor, setReviewsNextCursor] = useState<string | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [reviewsError, setReviewsError] = useState(false);
  const [versionsError, setVersionsError] = useState(false);

  async function loadReviewPage(cursor?: string) {
    if (loadingReviews) return;
    setLoadingReviews(true);
    setReviewsError(false);
    try {
      const page = await loadReviews(cursor);
      setReviews(current => cursor ? appendUnique(current, page.items) : page.items);
      setReviewsNextCursor(page.nextCursor);
      setReviewsLoaded(true);
    } catch {
      setReviewsError(true);
    } finally {
      setLoadingReviews(false);
    }
  }

  async function loadVersionPage() {
    if (!nextVersionCursor || loadingVersions) return;
    setLoadingVersions(true);
    setVersionsError(false);
    try {
      await loadMoreVersions(nextVersionCursor);
    } catch {
      setVersionsError(true);
    } finally {
      setLoadingVersions(false);
    }
  }

  return (
    <div className="workflow-version-panel flex min-h-[17rem] max-h-[min(36rem,calc(100vh-5rem))] w-full flex-col overflow-hidden bg-popover text-popover-foreground">
      <div className="workflow-version-panel-header flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="workflow-version-panel-title text-[15px] font-bold leading-[22px] text-foreground">历史记录</h2>
        </div>
        <Button
          aria-label="关闭版本历史"
          className="size-8 shrink-0 rounded-lg"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </div>

      <Tabs
        className="px-3 pb-2"
        onValueChange={(value) => {
          const nextTab = value as "versions" | "reviews";
          setActiveTab(nextTab);
          if (nextTab === "reviews" && !reviewsLoaded && !loadingReviews) {
            void loadReviewPage();
          }
        }}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="versions">历史版本</TabsTrigger>
          <TabsTrigger value="reviews">审核记录</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="workflow-version-list min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
        {activeTab === "versions" && versions.length ? <>{versions.map((version, index) => {
          const isSelected = version.id === currentPreviewVersionId;
          const isLatest = index === 0;

          return (
            <button
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "workflow-version-item relative flex w-full min-w-0 gap-2 rounded-[10px] border-0 bg-transparent p-2 text-left text-inherit hover:bg-muted",
                isSelected && "workflow-version-item-selected bg-primary/10",
              )}
              key={version.id}
              onClick={() => onSelectVersion(version)}
              type="button"
            >
              {index < versions.length - 1 ? (
                <span className="workflow-version-line absolute left-[13px] top-[22px] h-[calc(100%-8px)] w-0.5 rounded-full bg-border" />
              ) : null}
              <span
                className={cn(
                  "workflow-version-dot z-[1] mt-1 size-2.5 shrink-0 rounded-full border-2 border-muted-foreground bg-popover",
                  isSelected && "border-primary",
                )}
              />
              <span className="workflow-version-content grid min-w-0 flex-1 gap-[3px]">
                <span className="workflow-version-name-row flex min-w-0 items-center gap-1.5">
                  <span className="workflow-version-name min-w-0 truncate text-[13px] font-bold leading-[18px] text-foreground">{version.name}</span>
                  {isLatest ? (
                    <span className="workflow-version-badge shrink-0 rounded-md border-[0.5px] border-primary/30 bg-primary/10 px-[5px] py-px text-[10px] font-bold leading-[14px] text-primary">
                      最新
                    </span>
                  ) : null}
                </span>
                <span className="workflow-version-meta truncate text-xs leading-[18px] text-muted-foreground">
                  {version.publishedAt}
                </span>
              </span>
            </button>
          );
        })}
          {nextVersionCursor || versionsError ? (
            <HistoryLoadMore
              error={versionsError}
              loading={loadingVersions}
              onClick={() => void loadVersionPage()}
            />
          ) : null}
        </> : activeTab === "versions" ? (
          <div className="workflow-version-empty flex min-h-40 items-center justify-center text-[13px] text-muted-foreground">
            <span>暂无历史版本</span>
          </div>
        ) : reviews.length ? <>{reviews.map(review => (
          <button
            className="block w-full rounded-lg px-2 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            key={review.id}
            onClick={() => onSelectReview(review)}
            type="button"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{getReviewHistoryLabel(review)}</span>
              <span className="text-[11px] text-muted-foreground">{formatReviewTime(review.submittedAt)}</span>
            </div>
            {review.reviewComment ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{review.reviewComment}</p>
            ) : null}
            {review.resultingRevision !== null ? (
              <p className="mt-1 text-xs text-muted-foreground">已发布：版本 {review.resultingRevision}</p>
            ) : null}
          </button>
        ))}
          {reviewsNextCursor || reviewsError ? (
            <HistoryLoadMore
              error={reviewsError}
              loading={loadingReviews}
              onClick={() => void loadReviewPage(reviewsNextCursor ?? undefined)}
            />
          ) : null}
        </> : loadingReviews || (!reviewsLoaded && !reviewsError) ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status">
            <Spinner size={14} variant="classic" />
            正在加载
          </div>
        ) : reviewsError ? (
          <HistoryLoadMore error loading={false} onClick={() => void loadReviewPage()} />
        ) : (
          <div className="flex min-h-40 items-center justify-center text-[13px] text-muted-foreground">暂无审核记录</div>
        )}
      </div>

      {activeTab === "versions" && selectedVersion ? (
        <div className="workflow-version-preview-actions grid gap-2.5 border-t-[0.5px] border-border px-3 pb-3 pt-2.5">
          <div className="workflow-version-preview-copy grid gap-0.5">
            <span className="workflow-version-preview-title text-[13px] font-bold leading-[18px] text-foreground">
              {selectedVersion.name}
            </span>
            <span className="workflow-version-preview-meta text-xs leading-[18px] text-muted-foreground">
              当前为只读预览
            </span>
          </div>
          <div className="workflow-version-action-row flex justify-end gap-2">
            <Button
              className="h-8 rounded-lg px-3 text-xs"
              onClick={onExitPreview}
              type="button"
              variant="secondary"
            >
              返回最新
            </Button>
            <Button
              className="h-8 rounded-lg px-3 text-xs"
              disabled={!canRestore || isRestoring}
              onClick={() => setRestoreVersionId(selectedVersion.id)}
              type="button"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} />
              {isRestoring ? "还原中" : "还原到该版本"}
            </Button>
          </div>
        </div>
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setRestoreVersionId(null);
        }}
        open={restoreVersionId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认还原到该版本</AlertDialogTitle>
            <AlertDialogDescription>
              将把画布内容恢复到此历史版本，当前未保存/未发布的修改将被放弃，如需生效请还原后重新发布
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRestoring}
              onClick={() => {
                if (restoreVersionId) onRestoreVersion(restoreVersionId);
                setRestoreVersionId(null);
              }}
            >
              确认还原
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HistoryLoadMore({
  error,
  loading,
  onClick,
}: {
  error: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-center px-2 py-2">
      <Button disabled={loading} onClick={onClick} size="sm" type="button" variant="secondary">
        {loading ? (
          <>
            <Spinner size={14} variant="classic" />
            正在加载
          </>
        ) : error ? "重试" : "加载更多"}
      </Button>
    </div>
  );
}

function appendUnique<T extends { id: string }>(current: T[], incoming: T[]) {
  const knownIds = new Set(current.map(item => item.id));
  return [...current, ...incoming.filter(item => !knownIds.has(item.id))];
}

function getReviewHistoryLabel(review: WorkflowPublishReview) {
  return {
    approved: "审核通过",
    pending: "待审核",
    rejected: "审核驳回",
    withdrawn: "审核已撤回",
  }[review.status];
}

function formatReviewTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}
