import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Separator } from "@/components/ui/separator";
import { ChatComposer } from "@/pages/chat/components/chat-composer";
import { ChatHeader } from "@/pages/chat/components/chat-header";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import { CustomerSidePanel } from "@/pages/chat/components/customer-side-panel";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import type {
  Conversation,
  CustomerProfile,
  Message,
} from "@/pages/chat/chat-types";
import type { WechatEmojiName } from "@/pages/chat/wechat-emoji";

type ChatPanelProps = {
  accountName?: string;
  activeClaimStatus: "idle" | "claiming";
  activeConversation?: Conversation;
  activeHistoryStatus: "idle" | "loading" | "error";
  activeMessageSeq: number;
  canSendMessage: boolean;
  composerHint?: string;
  customer?: CustomerProfile;
  customerPanelWidth: number;
  draft: string;
  inputEnterBehavior: InputEnterBehavior;
  isClaimedByCurrentUser: boolean;
  isClaimedByOther: boolean;
  isConversationLoading: boolean;
  isEmojiPickerOpen: boolean;
  isResizingCustomerPanel: boolean;
  messages: Message[];
  hasMoreHistory: boolean;
  onClaimConversation: () => void | Promise<void>;
  onCustomerPanelResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEmojiSelect: (name: WechatEmojiName) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onLoadOlderMessages: () => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (messageId: string) => void | Promise<void>;
  onSendDraft: () => void;
  scopeTransitionError?: string;
  messageListBottomRef: RefObject<HTMLDivElement | null>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  workbenchBodyRef: RefObject<HTMLDivElement | null>;
};

export function ChatPanel({
  accountName,
  activeClaimStatus,
  activeConversation,
  activeHistoryStatus,
  activeMessageSeq,
  canSendMessage,
  composerHint,
  customer,
  customerPanelWidth,
  draft,
  inputEnterBehavior,
  isClaimedByCurrentUser,
  isClaimedByOther,
  isConversationLoading,
  isEmojiPickerOpen,
  isResizingCustomerPanel,
  messages,
  hasMoreHistory,
  onClaimConversation,
  onCustomerPanelResizeStart,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEmojiSelect,
  onEnterBehaviorChange,
  onLoadOlderMessages,
  onMessageViewportScroll,
  onRetryMessage,
  onSendDraft,
  scopeTransitionError,
  messageListBottomRef,
  messageViewportRef,
  textareaRef,
  workbenchBodyRef,
}: ChatPanelProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-surface">
      <ChatHeader
        activeClaimStatus={activeClaimStatus}
        activeConversation={activeConversation}
        activeMessageSeq={activeMessageSeq}
        isClaimedByCurrentUser={isClaimedByCurrentUser}
        isClaimedByOther={isClaimedByOther}
        onClaimConversation={onClaimConversation}
      />

      <div className="flex min-h-0 min-w-0 flex-1" ref={workbenchBodyRef}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          <ChatMessagePanel
            activeHistoryStatus={activeHistoryStatus}
            hasMoreHistory={hasMoreHistory}
            isConversationLoading={isConversationLoading}
            messageListBottomRef={messageListBottomRef}
            messages={messages}
            messageViewportRef={messageViewportRef}
            onLoadOlderMessages={onLoadOlderMessages}
            onMessageViewportScroll={onMessageViewportScroll}
            onRetryMessage={onRetryMessage}
            scopeTransitionError={scopeTransitionError}
          />

          <Separator className="bg-divider" />

          <ChatComposer
            canSendMessage={canSendMessage}
            composerHint={composerHint}
            draft={draft}
            inputEnterBehavior={inputEnterBehavior}
            isEmojiPickerOpen={isEmojiPickerOpen}
            onDraftChange={onDraftChange}
            onEmojiPickerOpenChange={onEmojiPickerOpenChange}
            onEmojiSelect={onEmojiSelect}
            onEnterBehaviorChange={onEnterBehaviorChange}
            onSendDraft={onSendDraft}
            textareaRef={textareaRef}
          />
        </div>

        <CustomerSidePanel
          accountName={accountName}
          customer={customer}
          isResizing={isResizingCustomerPanel}
          onResizeStart={onCustomerPanelResizeStart}
          panelWidth={customerPanelWidth}
        />
      </div>
    </section>
  );
}
