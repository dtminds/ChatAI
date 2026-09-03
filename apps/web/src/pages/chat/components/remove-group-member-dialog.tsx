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
import type { GroupMember } from "@/pages/chat/chat-types";

export function RemoveGroupMemberDialog({
  member,
  onOpenChange,
  open,
}: {
  member: GroupMember | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const displayName = member?.displayName.trim() || "该成员";

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>确认将“{displayName}”移出群聊？</AlertDialogTitle>
          <AlertDialogDescription>
            该操作无法撤回，请谨慎操作
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => onOpenChange(false)} variant="destructive">
            确定
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
