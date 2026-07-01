import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { MessageForwardPreviewContent } from "@/pages/chat/components/message-forward/message-forward-preview-content";

type MessageForwardSelectedMessagesDialogProps = {
  messages: ChatMessage[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function MessageForwardSelectedMessagesDialog({
  messages,
  onOpenChange,
  open,
}: MessageForwardSelectedMessagesDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-divider px-5 py-4">
          <DialogTitle className="text-base">聊天记录</DialogTitle>
          <DialogDescription className="sr-only">
            查看将要逐条转发的消息列表
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(24rem,calc(100vh-8rem))]" role="region">
          <div className="space-y-0 py-2">
            {messages.map((message) => (
              <div
                className="border-b border-divider px-4 py-2 last:border-b-0"
                key={message.uiMessageKey}
              >
                <p className="mb-1 text-xs text-muted-foreground">
                  {message.senderDisplayName || message.sender.name || message.author}
                </p>
                <MessageForwardPreviewContent message={message} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
