import { useState } from "react";
import { toast } from "sonner";
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
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import type { GroupMember } from "@/pages/chat/chat-types";
import { resolveErrorMessage } from "@/pages/chat/lib/error-message";

export function RemoveGroupMemberDialog({
  conversationId,
  member,
  onOpenChange,
  onRemoved,
  open,
}: {
  conversationId?: string;
  member: GroupMember | null;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
  open: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayName = member?.displayName.trim() || "该成员";

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) {
      return;
    }
    if (!nextOpen) {
      setIsSubmitting(false);
    }
    onOpenChange(nextOpen);
  }

  async function handleConfirm(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!conversationId || !member || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await getWorkbenchService().kickGroupMember(conversationId, {
        kickOutThirdUserId: member.id,
      });
      onRemoved?.();
      setIsSubmitting(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "操作失败，请稍后重试"));
      setIsSubmitting(false);
    }
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>确认将“{displayName}”移出群聊？</AlertDialogTitle>
          <AlertDialogDescription>
            该操作无法撤回，请谨慎操作
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSubmitting}
            onClick={handleConfirm}
            variant="destructive"
          >
            确定
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
