import {
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  WORKFLOW_REVIEW_COMMENT_MAX_LENGTH,
  type WorkflowPublishReview,
} from "@chatai/contracts";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

export function WorkflowReviewPanel({
  onApprove,
  onClose,
  onReject,
  onRestore,
  onViewPublishedVersion,
  onWithdraw,
  pending,
  review,
}: {
  onApprove: (comment?: string) => Promise<boolean>;
  onClose: () => void;
  onReject: (reason: string) => Promise<boolean>;
  onRestore?: () => Promise<boolean>;
  onViewPublishedVersion?: () => void;
  onWithdraw: () => Promise<boolean>;
  pending: boolean;
  review: WorkflowPublishReview;
}) {
  const currentSubUserId = useAuthStore(state => state.subUser?.subUserId);
  const [comment, setComment] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const isSubmitter = currentSubUserId === review.submittedBySubUserId;
  const canDecide = review.status === "pending";
  const submitterLabel = isSubmitter ? "你" : "其他管理员";
  const reviewerLabel = currentSubUserId === review.reviewedBySubUserId ? "你" : "其他管理员";
  const hasStructuralChanges = review.changeSummary.triggerChanged
    || review.changeSummary.pathChanged
    || review.changeSummary.firstPublication
    || review.changeSummary.addedNodes.length > 0
    || review.changeSummary.changedNodes.length > 0
    || review.changeSummary.removedNodes.length > 0;

  return (
    <>
      <aside
        aria-label="发布审核"
        className="absolute bottom-3 right-3 top-3 z-20 flex w-[26.25rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-foreground/15 bg-[var(--workflow-panel-bg-blur)] shadow-[0_4px_12px_var(--shadow-soft)] backdrop-blur-[10px] max-lg:left-3 max-lg:w-auto"
      >
        <div className="flex items-start gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">发布审核</h2>
              <Badge className="h-6 rounded-md px-2 py-0 text-xs" variant="secondary">
                {getReviewStatusLabel(review.status)}
              </Badge>
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {submitterLabel}提交于 {formatReviewTime(review.submittedAt)}
            </p>
          </div>
          <Button
            aria-label="关闭审核"
            className="size-8 shrink-0 rounded-lg p-0"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          <section className="pt-1">
            <h3 className="text-sm font-semibold text-foreground">变更摘要</h3>
            <div className="mt-3 grid grid-cols-3 divide-x divide-border/70 rounded-[10px] bg-muted/65 py-3">
              <ReviewCount label="新增" tone="primary" value={review.changeSummary.addedNodes.length} />
              <ReviewCount label="修改" tone="warning" value={review.changeSummary.changedNodes.length} />
              <ReviewCount label="删除" tone="destructive" value={review.changeSummary.removedNodes.length} />
            </div>
            <div className="mt-4 grid gap-2.5 text-[13px] text-foreground">
              {review.changeSummary.triggerChanged ? <ReviewChangeItem>进入条件已变更</ReviewChangeItem> : null}
              {review.changeSummary.pathChanged ? <ReviewChangeItem>流程路径已变更</ReviewChangeItem> : null}
              {review.changeSummary.firstPublication ? <ReviewChangeItem>首次发布</ReviewChangeItem> : null}
              {!hasStructuralChanges ? <p className="text-muted-foreground">无结构变更</p> : null}
            </div>
            <ReviewNodeList label="新增节点" nodes={review.changeSummary.addedNodes} />
            <ReviewNodeList label="修改节点" nodes={review.changeSummary.changedNodes} />
            <ReviewNodeList label="删除节点" nodes={review.changeSummary.removedNodes} />
          </section>

          <section className="mt-6 border-t border-border/70 pt-5">
            <h3 className="text-sm font-semibold text-foreground">自动检查</h3>
            <div className="mt-3 flex items-center gap-2 text-[13px] font-medium text-success">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} strokeWidth={1.8} />
              <span>提交时检查已通过</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">检查于 {formatReviewTime(review.checkedAt)}</p>
          </section>

          {review.reviewedAt ? (
            <section className="mt-6 border-t border-border/70 pt-5">
              <h3 className="text-sm font-semibold text-foreground">
                {review.status === "rejected" ? "驳回结果" : "审核结果"}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {reviewerLabel}于 {formatReviewTime(review.reviewedAt)} {getReviewStatusLabel(review.status)}
              </p>
              {review.reviewComment ? (
                <p className="mt-3 whitespace-pre-wrap rounded-[8px] bg-muted/65 px-3 py-2.5 text-[13px] leading-5">
                  {review.reviewComment}
                </p>
              ) : null}
            </section>
          ) : null}

          {review.resultingRevision !== null ? (
            <section className="mt-6 border-t border-border/70 pt-5">
              <h3 className="text-sm font-semibold text-foreground">发布记录</h3>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="min-w-0 text-[13px] text-muted-foreground">
                  版本 {review.resultingRevision}
                  {review.publishedAt ? ` · ${formatReviewTime(review.publishedAt)}` : ""}
                </p>
                {onViewPublishedVersion ? (
                  <Button className="shrink-0" onClick={onViewPublishedVersion} size="sm" type="button" variant="secondary">
                    查看版本
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {canDecide ? (
            <section className="mt-6 border-t border-border/70 pt-5">
              <label className="text-sm font-semibold text-foreground" htmlFor="workflow-review-comment">
                {rejecting ? "驳回原因" : "审核意见"}
              </label>
              <Textarea
                aria-invalid={validationError || undefined}
                className="mt-3 min-h-32 resize-none"
                id="workflow-review-comment"
                maxLength={WORKFLOW_REVIEW_COMMENT_MAX_LENGTH}
                onChange={(event) => {
                  setComment(event.target.value);
                  setValidationError(false);
                }}
                placeholder={rejecting ? "请填写驳回原因" : "可填写审核意见"}
                value={comment}
                variant="soft"
              />
              <div className="mt-1.5 flex min-h-4 items-center justify-end gap-2 text-xs">
                {validationError ? <p className="mr-auto text-destructive">请填写驳回原因</p> : null}
                <span className="text-muted-foreground">
                  {comment.length}/{WORKFLOW_REVIEW_COMMENT_MAX_LENGTH}
                </span>
              </div>
            </section>
          ) : null}
        </div>

        {canDecide ? (
          <div className="flex justify-end gap-2 border-t border-border/70 bg-background/70 px-5 py-3.5">
            {isSubmitter ? (
              <Button disabled={pending} onClick={() => setWithdrawConfirmOpen(true)} type="button" variant="secondary">
                撤回审核
              </Button>
            ) : rejecting ? (
              <Button disabled={pending} onClick={() => setRejecting(false)} type="button" variant="secondary">
                取消
              </Button>
            ) : (
              <Button disabled={pending} onClick={() => setRejecting(true)} type="button" variant="secondary">
                <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} />
                驳回
              </Button>
            )}
            {rejecting ? (
              <Button
                disabled={pending}
                onClick={() => {
                  const reason = comment.trim();
                  if (!reason) {
                    setValidationError(true);
                    return;
                  }
                  void onReject(reason);
                }}
                type="button"
                variant="destructive"
              >
                确认驳回
              </Button>
            ) : (
              <Button disabled={pending} onClick={() => void onApprove(comment.trim() || undefined)} type="button">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />
                通过
              </Button>
            )}
          </div>
        ) : onRestore ? (
          <div className="flex justify-end border-t border-border/70 bg-background/70 px-5 py-3.5">
            <Button disabled={pending} onClick={() => setRestoreConfirmOpen(true)} type="button">
              还原到该版本
            </Button>
          </div>
        ) : null}
      </aside>
      <AlertDialog onOpenChange={setRestoreConfirmOpen} open={restoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认还原到该版本</AlertDialogTitle>
            <AlertDialogDescription>
              将把画布内容恢复到此历史版本，当前未保存/未发布的修改将被放弃，如需生效请还原后重新发布
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                setRestoreConfirmOpen(false);
                void onRestore?.();
              }}
            >
              确认还原
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={setWithdrawConfirmOpen} open={withdrawConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认撤回审核</AlertDialogTitle>
            <AlertDialogDescription>撤回后可重新编辑并再次提交审核</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                setWithdrawConfirmOpen(false);
                void onWithdraw();
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReviewCount({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "destructive" | "primary" | "warning";
  value: number;
}) {
  return (
    <div className="px-3 text-center">
      <p className={cn(
        "text-xl font-semibold leading-6 tabular-nums",
        tone === "primary" && "text-primary",
        tone === "warning" && "text-warning",
        tone === "destructive" && "text-destructive",
      )}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ReviewChangeItem({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2.5">
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </p>
  );
}

function ReviewNodeList({
  label,
  nodes,
}: {
  label: string;
  nodes: WorkflowPublishReview["changeSummary"]["addedNodes"];
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {nodes.map(node => (
          <Badge className="h-7 rounded-md px-2.5 py-0 text-xs" key={node.id} variant="secondary">
            {node.title}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function getReviewStatusLabel(status: WorkflowPublishReview["status"]) {
  return {
    approved: "审核通过",
    pending: "待审核",
    rejected: "审核驳回",
    withdrawn: "已撤回",
  }[status];
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
