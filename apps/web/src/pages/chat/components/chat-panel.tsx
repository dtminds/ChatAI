import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { LexicalEditor } from "lexical";
import { Separator } from "@/components/ui/separator";
import { ChatComposer } from "@/pages/chat/components/chat-composer";
import { ChatHeader } from "@/pages/chat/components/chat-header";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import { CustomerSidePanel } from "@/pages/chat/components/customer-side-panel";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import type {
  Conversation,
  CustomerProfile,
  GroupMember,
  Message,
} from "@/pages/chat/chat-types";
import type { MentionInsertPosition } from "@/pages/chat/components/chat-composer";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";

type ChatPanelProps = {
  accountName?: string;
  activeConversation?: Conversation;
  activeHistoryStatus: "idle" | "loading" | "error";
  canSendMessage: boolean;
  composerPlaceholder: string;
  customer?: CustomerProfile;
  customerPanelWidth: number;
  draft: string;
  groupMembers: GroupMember[];
  inputEnterBehavior: InputEnterBehavior;
  isConversationLoading: boolean;
  isEmojiPickerOpen: boolean;
  isResizingCustomerPanel: boolean;
  mentionInsertPosition: MentionInsertPosition;
  messages: Message[];
  selectedMentionMembers: GroupMember[];
  hasMoreHistory: boolean;
  onCustomerPanelResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onMentionInsertPositionChange: (position: MentionInsertPosition) => void;
  onRemoveMentionMember: (memberId: string) => void;
  onSelectMentionMember: (member: GroupMember, triggerStart: number, triggerEnd: number) => void;
  onLoadOlderMessages: () => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (messageId: string) => void | Promise<void>;
  onSendDraft: (segments: ComposerSegment[]) => void;
  scopeTransitionError?: string;
  messageListBottomRef: RefObject<HTMLDivElement | null>;
  messageViewportRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<LexicalEditor | null>;
  workbenchBodyRef: RefObject<HTMLDivElement | null>;
};

export function ChatPanel({
  accountName,
  activeConversation,
  activeHistoryStatus,
  canSendMessage,
  composerPlaceholder,
  customer,
  customerPanelWidth,
  draft,
  groupMembers,
  inputEnterBehavior,
  isConversationLoading,
  isEmojiPickerOpen,
  isResizingCustomerPanel,
  mentionInsertPosition,
  messages,
  selectedMentionMembers,
  hasMoreHistory,
  onCustomerPanelResizeStart,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEnterBehaviorChange,
  onMentionInsertPositionChange,
  onRemoveMentionMember,
  onSelectMentionMember,
  onLoadOlderMessages,
  onMessageViewportScroll,
  onRetryMessage,
  onSendDraft,
  scopeTransitionError,
  messageListBottomRef,
  messageViewportRef,
  composerRef,
  workbenchBodyRef,
}: ChatPanelProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-surface">
      <ChatHeader
        activeConversation={activeConversation}
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
            draft={draft}
            groupMembers={groupMembers}
            isGroupConversation={activeConversation?.mode === "group"}
            inputEnterBehavior={inputEnterBehavior}
            isEmojiPickerOpen={isEmojiPickerOpen}
            mentionInsertPosition={mentionInsertPosition}
            onDraftChange={onDraftChange}
            onEmojiPickerOpenChange={onEmojiPickerOpenChange}
            onEnterBehaviorChange={onEnterBehaviorChange}
            onMentionInsertPositionChange={onMentionInsertPositionChange}
            onRemoveMentionMember={onRemoveMentionMember}
            onSelectMentionMember={onSelectMentionMember}
            onSendDraft={onSendDraft}
            selectedMentionMembers={selectedMentionMembers}
            placeholder={composerPlaceholder}
            composerRef={composerRef}
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
