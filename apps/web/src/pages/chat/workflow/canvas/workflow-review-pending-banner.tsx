import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function WorkflowReviewPendingBanner({
  onOpenReview,
}: {
  onOpenReview: () => void;
}) {
  return (
    <Alert
      aria-label="待审核"
      className="pointer-events-auto flex w-fit max-w-full items-center gap-3 rounded-full border-warning/60 bg-warning/5 py-2 px-5 text-foreground shadow-[0_8px_24px_var(--shadow-soft)] backdrop-blur-[10px] [&>svg]:translate-y-0 [&>svg]:text-warning"
      role="status"
    >
      <HugeiconsIcon
        aria-hidden="true"
        color="currentColor"
        icon={InformationCircleIcon}
        size={16}
        strokeWidth={1.8}
      />
      <AlertDescription className="flex-1 text-sm font-bold text-warning">
        内容待审核，画布已锁定，审核后可发布上线
      </AlertDescription>
      <Button
        className="shrink-0 border-warning/40 bg-background text-warning hover:bg-background hover:text-warning"
        onClick={onOpenReview}
        size="sm"
        type="button"
        variant="outline"
      >
        去审核
      </Button>
    </Alert>
  );
}
