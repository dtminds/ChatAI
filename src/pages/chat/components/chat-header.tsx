import { startTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/pages/chat/chat-types";

type ChatHeaderProps = {
  activeClaimStatus: "idle" | "claiming";
  activeConversation?: Conversation;
  activeMessageSeq: number;
  isClaimedByCurrentUser: boolean;
  isClaimedByOther: boolean;
  onClaimConversation: () => void | Promise<void>;
};

export function ChatHeader({
  activeClaimStatus,
  activeConversation,
  activeMessageSeq,
  isClaimedByCurrentUser,
  isClaimedByOther,
  onClaimConversation,
}: ChatHeaderProps) {
  return (
    <div className="flex min-h-[69px] items-center border-b border-[#EEEFF0] px-5 py-3">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[17px] font-semibold text-foreground">
              {activeConversation?.customerName ?? "请选择会话"}
            </p>
            <span className="text-sm font-medium text-[#2eaf63]">
              @微信
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            消息游标 {activeMessageSeq} · {activeConversation?.quietFor ?? "实时同步"}
          </p>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            className="h-9 rounded-lg border-[#d8dfea] bg-white px-3 text-[13px] shadow-none"
            disabled
            variant="outline"
          >
            查看历史
          </Button>
          <Button
            className="h-9 rounded-lg px-3 text-[13px] shadow-none"
            disabled={
              !activeConversation ||
              isClaimedByCurrentUser ||
              isClaimedByOther ||
              activeClaimStatus === "claiming"
            }
            onClick={() => {
              startTransition(() => {
                void onClaimConversation();
              });
            }}
          >
            {isClaimedByCurrentUser
              ? "已领取"
              : activeClaimStatus === "claiming"
                ? "领取中..."
                : "领取会话"}
          </Button>
        </div>
      </div>
    </div>
  );
}
