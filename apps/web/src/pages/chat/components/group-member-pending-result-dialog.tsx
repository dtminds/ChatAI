import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type GroupMemberPendingResultKind = "kick" | "pull";

const PENDING_RESULT_COPY: Record<GroupMemberPendingResultKind, string> = {
  kick: "已发起移出群聊请求，预计在1分钟内执行，请稍后刷新查看",
  pull: "已发出入群邀请，预计在1分钟内执行，请稍后刷新查看",
};

export function GroupMemberPendingResultDialog({
  kind,
  onOpenChange,
  open,
}: {
  kind: GroupMemberPendingResultKind;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  // Keep last kind while closed so the Radix exit animation does not flash pull copy.
  const displayedKindRef = useRef(kind);
  if (open) {
    displayedKindRef.current = kind;
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {PENDING_RESULT_COPY[displayedKindRef.current]}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>我知道了</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
