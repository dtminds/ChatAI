import {
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkflowPublishReview } from "@chatai/contracts";
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
import { useAuthStore } from "@/store/auth-store";

export function WorkflowReviewPanel({
  onApprove,
  onClose,
  onReject,
  onWithdraw,
  pending,
  review,
}: {
  onApprove: (comment?: string) => Promise<boolean>;
  onClose: () => void;
  onReject: (reason: string) => Promise<boolean>;
  onWithdraw: () => Promise<boolean>;
  pending: boolean;
  review: WorkflowPublishReview;
}) {
  const currentSubUserId = useAuthStore(state => state.subUser?.subUserId);
  const [comment, setComment] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const isSubmitter = currentSubUserId === review.submittedBySubUserId;
  const canDecide = review.status === "pending";
  const submitterLabel = isSubmitter ? "你" : "其他管理员";
  const reviewerLabel = currentSubUserId === review.reviewedBySubUserId ? "你" : "其他管理员";

  return (
    <>
      <aside className="absolute inset-y-0 right-0 z-20 flex w-[360px] max-w-full flex-col border-l bg-background shadow-lg">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">发布审核</h2>
            <Badge variant="secondary">{getReviewStatusLabel(review.status)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{submitterLabel}提交于 {formatReviewTime(review.submittedAt)}</p>
        </div>
        <Button aria-label="关闭审核" onClick={onClose} size="icon" type="button" variant="ghost">
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section>
          <h3 className="text-xs font-medium text-muted-foreground">变更摘要</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ReviewCount label="新增" value={review.changeSummary.addedNodes.length} />
            <ReviewCount label="修改" value={review.changeSummary.changedNodes.length} />
            <ReviewCount label="删除" value={review.changeSummary.removedNodes.length} />
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {review.changeSummary.triggerChanged ? <p>进入条件已变更</p> : null}
            {review.changeSummary.pathChanged ? <p>流程路径已变更</p> : null}
            {review.changeSummary.firstPublication ? <p>首次发布</p> : null}
            {!review.changeSummary.triggerChanged
              && !review.changeSummary.pathChanged
              && !review.changeSummary.firstPublication
              && review.changeSummary.addedNodes.length === 0
              && review.changeSummary.changedNodes.length === 0
              && review.changeSummary.removedNodes.length === 0 ? (
                <p className="text-muted-foreground">无结构变更</p>
              ) : null}
          </div>
          <ReviewNodeList label="新增节点" nodes={review.changeSummary.addedNodes} />
          <ReviewNodeList label="修改节点" nodes={review.changeSummary.changedNodes} />
          <ReviewNodeList label="删除节点" nodes={review.changeSummary.removedNodes} />
        </section>

        <section className="mt-5 border-t pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">自动检查</h3>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <HugeiconsIcon className="text-success" icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} />
            <span>提交时检查已通过</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">检查于 {formatReviewTime(review.checkedAt)}</p>
        </section>

        {review.reviewedAt ? (
          <section className="mt-5 border-t pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">
              {review.status === "rejected" ? "驳回结果" : "审核结果"}
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {reviewerLabel}于 {formatReviewTime(review.reviewedAt)} {getReviewStatusLabel(review.status)}
            </p>
            {review.reviewComment ? (
              <p className="mt-2 whitespace-pre-wrap text-sm">{review.reviewComment}</p>
            ) : null}
          </section>
        ) : null}

        {canDecide ? (
          <section className="mt-5 border-t pt-4">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="workflow-review-comment">
              {rejecting ? "驳回原因" : "审核意见"}
            </label>
            <Textarea
              aria-invalid={validationError || undefined}
              className="mt-2 min-h-24 resize-none"
              id="workflow-review-comment"
              onChange={(event) => {
                setComment(event.target.value);
                setValidationError(false);
              }}
              placeholder={rejecting ? "请填写驳回原因" : "可填写审核意见"}
              value={comment}
            />
            {validationError ? <p className="mt-1 text-xs text-destructive">请填写驳回原因</p> : null}
          </section>
        ) : null}
      </div>

      {canDecide ? (
        <div className="flex justify-end gap-2 border-t px-4 py-3">
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
      ) : null}
      </aside>
      <AlertDialog onOpenChange={setWithdrawConfirmOpen} open={withdrawConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认撤回审核</AlertDialogTitle>
            <AlertDialogDescription>撤回后将结束本次审核并恢复画布编辑</AlertDialogDescription>
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

function ReviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
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
    <div className="mt-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {nodes.map(node => (
          <Badge key={node.id} variant="secondary">{node.title}</Badge>
        ))}
      </div>
    </div>
  );
}

function getReviewStatusLabel(status: WorkflowPublishReview["status"]) {
  return {
    approved: "审核通过",
    obsolete: "已失效",
    pending: "待审核",
    published: "已发布",
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
